// printf's buffer (docs/VISUALS.md, "Output"): a node above the process box
// holding the bytes printf has put in stdout's buffer that haven't reached
// the terminal yet. It says when it flushes (at each newline to a terminal,
// only when full to a pipe) and how full it is. One drawing, coloured by the
// skin (prototyped in Minimal and Barebone).
import type { Dc, Rect, StdBufInfo } from './types';
import { drawCap, fitText, rrect } from './util';

export interface StdBufPalette {
  body: string;
  edge: string | null; // null: no border, a shade only (Barebone)
  text: string;
  muted: string;
  faint: string;
  flow: string; // bytes leaving for the terminal
  wait: string;
  err: string;
  track: string;
  ui: (px: number, w?: number) => string;
  mono: (px: number, w?: number) => string;
  radius: number;
}

const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);

// a C string literal of what's held: newlines and tabs as escapes, so a
// trailing "\n" waiting in a pipe's buffer is visible
export const cLiteral = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;

export function drawStdBuf(dc: Dc, r: Rect, b: StdBufInfo, p: StdBufPalette): void {
  const g = dc.g;
  const rad = p.radius ? px(dc, p.radius, 2) : 0;
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.fillStyle = p.body;
  g.fill();
  if (p.edge) {
    g.strokeStyle = b.n ? p.wait : p.edge;
    g.lineWidth = 1;
    g.stroke();
  }
  const pad = px(dc, 10);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  // head: what it is and how full; under it, when it empties
  let y = r.y + px(dc, 11);
  const capW = drawCap(g, { used: b.n, max: b.cap }, r.x + r.w - pad, y, { font: (s) => p.mono(s), size: px(dc, 9.5, 6), faint: p.faint, full: p.wait, over: p.err, track: p.track });
  g.textAlign = 'left';
  g.font = p.ui(px(dc, 10, 6), 700);
  g.fillStyle = p.muted;
  g.fillText(fitText(g, 'PRINTF BUFFER', (s) => p.ui(s, 700), px(dc, 10, 6), r.w - pad * 2 - capW - px(dc, 6), 5), r.x + pad, y);
  y += px(dc, 14);
  const rule = b.mode === 'terminal' ? 'to a terminal: flushed at each \\n' : 'to a pipe: flushed when full, or at exit';
  g.font = p.ui(px(dc, 10, 6));
  g.fillStyle = p.faint;
  g.fillText(fitText(g, rule, (s) => p.ui(s), px(dc, 10, 6), r.w - pad * 2, 5), r.x + pad, y);
  // body: what it holds, waiting; or what just left
  y = r.y + r.h - px(dc, 13);
  g.font = p.mono(px(dc, 12, 6), 600);
  if (b.n) {
    g.fillStyle = p.wait;
    g.fillText(fitText(g, `${cLiteral(b.text)}  waiting`, (s) => p.mono(s, 600), px(dc, 12, 6), r.w - pad * 2, 5), r.x + pad, y);
  } else if (b.flushed) {
    g.fillStyle = p.flow;
    g.fillText(fitText(g, `${cLiteral(b.flushed)}  → terminal`, (s) => p.mono(s, 600), px(dc, 12, 6), r.w - pad * 2, 5), r.x + pad, y);
  } else {
    g.fillStyle = p.faint;
    g.fillText('empty', r.x + pad, y);
  }
}
