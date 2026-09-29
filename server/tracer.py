# Runs inside gdb (gdb -x tracer.py). Steps the program line by line and
# writes a JSON timeline: every stop's user stack with variable values,
# statics, live heap blocks, and the calls / returns / mallocs / frees that
# happened since the previous stop. Config comes from $FTB_CFG.
import json
import shutil
import os
import threading
import tty
import re
import shlex
import time

import gdb

CFG = json.load(open(os.environ["FTB_CFG"]))
USER = set(CFG["fns"])
MAX_STEPS = CFG["max_steps"]
DEADLINE = time.monotonic() + CFG.get("max_seconds", 20)
ROOT = os.path.realpath(CFG.get("root", "."))
BINDINGS = CFG.get("bindings", [])
SAFE_EXPR = re.compile(r"^[A-Za-z_]\w*(?:(?:\.|->)[A-Za-z_]\w*|\[(?:\d+|[A-Za-z_]\w*)\])*$")

for cmd in (
    "set pagination off", "set confirm off", "set width 0", "set height 0",
    "set print pretty off", "set print elements 24", "set print repeats 8",
    "set debuginfod enabled off", "set disable-randomization on",
    "set breakpoint pending on", "set startup-with-shell on",
    # one return breakpoint per live frame: leave them in memory between steps
    # instead of inserting and removing all of them every time (gdb still
    # shows the original bytes underneath)
    "set breakpoint always-inserted on",
):
    try:
        gdb.execute(cmd, to_string=True)
    except gdb.error:
        pass

# The program sees itself as ./a.out, as when run from a terminal after cc,
# not as the temp path it was built at (argv[0] would show that folder).
if shutil.which("bash"):
    try:
        gdb.execute("set exec-wrapper bash -c 'exec -a ./a.out \"$0\" \"$@\"'", to_string=True)
    except gdb.error:
        pass

pending = []          # events since the last stop, in execution order
heap = {}             # addr -> {"id", "size", "line"}
next_block = [1]
returned = {}         # frame id -> serialized return value (or None for void)
state = {"exit": None, "signal": None}
INF = gdb.selected_inferior


def on_exit(ev):
    state["exit"] = getattr(ev, "exit_code", None)


def on_stop(ev):
    if isinstance(ev, gdb.SignalEvent) and ev.stop_signal not in ("SIGTRAP", "0"):
        state["signal"] = ev.stop_signal


gdb.events.exited.connect(on_exit)
gdb.events.stop.connect(on_stop)


def alive():
    try:
        return INF().pid != 0 and state["exit"] is None
    except gdb.error:
        return False


def caller_line(frame):
    try:
        return frame.find_sal().line
    except Exception:
        return None


_rel = {}


def rel_path(symtab):
    """A symtab's file relative to the project root, or None outside it."""
    if symtab is None:
        return None
    try:
        full = symtab.fullname()
    except Exception:
        return None
    if full not in _rel:
        real = os.path.realpath(full)
        _rel[full] = os.path.relpath(real, ROOT) if real.startswith(ROOT + os.sep) else None
    return _rel[full]


def frame_file(frame):
    try:
        return rel_path(frame.find_sal().symtab)
    except Exception:
        return None


_sources = {}


def source_lines(path):
    if path not in _sources:
        try:
            _sources[path] = open(os.path.join(ROOT, path)).read().splitlines()
        except OSError:
            _sources[path] = []
    return _sources[path]


# ---------------- values ----------------

# Memory read once per stop (the stack, the heap's span): reads that fall
# inside are served from these copies. The inferior is stopped, so they are
# exact; they are dropped as soon as it runs again.
regions = []  # [(start, bytes)]


def read_bytes(addr, size):
    for start, blob in regions:
        if start <= addr and addr + size <= start + len(blob):
            return blob[addr - start:addr - start + size]
    try:
        return INF().read_memory(addr, size).tobytes()
    except Exception:
        return None


def load_regions():
    regions.clear()
    try:
        sp = int(gdb.parse_and_eval("$sp"))
    except gdb.error:
        sp = None
    live = (frame_cache.get(fr["id"]) for fr in frames)
    top = max((a + n for c in live if c for _k, a, n, _t in c["vars"] if a is not None and sp is not None and a >= sp), default=None)
    if sp is not None and top is not None and top - sp <= 8 << 20:
        blob = read_bytes(sp, top - sp)
        if blob is not None:
            regions.append((sp, blob))
    if heap:
        lo = min(heap)
        hi = max(a + min(b["size"], 1 << 16) for a, b in heap.items())
        total = sum(min(b["size"], 1 << 16) for b in heap.values())
        if hi - lo <= max(4 * total, 1 << 16) and hi - lo <= 16 << 20:
            blob = read_bytes(lo, hi - lo)
            if blob is not None:
                regions.append((lo, blob))


def ser(v, depth=0):
    """A gdb.Value as plain JSON: int / ptr (+ string preview) / struct / array."""
    t = v.type.strip_typedefs()
    code = t.code
    out = {"type": str(v.type)}
    try:
        if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR, gdb.TYPE_CODE_BOOL, gdb.TYPE_CODE_ENUM):
            out["kind"] = "int"
            out["v"] = int(v)
        elif code == gdb.TYPE_CODE_PTR:
            out["kind"] = "ptr"
            out["v"] = int(v)
            target = t.target().strip_typedefs()
            if out["v"] and target.sizeof == 1 and target.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR):
                raw = read_bytes(out["v"], 24)
                if raw is not None:
                    out["str"] = raw.split(b"\0")[0].decode("latin-1")
                    out["strFull"] = b"\0" in raw
            elif out["v"] and is_charp(target):
                # a char ** (argv, a split's result): the strings it points at,
                # up to the NULL that ends the list, 8 at most
                size = target.sizeof
                ps = read_bytes(out["v"], size * 8)
                if ps is not None:
                    strs, full = [], False
                    for i in range(8):
                        q = int.from_bytes(ps[i * size:(i + 1) * size], "little")
                        if not q:
                            full = True
                            break
                        raw = read_bytes(q, 24)
                        strs.append(raw.split(b"\0")[0].decode("latin-1") if raw is not None else "?")
                    out["strs"] = strs
                    out["strsFull"] = full
            elif out["v"] and depth < 1 and target.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
                # what a struct pointer carries: its pointee's fields, one level deep
                try:
                    out["deref"] = ser(v.dereference(), depth + 1)
                except (gdb.MemoryError, gdb.error):
                    pass
        elif code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION) and depth < 2:
            out["kind"] = "struct"
            out["fields"] = [dict(ser(v[f.name], depth + 1), name=f.name) for f in t.fields() if f.name]
        elif code == gdb.TYPE_CODE_ARRAY and depth < 2:
            out["kind"] = "array"
            lo, hi = t.range()
            n = hi - lo + 1
            out["len"] = n
            elem = t.target().strip_typedefs()
            items = []
            if n <= 16:
                items = [dict(ser(v[i], depth + 1), index=i) for i in range(n)]
            else:
                # Large arrays: only the elements that are not all-zero bytes.
                base = int(v.address) if v.address is not None else None
                raw = read_bytes(base, t.sizeof) if base is not None else None
                es = elem.sizeof
                for i in range(n):
                    if raw is None or any(raw[i * es:(i + 1) * es]):
                        items.append(dict(ser(v[i], depth + 1), index=i))
                        if len(items) >= 8:
                            break
            out["items"] = items
            out["elem"] = elem.sizeof
        else:
            out["kind"] = "raw"
            out["text"] = str(v)
    except gdb.MemoryError:
        out["kind"] = "raw"
        out["text"] = "<unreadable>"
    return out


cache = {}  # key -> (bytes, serialized)


def is_charp(t):
    if t.code != gdb.TYPE_CODE_PTR:
        return False
    tgt = t.target().strip_typedefs()
    return tgt.sizeof == 1 and tgt.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR)


def strings_in(t, blob):
    """The 24-byte previews behind a struct's char * fields."""
    out = b""
    for f in t.fields():
        ft = f.type.strip_typedefs()
        if f.name and is_charp(ft) and f.bitpos % 8 == 0:
            off = f.bitpos // 8
            p = int.from_bytes(blob[off:off + 8], "little") if len(blob) >= off + 8 else 0
            out += (read_bytes(p, 24) or b"") if p else b""
    return out


def seen_bytes(t, raw):
    """Everything a variable's record shows: its bytes, plus what the picture
    shows through it (a string, a struct's fields and their strings), so the
    record is rebuilt when any of that changes while the variable doesn't."""
    if raw is None:
        return None
    if is_charp(t):
        target = int.from_bytes(raw, "little")
        return raw + (read_bytes(target, 24) or b"") if target else raw
    if t.code == gdb.TYPE_CODE_PTR:
        tgt = t.target().strip_typedefs()
        target = int.from_bytes(raw, "little")
        if target and tgt.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            blob = read_bytes(target, min(tgt.sizeof, 256)) or b""
            return raw + blob + strings_in(tgt, blob)
        return raw
    if t.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
        return raw + strings_in(t, raw)
    return raw


def var_record(key, name, v):
    t = v.type.strip_typedefs()
    addr = int(v.address) if v.address is not None else None
    size = t.sizeof
    raw = seen_bytes(t, read_bytes(addr, size) if addr is not None and size <= 1 << 16 else None)
    hit = cache.get(key)
    if hit is not None and raw is not None and hit[0] == raw:
        rec = hit[1]
    else:
        rec = dict(ser(v), name=name, addr=addr, size=size)
        if t.code == gdb.TYPE_CODE_ARRAY:
            rec["elem"] = t.target().strip_typedefs().sizeof
        cache[key] = (raw, rec)
    return rec


def frame_vars(frame, fid):
    out = []
    entries = []
    try:
        block = frame.block()
    except RuntimeError:
        return out
    seen = set()
    while block is not None:
        for sym in block:
            if not (sym.is_argument or sym.is_variable) or sym.name in seen:
                continue
            if sym.addr_class == gdb.SYMBOL_LOC_STATIC:
                continue  # function-local statics are reported with the statics
            seen.add(sym.name)
            try:
                v = sym.value(frame)
                rec = var_record(f"{fid}.{sym.name}", sym.name, v)
                out.append(rec)
                entries.append((f"{fid}.{sym.name}", rec["addr"], rec["size"], v.type.strip_typedefs()))
            except Exception:
                pass
        if block.function is not None:
            break
        block = block.superblock
    frame_cache[fid] = {"vars": entries}
    return out


# A waiting caller's variables keep their addresses for the frame's life; what
# its records show changes only when these bytes do (seen_bytes: the value,
# plus a string or struct it points at). A frame whose bytes are all the same
# is not re-read through gdb or re-sent.
frame_cache = {}  # frame id -> {"vars": [(key, addr, size, type)]}


def frame_unchanged(fid):
    c = frame_cache.get(fid)
    if c is None:
        return False
    for key, addr, size, t in c["vars"]:
        if addr is None or size > 1 << 16:
            return False
        hit = cache.get(key)
        if hit is None or hit[0] is None or seen_bytes(t, read_bytes(addr, size)) != hit[0]:
            return False
    return True


STATICS = []  # (owner function or "", owner's file, symbol)


def function_symbols(fn):
    """Every definition of fn: two files may each have their own static one."""
    found = []
    try:
        g = gdb.lookup_global_symbol(fn)
        if g is not None:
            found.append(g)
    except Exception:
        pass
    try:
        found.extend(gdb.lookup_static_symbols(fn))
    except Exception:
        try:
            s = gdb.lookup_static_symbol(fn)
            if s is not None:
                found.append(s)
        except Exception:
            pass
    return found


def collect_statics():
    seen = set()
    for fn in USER:
        for sym in function_symbols(fn):
            try:
                block = gdb.block_for_pc(int(sym.value().address))
            except Exception:
                continue
            file = rel_path(sym.symtab)
            if block is None or file is None:
                continue
            for s in block:
                if s.is_variable and s.addr_class == gdb.SYMBOL_LOC_STATIC and (fn, file, s.name) not in seen:
                    seen.add((fn, file, s.name))
                    STATICS.append((fn, file, s))
            # sub-blocks are not iterable directly; function-level statics are enough here
    try:
        blk = gdb.selected_frame().block()
        for glob in (blk.static_block, blk.global_block):
            for s in glob:
                if s.is_variable and rel_path(s.symtab) is not None and ("", "", s.name) not in seen:
                    seen.add(("", "", s.name))
                    STATICS.append(("", rel_path(s.symtab), s))
    except Exception:
        pass


# Delta encoding: a stop carries only the records that changed since they
# were last sent (var_record returns the same object while the bytes are
# unchanged). src/gdb.ts expandStops() rebuilds full stops on the client.
last_sent = {}
seen_frames = set()


def changed(key, rec):
    if last_sent.get(key) is rec:
        return False
    last_sent[key] = rec
    return True


def statics_now():
    out = []
    for owner, file, s in STATICS:
        try:
            key = f"s.{owner}.{file}.{s.name}"
            rec = var_record(key, s.name, s.value())
            if changed(key, rec):
                out.append(dict(rec, owner=owner, ownerFile=file))
        except Exception:
            pass
    return out


def heap_now():
    """Live block ids, plus the blocks whose contents changed since last sent."""
    out, ids = [], []
    for addr, b in sorted(heap.items(), key=lambda kv: kv[1]["id"]):
        ids.append(b["id"])
        raw = read_bytes(addr, min(b["size"], 48))
        if raw is None:
            continue  # the process is gone; keep the last contents
        hexed = raw.hex()
        if last_sent.get(("heap", b["id"])) == hexed:
            continue
        last_sent[("heap", b["id"])] = hexed
        out.append({"id": b["id"], "addr": addr, "size": b["size"], "hex": hexed, "line": b["line"], "file": b.get("file")})
    return out, ids


def bound_delta(bound):
    """Only the sprite samples that changed since last sent."""
    out = {}
    for sid, value in bound.items():
        encoded = json.dumps(value, sort_keys=True)
        if last_sent.get(("bound", sid)) != encoded:
            last_sent[("bound", sid)] = encoded
            out[sid] = value
    return out


# ---------------- breakpoints: returns and the heap ----------------

class Ret(gdb.FinishBreakpoint):
    def __init__(self, frame, fid):
        super().__init__(frame, internal=True)
        self.fid = fid

    def stop(self):
        try:
            rv = self.return_value
            val = ser(rv) if rv is not None else None
        except Exception:
            val = None
        returned[self.fid] = val
        pending.append({"k": "ret", "id": self.fid, "value": val})
        return False

    def out_of_scope(self):
        pass


def is_user(frame):
    try:
        return frame.name() in USER and frame_file(frame) is not None
    except gdb.error:
        return False


def user_caller():
    try:
        caller = gdb.newest_frame().older()
        return caller if caller is not None and is_user(caller) else None
    except Exception:
        return None


seen_hits = set()  # gdb can report one libc breakpoint twice while stepping over a call
step_no = [0]


def first_hit(kind):
    try:
        key = (kind, int(gdb.parse_and_eval("$rdi")), int(gdb.parse_and_eval("*(unsigned long *)$sp")), step_no[0])
    except Exception:
        return True
    if key in seen_hits:
        return False
    seen_hits.add(key)
    return True


alloc_wait = []  # an allocation whose return value the loop still has to collect


class Alloc(gdb.Breakpoint):
    # Breakpoints can't be created inside stop(), so this one really stops;
    # the stepping loop then runs `finish` to read the returned address.
    def __init__(self, spec):
        super().__init__(spec, internal=True)
        self.kind = spec

    def stop(self):
        caller = user_caller()
        if caller is None or not first_hit(self.kind):
            return False
        try:
            a = int(gdb.parse_and_eval("$rdi"))
            b = int(gdb.parse_and_eval("$rsi"))
            size, old = {"malloc": (a, 0), "calloc": (a * b, 0), "realloc": (b, a)}[self.kind]
        except Exception:
            return False
        alloc_wait.append({"size": size, "old": old, "line": caller_line(caller), "file": frame_file(caller)})
        return True


def collect_alloc():
    w = alloc_wait.pop()
    gdb.execute("finish", to_string=True)
    try:
        addr = int(gdb.parse_and_eval("$rax"))
    except Exception:
        addr = 0
    if w["old"] and w["old"] in heap and addr:
        b = heap.pop(w["old"])
        pending.append({"k": "free", "id": b["id"]})
    if addr:
        bid = next_block[0]
        next_block[0] += 1
        heap[addr] = {"id": bid, "size": w["size"], "line": w["line"], "file": w["file"]}
        pending.append({"k": "alloc", "id": bid, "addr": addr, "size": w["size"], "line": w["line"], "file": w["file"]})


class Free(gdb.Breakpoint):
    def __init__(self):
        super().__init__("free", internal=True)

    def stop(self):
        caller = user_caller()
        if caller is None or not first_hit("free"):
            return False
        try:
            addr = int(gdb.parse_and_eval("$rdi"))
        except Exception:
            return False
        if addr in heap:
            b = heap.pop(addr)
            pending.append({"k": "free", "id": b["id"]})
        elif addr:
            pending.append({"k": "badfree", "addr": addr, "line": caller_line(caller), "file": frame_file(caller)})
        return False


# ---------------- output: printf's buffer and write ----------------
# Where stdout goes decides glibc's buffering, so the trace runs the way the
# author picked: into a pseudo-terminal (line-buffered: a printf's text
# leaves at each \n) or into a file, like a pipe (fully buffered: it leaves
# when the buffer fills, at exit, or on fflush). Every byte that really
# leaves goes through write(2); a breakpoint there sees it, and whether the
# user's code called write or libc was flushing printf's buffer.

TERMINAL = bool(CFG.get("terminal", True))
pty_out = {"master": None, "slave": None, "chunks": [], "thread": None}


def open_terminal():
    master, slave = os.openpty()
    tty.setraw(slave)  # no \n -> \r\n: the bytes as the program wrote them
    pty_out["master"], pty_out["slave"] = master, slave

    def drain():  # keep reading, so a chatty program never blocks on a full pty
        while True:
            try:
                data = os.read(master, 65536)
            except OSError:
                return
            if not data:
                return
            pty_out["chunks"].append(data)

    t = threading.Thread(target=drain, daemon=True)
    t.start()
    pty_out["thread"] = t
    return os.ttyname(slave)


def close_terminal():
    if pty_out["slave"] is None:
        return
    try:
        os.close(pty_out["slave"])
    except OSError:
        pass
    if pty_out["thread"]:
        pty_out["thread"].join(timeout=1)
    try:
        os.close(pty_out["master"])
    except OSError:
        pass
    with open(CFG["stdout"], "wb") as fh:
        fh.write(b"".join(pty_out["chunks"]))


OUT_TEXT_MAX = 2048


class Write(gdb.Breakpoint):
    # Never stops: reads write(fd, buf, n)'s arguments on the way in.
    def __init__(self):
        super().__init__("write", internal=True)

    def stop(self):
        try:
            fd = int(gdb.parse_and_eval("$rdi"))
            if fd not in (1, 2):
                return False
            addr = int(gdb.parse_and_eval("$rsi"))
            n = int(gdb.parse_and_eval("$rdx"))
            key = ("write", fd, addr, n, int(gdb.parse_and_eval("*(unsigned long *)$sp")), step_no[0])
        except Exception:
            return False
        if key in seen_hits:
            return False
        seen_hits.add(key)
        caller = user_caller()
        raw = read_bytes(addr, min(n, OUT_TEXT_MAX)) if n > 0 else b""
        ev = {"k": "out", "fd": fd, "n": n, "text": (raw or b"").decode("utf-8", "replace"), "via": "write" if caller is not None else "printf"}
        if fd == 1:
            out_total[0] += n
        if caller is not None:
            ev["line"], ev["file"] = caller_line(caller), frame_file(caller)
        pending.append(ev)
        return False


# glibc's FILE, x86-64 (public ABI, stable): _IO_write_base at 32,
# _IO_write_ptr at 40, _IO_buf_base at 56, _IO_buf_end at 64. The bytes
# between write_base and write_ptr are printf's text still waiting.
X86_64 = False
last_buf = [None]


def stdout_buffer():
    if not X86_64:
        return None
    try:
        fp = int(gdb.parse_and_eval("(unsigned long) stdout"))
        if not fp:
            return None
        raw = read_bytes(fp + 32, 40)
        if raw is None:
            return None
        wbase, wptr, _wend, bbase, bend = (int.from_bytes(raw[i:i + 8], "little") for i in range(0, 40, 8))
        cap = bend - bbase if bbase and bend > bbase else 0
        n = wptr - wbase if wbase and wptr >= wbase else 0
        data = read_bytes(wbase, min(n, OUT_TEXT_MAX)) if n else b""
        return {"text": (data or b"").decode("utf-8", "replace"), "n": n, "cap": cap}
    except (gdb.error, ValueError):
        return None


# ---------------- windows: step silently up to `from` ----------------

W_FROM = float("inf") if CFG.get("overview") else int((CFG.get("window") or {}).get("from") or 0)
W_TO = (CFG.get("window") or {}).get("to")
W_TO = int(W_TO) if W_TO is not None else None
FP_EVERY = 1000
fingerprints = []  # every FP_EVERY steps: where the run was, and how much it had printed
out_total = [0]  # bytes written to stdout so far, whole run
out_before = {"text": [], "n": 0}  # stdout before the window (kept, up to a limit)
pre_mode = [False]  # the window's first stop: its frames and blocks already existed


def fingerprint(k):
    try:
        f = gdb.newest_frame()
        return {"step": k, "fn": f.name(), "line": f.find_sal().line, "out": out_total[0]}
    except gdb.error:
        return {"step": k, "fn": None, "line": None, "out": out_total[0]}


def drain_silent():
    for e in pending:
        if e["k"] == "out" and e["fd"] == 1 and out_before["n"] < 1 << 16:
            out_before["text"].append(e["text"])
            out_before["n"] += len(e["text"])
    pending.clear()


def start_window():
    drain_silent()
    pre_mode[0] = True
    for addr, b in sorted(heap.items(), key=lambda kv: kv[1]["id"]):
        pending.append({"k": "alloc", "id": b["id"], "addr": addr, "size": b["size"], "line": b["line"], "file": b.get("file"), "pre": True})


# ---------------- the stepping loop ----------------

frames = []   # [{"id", "fn", "frame"}] oldest first
next_frame = [1]
stops = []
local_kinds = {}  # frame id -> {name: is_argument}
last_top = [None]  # the top frame's id at the previous stop
defined_locals = set()  # (frame id, name), only after an executed assignment
previous_lines = {}  # frame id -> previous stop's source line


def local_symbols(frame):
    found = {}
    try:
        block = frame.block()
        while block is not None:
            for sym in block:
                if (sym.is_argument or sym.is_variable) and sym.addr_class != gdb.SYMBOL_LOC_STATIC and sym.name not in found:
                    found[sym.name] = bool(sym.is_argument)
            if block.function is not None:
                break
            block = block.superblock
    except (gdb.error, RuntimeError):
        pass
    return found


def line_assigns(line, name):
    n = re.escape(name)
    return bool(re.search(r"(^|[^\w.>])" + n + r"\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)|(?:\+\+|--)\s*" + n + r"\b|\b" + n + r"\s*(?:\+\+|--)", line))


def frame_sp(f):
    try:
        return int(f.read_register("sp"))
    except (gdb.error, ValueError):
        return None


def user_stack():
    """The user frames, oldest first. Walks from the newest frame only until
    it reaches one it already knows (by its stack pointer, unique per live
    frame, recursion included): everything older than that is unchanged."""
    known = {fr["sp"]: i for i, fr in enumerate(frames) if fr.get("sp") is not None}
    new = []
    f = gdb.newest_frame()
    while f is not None:
        if is_user(f):
            j = known.get(frame_sp(f))
            if j is not None and frames[j]["frame"] == f:
                return [fr["frame"] for fr in frames[:j + 1]] + new[::-1]
            new.append(f)
        f = f.older()
    return new[::-1]


def eval_expr(expr, scope):
    if scope != "global":
        return gdb.parse_and_eval(expr)
    # Resolve the root explicitly so a local with the same name cannot shadow
    # a file-scope object while a function frame is selected.
    root = re.match(r"[A-Za-z_]\w*", expr).group()
    symbol = gdb.lookup_global_symbol(root)
    if symbol is None:
        symbol = gdb.lookup_static_symbol(root)
    if symbol is None:
        raise gdb.error("global symbol is unavailable")
    value = symbol.value()
    rest = expr[len(root):]
    while rest:
        member = re.match(r"(->|\.)([A-Za-z_]\w*)", rest)
        if member:
            if member.group(1) == "->":
                value = value.dereference()
            value = value[member.group(2)]
            rest = rest[len(member.group()):]
            continue
        index = re.match(r"\[(\d+|[A-Za-z_]\w*)\]", rest)
        if not index:
            raise gdb.error("unsupported expression")
        subscript = index.group(1)
        if not subscript.isdecimal():
            subscript = int(eval_expr(subscript, "global"))
        value = value[int(subscript)]
        rest = rest[len(index.group()):]
    return value


def eval_bound(sprite, selected, fid):
    binding = sprite.get("binding") or {}
    expr = binding.get("expr", "").strip()
    if not SAFE_EXPR.fullmatch(expr):
        return {"bound": False, "error": "unsupported expression"}
    scope = binding.get("scope")
    def initialized(expression):
        root = re.match(r"[A-Za-z_]\w*", expression).group()
        names = [root] + re.findall(r"\[([A-Za-z_]\w*)\]", expression)
        return scope != "fn" or all(name not in local_kinds.get(fid, {}) or (fid, name) in defined_locals for name in names)
    if not initialized(expr):
        return {"bound": False, "error": "local is not initialized"}
    try:
        selected.select()
        v = eval_expr(expr, scope)
        t = v.type.strip_typedefs()
        out = {"bound": True, "value": str(v)[:160]}
        if t.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR, gdb.TYPE_CODE_BOOL, gdb.TYPE_CODE_ENUM):
            out["number"] = int(v)
        elif t.code == gdb.TYPE_CODE_PTR:
            out["pointer"] = int(v)
        markers = []
        for marker in sprite.get("markers") or []:
            marker_expr = marker.get("expr", "").strip()
            if not SAFE_EXPR.fullmatch(marker_expr) or not initialized(marker_expr):
                continue
            try:
                index = int(eval_expr(marker_expr, scope))
                if -(1 << 30) <= index <= 1 << 30:
                    markers.append({"label": marker.get("label", "")[:40], "index": index})
            except (gdb.error, ValueError, TypeError):
                pass
        if markers:
            out["markers"] = markers
        length_expr = sprite.get("lengthExpr")
        if sprite.get("kind") == "strip":
            if not isinstance(length_expr, str) or not SAFE_EXPR.fullmatch(length_expr.strip()) or not initialized(length_expr.strip()):
                return {"bound": False, "error": "strip length is unavailable"}
            length = int(eval_expr(length_expr.strip(), scope))
            if not 0 <= length <= 1 << 30:
                return {"bound": False, "error": "strip length is out of range"}
            if t.code == gdb.TYPE_CODE_PTR:
                addr = int(v)
            elif t.code == gdb.TYPE_CODE_ARRAY and v.address is not None:
                addr = int(v.address)
                out["pointer"] = addr
            else:
                return {"bound": False, "error": "strip data is not an array or pointer"}
            if addr == 0:
                return {"bound": False, "error": "strip data is null"}
            raw = read_bytes(addr, min(length, 256)) if length else b""
            if raw is None:
                return {"bound": False, "error": "strip data is unreadable"}
            out["length"] = length
            out["bytes"] = list(raw)
        return out
    except (gdb.error, ValueError, TypeError, gdb.MemoryError) as e:
        return {"bound": False, "error": str(e)[:120]}


def bindings_now(cur):
    if not BINDINGS:
        return {}
    saved = gdb.selected_frame()
    bound = {}
    try:
        for sprite in BINDINGS:
            binding = sprite.get("binding") or {}
            if binding.get("scope") == "fn":
                want_file = binding.get("file")
                selected = next((f for f in reversed(cur) if f.name() == binding.get("fn") and (not want_file or frame_file(f) == want_file)), None)
            else:
                selected = cur[0] if cur else None
            fid = next((fr["id"] for fr in reversed(frames) if fr["frame"] == selected), None) if selected is not None else None
            bound[sprite["id"]] = eval_bound(sprite, selected, fid) if selected is not None else {"bound": False}
    finally:
        try:
            saved.select()
        except gdb.error:
            pass
    return bound


def record_stop():
    global frames
    cur = user_stack()
    keep = 0
    while keep < len(frames) and keep < len(cur) and frames[keep]["id"] not in returned and frames[keep]["frame"] == cur[keep]:
        keep += 1
    # frames that vanished without their finish breakpoint firing (exit, longjmp)
    for gone in reversed(frames[keep:]):
        if gone["id"] not in returned:
            returned[gone["id"]] = None
            pending.append({"k": "ret", "id": gone["id"], "value": None})
    for gone in frames[keep:]:
        frame_cache.pop(gone["id"], None)
    frames = frames[:keep]
    for f in cur[keep:]:
        fid = next_frame[0]
        next_frame[0] += 1
        frames.append({"id": fid, "fn": f.name(), "file": frame_file(f), "frame": f, "sp": frame_sp(f)})
        pending.append({"k": "call", "id": fid, "fn": f.name(), "file": frame_file(f), **({"pre": True} if pre_mode[0] else {})})
        try:
            Ret(f, fid)
        except Exception:
            pass
    load_regions()
    out_frames = []
    for i, fr in enumerate(frames):
        f = fr["frame"]
        fid = fr["id"]
        # the top frame, a new one, or the one that was on top a stop ago are
        # always read in full; a waiting caller only when its bytes changed
        if i < len(frames) - 1 and fid in seen_frames and fid != last_top[0] and frame_unchanged(fid):
            continue
        symbols = local_symbols(f)
        local_kinds[fid] = symbols
        line = previous_lines.get(fid)
        lines = source_lines(fr["file"]) if fr["file"] else []
        source = lines[line - 1] if line is not None and 1 <= line <= len(lines) else ""
        for name, is_argument in symbols.items():
            if is_argument or line_assigns(source, name):
                defined_locals.add((fid, name))
        previous_lines[fid] = caller_line(f)
        sent = [v for v in frame_vars(f, fid) if changed(f"{fid}.{v['name']}", v)]
        out_frames.append({"id": fid, "fn": fr["fn"], "file": fr["file"], "line": caller_line(f), "vars": sent, "delta": fid in seen_frames})
        seen_frames.add(fid)
    heap_blocks, heap_ids = heap_now()
    regions.clear()
    pre_mode[0] = False
    last_top[0] = frames[-1]["id"] if frames else None
    stops.append({
        "line": out_frames[-1]["line"] if out_frames and frames and out_frames[-1]["id"] == frames[-1]["id"] else None,
        "file": out_frames[-1]["file"] if out_frames and frames and out_frames[-1]["id"] == frames[-1]["id"] else None,
        "events": pending[:],
        "frames": out_frames,
        "stack": [fr["id"] for fr in frames],
        "statics": statics_now(),
        "heap": heap_blocks,
        "heapIds": heap_ids,
        "bound": bound_delta(bindings_now(cur)),
    })
    buf = stdout_buffer()
    if buf != last_buf[0]:
        stops[-1]["stdbuf"] = buf
        last_buf[0] = buf
    pending.clear()


def main():
    global X86_64
    result = {"stops": stops, "truncated": False, "exit": None, "signal": None, "error": None, "outMode": "terminal" if TERMINAL else "pipe"}
    try:
        gdb.execute("break main", to_string=True)
        args = " ".join(shlex.quote(a) for a in CFG.get("args", []))
        q = shlex.quote
        out = open_terminal() if TERMINAL else CFG["stdout"]
        gdb.execute(f"run {args} < {q(CFG['stdin'])} > {q(out)} 2> {q(CFG['stderr'])}", to_string=True)
    except gdb.error as e:
        result["error"] = str(e)
        return result
    if not alive():
        result["error"] = "the program exited before reaching main"
        return result
    try:
        has_lines = gdb.selected_frame().find_sal().symtab is not None
    except gdb.error:
        has_lines = False
    if not has_lines:
        result["error"] = "main has no debug info: was it built with -g? (a Makefile that calls cc directly instead of $(CC) drops it)"
        return result
    for spec in ("malloc", "calloc", "realloc"):
        Alloc(spec)
    Free()
    try:
        X86_64 = "x86-64" in gdb.selected_inferior().architecture().name()
    except Exception:
        X86_64 = False
    Write()
    collect_statics()

    # Step k is the k-th time round this loop, the same in every mode, so a
    # window [from, to] is exactly those steps of this run. Before `from` the
    # loop steps silently: nothing is serialized, but the heap and output
    # breakpoints keep their state, so the window starts from the real one.
    k = 0
    recorded = 0
    while alive():
        silent = k < W_FROM
        if k % FP_EVERY == 0:
            fingerprints.append(fingerprint(k))
        if silent:
            drain_silent()
            if time.monotonic() > DEADLINE:
                result["truncated"] = True
                break
        else:
            if k == W_FROM and W_FROM > 0:
                start_window()
            record_stop()
            recorded += 1
            if W_TO is not None and k >= W_TO:
                result["truncated"] = True
                break
            if recorded >= MAX_STEPS or time.monotonic() > DEADLINE:
                result["truncated"] = True
                break
        k += 1
        step_no[0] += 1
        try:
            gdb.execute("step", to_string=True)
            # an allocation stopped the step: collect its address, then finish the step
            while alloc_wait and alive() and not state["signal"]:
                collect_alloc()
                gdb.execute("step", to_string=True)
        except gdb.error:
            break
        if state["signal"]:
            break
        # stepped into code without line info that did not return (e.g. a crash in libc)
        try:
            if alive() and gdb.newest_frame().find_sal().symtab is None:
                gdb.execute("finish", to_string=True)
        except gdb.error:
            pass

    result["steps"] = k  # the steps reached (a run that exited: all of them)
    result["fingerprints"] = fingerprints
    result["window"] = {"from": W_FROM if W_FROM != float("inf") else None, "to": k}
    if W_FROM > 0:
        result["outBefore"] = "".join(out_before["text"])
    if W_FROM == float("inf") or k < W_FROM:
        # the overview, or a run that ended (or ran out of time) before its window
        drain_silent()
        result["overview"] = W_FROM == float("inf")
        result["exit"] = state["exit"]
        result["signal"] = state["signal"]
        return result
    if state["signal"]:
        result["signal"] = state["signal"]
        record_stop()
    elif not result["truncated"]:
        # the program exited: every remaining frame has returned
        for gone in reversed(frames):
            if gone["id"] not in returned:
                pending.append({"k": "ret", "id": gone["id"], "value": None})
        heap_blocks, heap_ids = heap_now()
        stops.append({"line": None, "events": pending[:], "frames": [], "statics": [], "heap": heap_blocks, "heapIds": heap_ids,
                      "bound": bound_delta({sid: {"bound": False} for sid in (b["id"] for b in BINDINGS)}), "exited": True})
        pending.clear()
    result["exit"] = state["exit"]
    return result


try:
    RESULT = main()
except Exception as e:  # never leave the caller without an answer
    RESULT = {"stops": stops, "error": f"tracer: {e!r}", "truncated": True}
try:
    if alive():
        gdb.execute("kill", to_string=True)
except gdb.error:
    pass
close_terminal()
with open(CFG["out"], "w") as fh:
    json.dump(RESULT, fh)
try:
    if alive():
        gdb.execute("kill", to_string=True)
except gdb.error:
    pass
gdb.execute("quit", to_string=True)
