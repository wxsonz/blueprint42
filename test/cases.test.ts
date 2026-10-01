// Test cases (docs/OBJECTIVES.md, nice to have 3).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { parse } from '../src/parse';
import { firstDiff, judge, sanitizeCases, type TestCase } from '../src/cases';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('test cases', () => {
  it('judges output: pass, the first byte that differs, missing and extra output', () => {
    const c: TestCase = { name: 'x', stdin: '', args: [], defines: [], expect: 'abc\n' };
    expect(judge(c, { stdout: 'abc\n', exit: 0 }).status).toBe('pass');
    expect(judge(c, { stdout: 'abd\n', exit: 0 })).toMatchObject({ status: 'fail', at: 2 });
    expect(judge(c, { stdout: 'ab', exit: 0 }).detail).toMatch(/stops at byte 2/);
    expect(judge(c, { stdout: 'abc\nzz', exit: 0 }).detail).toMatch(/extra output from byte 4/);
    expect(judge(c, { signal: 'SIGSEGV' }).status).toBe('crash');
    expect(judge(c, { truncated: true }).status).toBe('cut');
    expect(judge({ ...c, expect: undefined }, { stdout: 'x', exit: 3 }).status).toBe('ran');
    expect(firstDiff('same', 'same')).toBe(-1);
    expect(sanitizeCases([{ name: 'ok', stdin: 's', args: ['a', 3], defines: ['GOOD=1', 'bad flag'] }, 7])).toEqual([{ name: 'ok', stdin: 's', args: ['a'], defines: ['GOOD=1'] }]);
  });

  it("runs the reader's three cases: two pass, the one that fails on purpose says where", async () => {
    const s = sample('reader');
    const m = parse(s.src);
    const verdicts = [];
    for (const c of s.cases!) {
      const r = await handleTrace({ src: s.src, files: s.files, fns: m.fns.map((f) => f.name), stdin: c.stdin, args: c.args, defines: c.defines, terminal: false });
      expect(r.ok, r.error ?? r.compile?.text).toBe(true);
      verdicts.push(judge(c, { stdout: r.stdout, exit: r.exit, signal: r.signal, truncated: r.truncated }));
    }
    expect(verdicts.map((v) => v.status)).toEqual(['pass', 'pass', 'fail']);
    expect(verdicts[2]).toMatchObject({ at: 2 });
    expect(verdicts[2].detail).toMatch(/byte 2 differs: expected "a\\nB\\n", got "a\\nb\\n"/);
  }, 120000);
});
