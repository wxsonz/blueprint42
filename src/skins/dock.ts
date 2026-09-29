// The IN dock: where a call arrives, top left of a machine (docs/VISUALS.md,
// "Machine anatomy"). One drawing, coloured by the skin that uses it
// (prototyped in Minimal and Barebone). A strip down the left edge is the
// intake, in the state's colour; the head says IN and the state; the body
// holds the arguments as they arrived.
import type { Dc, DockInfo, Rect } from './types';
import { drawTag, fitText, rrect } from './util';

export interface DockPalette {
  body: string;
  edge: string | null; // null: no border (Barebone tells surfaces apart by shade)
  text: string;
  muted: string;
  faint: string;
  run: string;
  wait: string;
  err: string;
  param: string; // argument names
  ptr: string; // a pointer's tag
  tagFill: string; // its shade, for skins without borders
  ui: (px: number, w?: number) => string;
  mono: (px: number, w?: number) => string;
  radius: number;
  glow: boolean;
}

const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);

export function drawDock(dc: Dc, r: Rect, d: DockInfo, p: DockPalette): void {
  const g = dc.g;
  const rad = p.radius ? px(dc, p.radius, 2) : 0;
  const col = d.stale ? p.faint : d.state === 'running' ? p.run : d.state === 'waiting' ? p.wait : d.state === 'error' ? p.err : p.faint;
  const hot = d.state === 'running' || d.state === 'error';
  g.save();
  if (hot && p.glow) {
    g.shadowColor = col;
    g.shadowBlur = 14 * dc.z;
  }
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.fillStyle = p.body;
  g.fill();
  g.shadowBlur = 0;
  if (p.edge) {
    g.strokeStyle = hot ? col : p.edge;
    g.lineWidth = hot ? 1.5 : 1;
    g.stroke();
  }
  // the intake: calls come in on the left
  g.clip();
  g.fillStyle = col;
  g.fillRect(r.x, r.y, px(dc, d.state === 'idle' ? 2 : 4, 1.5), r.h);
  g.restore();

  if (d.stale) g.globalAlpha *= 0.5;
  const pad = px(dc, 10);
  const x0 = r.x + pad + px(dc, 2);
  const inner = r.w - pad * 2 - px(dc, 2);
  // head: IN, and the state on the right
  let y = r.y + px(dc, 7);
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.font = p.ui(px(dc, 12, 6), 700);
  g.fillStyle = col;
  g.fillText('IN', x0, y);
  const inW = g.measureText('IN ').width;
  const state = d.stale ? 'stale' : d.state === 'waiting' ? `waiting on ${d.waitingOn ?? '…'}` : d.state === 'error' ? 'crashed' : d.state;
  g.textAlign = 'right';
  const st = fitText(g, `${state}${d.frames > 1 ? ` ×${d.frames}` : ''}`, (s) => p.ui(s, 600), px(dc, 12, 6), inner - inW, 5);
  g.fillText(st, r.x + r.w - pad, y);
  // the function it belongs to
  y += px(dc, 17);
  g.textAlign = 'left';
  g.fillStyle = p.text;
  g.fillText(fitText(g, d.copy > 1 ? `${d.name} #${d.copy}` : d.name, (s) => p.ui(s, 600), px(dc, 14, 7), inner, 6), x0, y);
  y += px(dc, 24);

  // body: what arrived
  const rowH = px(dc, 17, 7);
  const note = (text: string, c: string) => {
    g.font = p.ui(px(dc, 11, 6));
    g.fillStyle = c;
    g.fillText(fitText(g, text, (s) => p.ui(s), px(dc, 11, 6), inner, 5), x0, y);
    y += rowH;
  };
  if (d.state === 'error' && d.crash) {
    note(`died at line ${d.crash.line}`, p.err);
    if (d.crash.msg) note(d.crash.msg, p.muted);
  }
  if (d.before !== null) note(`called before step ${d.before.toLocaleString('en-US')}: arguments not traced`, p.faint);
  else if (!d.args) note('not called', p.faint);
  else if (!d.args.length) note(d.last ? 'last call: no arguments' : 'no arguments', p.faint);
  else {
    if (d.last) note('last call', p.faint);
    const nameW = Math.min(inner * 0.45, Math.max(...d.args.map((a) => (g.font = p.mono(px(dc, 12, 6)), g.measureText(a.name).width))) + px(dc, 6));
    for (const a of d.args) {
      if (y + rowH > r.y + r.h - px(dc, 4)) break;
      g.globalAlpha = d.last ? 0.6 : 1;
      g.font = p.mono(px(dc, 12, 6));
      g.fillStyle = p.param;
      g.fillText(fitText(g, a.name, (s) => p.mono(s), px(dc, 12, 6), nameW - px(dc, 4), 5), x0, y);
      if (a.tag) {
        drawTag(g, a.tag, x0 + nameW, y + rowH * 0.4, inner - nameW, { font: (s) => p.mono(s), size: px(dc, 12, 6), col: p.ptr, fill: p.edge ? null : p.tagFill, h: rowH - px(dc, 3, 1), radius: p.radius ? px(dc, 4, 2) : 0, left: true });
      } else {
        g.fillStyle = p.text;
        g.fillText(fitText(g, a.text, (s) => p.mono(s), px(dc, 12, 6), inner - nameW, 5), x0 + nameW, y);
      }
      y += rowH;
    }
    g.globalAlpha = 1;
  }
  g.globalAlpha = 1;
  if (d.editing) {
    g.fillStyle = p.run;
    g.globalAlpha = 0.7;
    g.fillRect(r.x + r.w - px(dc, 3, 2), r.y + rad, px(dc, 2, 1.5), r.h - rad * 2);
    g.globalAlpha = 1;
  }
  // ports, one per incoming call, on the intake
  g.fillStyle = col;
  for (const py of d.inPorts) {
    g.beginPath();
    g.arc(r.x, py, px(dc, 3, 2), 0, Math.PI * 2);
    g.fill();
  }
}
