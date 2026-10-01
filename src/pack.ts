// JSON for a trace, keeping what JSON drops (docs/OBJECTIVES.md, nice to
// have 10, the replay file): an object reached twice is written once and
// referenced after (snapshots share the frames and cells that didn't change,
// so plain JSON would copy each of them at every step), and Maps and Sets
// come back as Maps and Sets. unpack(pack(x)) has the same shape and the same
// sharing as x.
type Packed = { v: 1; objs: unknown[]; root: unknown };

export function pack(root: unknown): Packed {
  const ids = new Map<object, number>();
  const objs: unknown[] = [];
  const enc = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') {
      if (typeof x === 'number' && !Number.isFinite(x)) return { $n: String(x) }; // NaN, ±Infinity
      return x === undefined ? { $u: 1 } : x;
    }
    const seen = ids.get(x);
    if (seen !== undefined) return { $r: seen };
    const id = objs.length;
    ids.set(x, id);
    objs.push(null);
    objs[id] = x instanceof Map ? { $m: [...x].map(([k, v]) => [enc(k), enc(v)]) }
      : x instanceof Set ? { $s: [...x].map(enc) }
      : Array.isArray(x) ? x.map(enc)
      : Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).map(([k, v]) => [k, enc(v)]));
    return { $r: id };
  };
  return { v: 1, objs, root: enc(root) };
}

export function unpack(p: Packed): unknown {
  const out: unknown[] = new Array(p.objs.length);
  const isRef = (x: unknown): x is { $r: number } => !!x && typeof x === 'object' && !Array.isArray(x) && '$r' in x;
  // make every object first (so a reference to one not filled yet still works), then fill
  p.objs.forEach((o, i) => {
    const r = o as Record<string, unknown>;
    out[i] = '$m' in r ? new Map() : '$s' in r ? new Set() : Array.isArray(o) ? [] : {};
  });
  const dec = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (isRef(x)) return out[x.$r];
    const r = x as Record<string, unknown>;
    if ('$u' in r) return undefined;
    if ('$n' in r) return Number(r.$n);
    return x;
  };
  p.objs.forEach((o, i) => {
    const t = out[i];
    const r = o as Record<string, unknown>;
    if (t instanceof Map) for (const [k, v] of r.$m as [unknown, unknown][]) t.set(dec(k), dec(v));
    else if (t instanceof Set) for (const v of r.$s as unknown[]) t.add(dec(v));
    else if (Array.isArray(t)) for (const v of o as unknown[]) t.push(dec(v));
    else for (const [k, v] of Object.entries(r)) (t as Record<string, unknown>)[k] = dec(v);
  });
  return dec(p.root);
}
