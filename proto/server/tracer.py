# Runs inside gdb (gdb -x tracer.py). Steps the program line by line and
# writes a JSON timeline: every stop's user stack with variable values,
# statics, live heap blocks, and the calls / returns / mallocs / frees that
# happened since the previous stop. Config comes from $FTB_CFG.
import json
import os
import time

import gdb

CFG = json.load(open(os.environ["FTB_CFG"]))
USER = set(CFG["fns"])
MAX_STEPS = CFG["max_steps"]
DEADLINE = time.monotonic() + CFG.get("max_seconds", 20)
SRC = CFG["src_name"]

for cmd in (
    "set pagination off", "set confirm off", "set width 0", "set height 0",
    "set print pretty off", "set print elements 24", "set print repeats 8",
    "set debuginfod enabled off", "set disable-randomization on",
    "set breakpoint pending on", "set startup-with-shell on",
):
    try:
        gdb.execute(cmd, to_string=True)
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


# ---------------- values ----------------

def read_bytes(addr, size):
    try:
        return INF().read_memory(addr, size).tobytes()
    except Exception:
        return None


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
        elif code == gdb.TYPE_CODE_STRUCT and depth < 2:
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


def var_record(key, name, v):
    t = v.type.strip_typedefs()
    addr = int(v.address) if v.address is not None else None
    size = t.sizeof
    raw = read_bytes(addr, size) if addr is not None and size <= 1 << 16 else None
    is_charp = t.code == gdb.TYPE_CODE_PTR and t.target().strip_typedefs().sizeof == 1
    hit = cache.get(key)
    if hit is not None and raw is not None and hit[0] == raw and not is_charp:
        rec = hit[1]
    else:
        rec = dict(ser(v), name=name, addr=addr, size=size)
        if t.code == gdb.TYPE_CODE_ARRAY:
            rec["elem"] = t.target().strip_typedefs().sizeof
        cache[key] = (raw, rec)
    return rec


def frame_vars(frame, fid):
    out = []
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
                out.append(var_record(f"{fid}.{sym.name}", sym.name, sym.value(frame)))
            except Exception:
                pass
        if block.function is not None:
            break
        block = block.superblock
    return out


STATICS = []  # (owner function or "", symbol)


def collect_statics():
    seen = set()
    for fn in USER:
        try:
            sym = gdb.lookup_global_symbol(fn) or gdb.lookup_static_symbol(fn)
            if sym is None:
                continue
            block = gdb.block_for_pc(int(sym.value().address))
        except Exception:
            continue
        stack = [block]
        while stack:
            b = stack.pop()
            for s in b:
                if s.is_variable and s.addr_class == gdb.SYMBOL_LOC_STATIC and (fn, s.name) not in seen:
                    seen.add((fn, s.name))
                    STATICS.append((fn, s))
            # sub-blocks are not iterable directly; function-level statics are enough here
    try:
        blk = gdb.selected_frame().block()
        for glob in (blk.static_block, blk.global_block):
            for s in glob:
                if s.is_variable and s.symtab is not None and s.symtab.filename.endswith(SRC) and ("", s.name) not in seen:
                    seen.add(("", s.name))
                    STATICS.append(("", s))
    except Exception:
        pass


def statics_now():
    out = []
    for owner, s in STATICS:
        try:
            out.append(dict(var_record(f"s.{owner}.{s.name}", s.name, s.value()), owner=owner))
        except Exception:
            pass
    return out


def heap_now():
    out = []
    for addr, b in sorted(heap.items(), key=lambda kv: kv[1]["id"]):
        raw = read_bytes(addr, min(b["size"], 48)) or b""
        out.append({"id": b["id"], "addr": addr, "size": b["size"], "hex": raw.hex(), "line": b["line"]})
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


def user_caller():
    try:
        caller = gdb.newest_frame().older()
        return caller if caller is not None and caller.name() in USER else None
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
        alloc_wait.append({"size": size, "old": old, "line": caller_line(caller)})
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
        heap[addr] = {"id": bid, "size": w["size"], "line": w["line"]}
        pending.append({"k": "alloc", "id": bid, "addr": addr, "size": w["size"], "line": w["line"]})


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
            pending.append({"k": "badfree", "addr": addr, "line": caller_line(caller)})
        return False


# ---------------- the stepping loop ----------------

frames = []   # [{"id", "fn", "frame"}] oldest first
next_frame = [1]
stops = []


def user_stack():
    out = []
    f = gdb.newest_frame()
    while f is not None:
        try:
            if f.name() in USER:
                out.append(f)
        except gdb.error:
            pass
        f = f.older()
    out.reverse()
    return out


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
    frames = frames[:keep]
    for f in cur[keep:]:
        fid = next_frame[0]
        next_frame[0] += 1
        frames.append({"id": fid, "fn": f.name(), "frame": f})
        pending.append({"k": "call", "id": fid, "fn": f.name()})
        try:
            Ret(f, fid)
        except Exception:
            pass
    out_frames = []
    for fr in frames:
        f = fr["frame"]
        out_frames.append({"id": fr["id"], "fn": fr["fn"], "line": caller_line(f), "vars": frame_vars(f, fr["id"])})
    stops.append({
        "line": out_frames[-1]["line"] if out_frames else None,
        "events": pending[:],
        "frames": out_frames,
        "statics": statics_now(),
        "heap": heap_now(),
    })
    pending.clear()


def main():
    result = {"stops": stops, "truncated": False, "exit": None, "signal": None, "error": None}
    try:
        gdb.execute("break main", to_string=True)
        gdb.execute(f"run < {CFG['stdin']} > {CFG['stdout']} 2> {CFG['stderr']}", to_string=True)
    except gdb.error as e:
        result["error"] = str(e)
        return result
    if not alive():
        result["error"] = "the program exited before reaching main"
        return result
    for spec in ("malloc", "calloc", "realloc"):
        Alloc(spec)
    Free()
    collect_statics()

    steps = 0
    while alive():
        record_stop()
        steps += 1
        if steps >= MAX_STEPS or time.monotonic() > DEADLINE:
            result["truncated"] = True
            break
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

    if state["signal"]:
        result["signal"] = state["signal"]
        record_stop()
    elif not result["truncated"]:
        # the program exited: every remaining frame has returned
        for gone in reversed(frames):
            if gone["id"] not in returned:
                pending.append({"k": "ret", "id": gone["id"], "value": None})
        stops.append({"line": None, "events": pending[:], "frames": [], "statics": [], "heap": heap_now(), "exited": True})
        pending.clear()
    result["exit"] = state["exit"]
    return result


try:
    RESULT = main()
except Exception as e:  # never leave the caller without an answer
    RESULT = {"stops": stops, "error": f"tracer: {e!r}", "truncated": True}
with open(CFG["out"], "w") as fh:
    json.dump(RESULT, fh)
try:
    if alive():
        gdb.execute("kill", to_string=True)
except gdb.error:
    pass
gdb.execute("quit", to_string=True)
