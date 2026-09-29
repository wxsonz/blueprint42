import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../src/parse';
import { fileCap, fnCaps } from '../src/norm';
import { setupParser } from './helpers';

beforeAll(setupParser);

// A Norm-shaped function with `inner` lines between its braces.
function fn(name: string, inner: number, params = 'void', vars = 1): string {
  const decls = Array.from({ length: vars }, (_, k) => `\tint\tv${k};\n`).join('');
  const sets = Array.from({ length: Math.max(0, inner - vars - 2) }, (_, k) => `\tv0 = ${k};\n`).join('');
  return `int\t${name}(${params})\n{\n${decls}\n${sets}\treturn (0);\n}\n`;
}

function norminette(src: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'b42-norm-'));
  const file = join(dir, 'x.c');
  writeFileSync(file, src);
  try {
    return [...execFileSync('norminette', [file], { encoding: 'utf8' }).matchAll(/Error: (\w+)/g)].map((m) => m[1]);
  } catch (e) {
    return [...String((e as { stdout?: string }).stdout ?? '').matchAll(/Error: (\w+)/g)].map((m) => m[1]);
  }
}

let hasNorminette = true;
try {
  execFileSync('norminette', ['--version'], { encoding: 'utf8' });
} catch {
  hasNorminette = false;
}

describe('Norm capacity', () => {
  it('counts the lines between the braces, the params and the vars (statics included)', () => {
    const src = `int\tf(int a, int b)\n{\n\tint\t\t\tx;\n\tstatic int\ty;\n\n\tx = a;\n\ty = b;\n\treturn (x + y);\n}\n`;
    const m = parse(src);
    const c = fnCaps(m.byName.get('f')!);
    expect(c).toEqual({ lines: { used: 6, max: 25 }, params: { used: 2, max: 4 }, vars: { used: 2, max: 5 } });
    expect(fnCaps(parse(fn('g', 25)).byName.get('g')!).lines.used).toBe(25);
  });

  it('counts definitions per file, not prototypes', () => {
    const src = `int\tp(void);\n${fn('a', 3)}${fn('b', 3)}`;
    expect(fileCap(parse(src), '')).toEqual({ used: 2, max: 5 });
  });

  it.skipIf(!hasNorminette)('agrees with norminette at each limit', () => {
    for (const inner of [25, 26]) {
      const src = fn('f', inner);
      const over = fnCaps(parse(src).byName.get('f')!).lines.used > 25;
      expect(norminette(src).includes('TOO_MANY_LINES')).toBe(over);
    }
    for (const vars of [5, 6]) {
      const src = fn('f', 10, 'void', vars);
      const over = fnCaps(parse(src).byName.get('f')!).vars.used > 5;
      expect(norminette(src).includes('TOO_MANY_VARS_FUNC')).toBe(over);
    }
    for (const n of [4, 5]) {
      const src = fn('f', 4, Array.from({ length: n }, (_, k) => `int p${k}`).join(', '));
      const over = fnCaps(parse(src).byName.get('f')!).params.used > 4;
      expect(norminette(src).includes('TOO_MANY_ARGS')).toBe(over);
    }
    for (const n of [5, 6]) {
      const src = Array.from({ length: n }, (_, k) => fn(`f${k}`, 3)).join('\n');
      const over = fileCap(parse(src), '').used > 5;
      expect(norminette(src).includes('TOO_MANY_FUNCS')).toBe(over);
    }
  });
});
