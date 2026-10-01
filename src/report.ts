// The end report (docs/OBJECTIVES.md, nice to have 2): how a run ended and
// what it left behind, from the trace alone. Each leak with its size and
// where it was malloc'd; when it was lost, if nothing pointed at it before
// the end; the exit code, or the signal and the line it died on. Each row
// says the step to jump to.
import type { Trace } from './interp';
import { fmtVal } from './interp';
import { lostBlocks, lostText } from './ownership';
import { callsOf } from './frame';

export interface ReportLeak {
  cell: number;
  name: string; // the block, as the heap bar names it (#1)
  size: number;
  site: string; // fn:line where it was malloc'd
  allocAt: number | null; // the malloc's event
  lostAt: number | null; // the event after which nothing pointed at it (before the end)
  lostWhy: string | null;
}
export interface EndReport {
  ended: 'exit' | 'crash' | 'error' | 'cut' | 'running';
  exit: string | null; // main's return, or exit()'s code
  crash: { msg: string; line: number; file?: string; at: number } | null; // the signal (gdb) or the run-time error (interpreter)
  leaks: ReportLeak[];
  bytes: number; // leaked, in all
}

export function endReport(t: Trace): EndReport {
  const allocs = callsOf(t).allocs;
  const lost = new Map(lostBlocks(t).map((l) => [l.cell, l]));
  const allocAt = new Map<number, number>();
  t.evs.forEach((e, i) => { if (e.k === 'alloc') allocAt.set(e.cell, i); });
  const leaks: ReportLeak[] = (t.leaks ?? []).map((l) => {
    const a = allocs.get(l.cell);
    const lo = lost.get(l.cell);
    return {
      cell: l.cell,
      name: t.cells.get(l.cell)?.name ?? `#${l.cell}`,
      size: l.size,
      site: a ? `${a.fn ?? '?'}:${a.line}` : l.line !== null ? `line ${l.line + 1}` : '',
      allocAt: allocAt.get(l.cell) ?? null,
      lostAt: lo ? lo.at : null,
      lostWhy: lo ? lostText(lo) : null,
    };
  });
  const last = t.evs.length - 1;
  const crash = t.error ? { msg: t.error.msg, line: t.error.line, ...(t.error.file ? { file: t.error.file } : {}), at: Math.max(0, last) } : null;
  const ended = t.truncated ? 'cut' : crash ? (t.engine === 'gdb' ? 'crash' : 'error') : t.exit ? 'exit' : 'running';
  return { ended, exit: t.exit ? fmtVal(t.exit) : null, crash, leaks, bytes: leaks.reduce((a, l) => a + l.size, 0) };
}
