// The Norm's limits as capacity (docs/VISUALS.md, "Why the Norm makes this
// possible"), counted the way norminette counts them:
// - TOO_MANY_LINES: more than 25 physical lines between a function's braces;
// - TOO_MANY_ARGS: more than 4 named parameters;
// - TOO_MANY_VARS_FUNC: more than 5 variables, a local static included;
// - TOO_MANY_FUNCS: more than 5 function definitions in a .c file
//   (prototypes don't count).
import type { FnInfo, Model } from './parse';

export const NORM = { lines: 25, params: 4, vars: 5, fns: 5 } as const;

export interface Cap {
  used: number;
  max: number;
}

export interface FnCaps {
  lines: Cap;
  params: Cap;
  vars: Cap;
}

const memo = new WeakMap<FnInfo, FnCaps>();

export function fnCaps(fn: FnInfo): FnCaps {
  const hit = memo.get(fn);
  if (hit) return hit;
  const body = fn.node.childForFieldName('body');
  const lines = body ? Math.max(0, body.endPosition.row - body.startPosition.row - 1) : 0;
  const caps: FnCaps = {
    lines: { used: lines, max: NORM.lines },
    params: { used: fn.params.length, max: NORM.params },
    vars: { used: fn.locals.length + fn.statics.length, max: NORM.vars },
  };
  memo.set(fn, caps);
  return caps;
}

// Definitions in one file ('' for a single buffer).
export function fileCap(model: Model, file: string): Cap {
  return { used: model.fns.filter((f) => f.file === file).length, max: NORM.fns };
}
