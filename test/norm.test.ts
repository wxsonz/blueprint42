import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../src/parse';
import { fileCap, fnCaps, normMarks } from '../src/norm';
import { SAMPLES } from '../src/samples';
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

// The Norm's other rules, pinned on what norminette 3.3.59 reported for these
// files (rule, 1-based line); its columns count differently, so lines only.
describe('Norm marks', () => {
  const marks = (src: string) => normMarks(parse(src).tree, src).map((m) => [m.rule, m.line + 1]);
  it('forbidden statements, ternaries, a late declaration, a long line, no header', () => {
    const src = "int\tf(int a)\n{\n\tint\tx;\n\n\tx = a;\n\tfor (x = 0; x < 3; x++)\n\t\tx = x;\n\tdo\n\t\tx--;\n\twhile (x);\n\tswitch (a)\n\t{\n\t\tcase 1:\n\t\t\tbreak;\n\t}\n\tgoto end;\nend:\n\tx = a ? 1 : 2;\n\tint\ty;\n\ty = 1;\n\treturn (x + y + aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa);\n}\n";
    expect(marks(src)).toEqual([
      ['INVALID_HEADER', 1], ['FORBIDDEN_CS', 6],
      ['DO_WHILE', 8], // (the Norm's rule: norminette reports this loop's while line instead)
      ['FORBIDDEN_CS', 11], ['FORBIDDEN_CS', 13], ['GOTO_FBIDDEN', 16], ['LABEL_FBIDDEN', 17],
      ['TERNARY_FBIDDEN', 18], ['VAR_DECL_START_FUNC', 19], ['LINE_TOO_LONG', 21],
    ]);
  });
  it('declarations: a blank line before one, one in an inner block', () => {
    expect(marks("int\tg(int a)\n{\n\tint\tx;\n\n\tint\ty;\n\n\tx = a;\n\ty = a;\n\tif (x)\n\t{\n\t\tint\tz;\n\n\t\tz = 1;\n\t}\n\treturn (x + y);\n}\n")).toEqual([['INVALID_HEADER', 1], ['VAR_DECL_START_FUNC', 5], ['WRONG_SCOPE_VAR', 11]]);
  });
  it('a line of 80 columns passes, 81 doesn\'t (a tab reaches the next multiple of 4)', () => {
    const body = (w: number) => `int\tf(void)\n{\n\treturn (${'1'.repeat(w - 4 - 10)});\n}\n`;
    expect(marks(body(80)).map((m) => m[0])).not.toContain('LINE_TOO_LONG');
    expect(marks(body(81))).toContainEqual(['LINE_TOO_LONG', 3]);
  });
  it('the 42 header, as norminette matches it', () => {
    expect(marks("/* ************************************************************************** */\n/*                                                                            */\n/*                                                       :::      ::::::::    */\n/*   x.c                                                 :+:      :+:    :+:  */\n/*                                                   +:+ +:+         +:+      */\n/*   By: wxz <wxz@student.42.fr>                    +#+  +:+       +#+        */\n/*                                               +#+#+#+#+#+   +#+            */\n/*   Created: 2026/10/01 10:00:00 by wxz               #+#    #+#             */\n/*   Updated: 2026/10/01 10:00:00 by wxz              ###   ########.fr       */\n/*                                                                            */\n/* ************************************************************************** */\n\nint\tf(void)\n{\n\treturn (0);\n}\n")).toEqual([]);
  });
  it('the samples: only the header (norminette says the same of these rules)', () => {
    for (const s of SAMPLES) expect(marks(s.src).map((m) => m[0]), s.key).toEqual(['INVALID_HEADER']);
  });
});
