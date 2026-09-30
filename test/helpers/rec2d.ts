// A recording 2D context for skin contract tests: no pixels, but every call
// is checked (a non-finite number, or a NaN inside a font or colour string,
// is a violation, as the 0/0 in PS2's capacity bar was), and the device-space
// box of everything drawn is kept (under the current transform and clip) so
// a test can say whether a hook stayed inside the rect it was given.

export interface Box { x0: number; y0: number; x1: number; y1: number }
const EMPTY = (): Box => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const grow = (b: Box, x: number, y: number) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
const inter = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

export class Rec2D {
  violations: string[] = [];
  drawn: Box = EMPTY();
  ops = 0;
  canvas: FakeCanvas;
  private m: M = [1, 0, 0, 1, 0, 0];
  private clipBox: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  private path: Box = EMPTY();
  private stack: { m: M; clip: Box; style: Record<string, unknown> }[] = [];
  private style: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)', shadowOffsetX: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over', filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low', direction: 'inherit', letterSpacing: '0px', fontKerning: 'auto' };
  private dash: number[] = [];
  track: boolean;
  watch: { x: number; y: number; w: number; h: number; pad: number } | null = null; // log what's drawn outside this
  outside: string[] = [];
  private op = '';

  constructor(canvas: FakeCanvas, track = true) {
    this.canvas = canvas;
    this.track = track;
    // style properties: checked when set, kept on the save stack
    for (const k of Object.keys(this.style)) {
      Object.defineProperty(this, k, {
        get: () => this.style[k],
        set: (v: unknown) => { this.check(`${k} =`, [v]); this.style[k] = v; },
        enumerable: true,
      });
    }
  }

  private check(what: string, args: unknown[]): void {
    this.ops++;
    this.op = `${what}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(1) : typeof a === 'string' ? JSON.stringify(a.slice(0, 30)) : typeof a)).join(', ')})`;
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) this.violations.push(`${what}(${args.map(String).join(', ')})`);
      if (typeof a === 'string' && /NaN|Infinity|undefined/.test(a)) this.violations.push(`${what} "${a}"`);
    }
  }
  private pt(x: number, y: number): [number, number] {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  private addPt(x: number, y: number, pad = 0) {
    const [px, py] = this.pt(x, y);
    const s = pad * Math.hypot(this.m[0], this.m[1]);
    grow(this.path, px - s, py - s);
    grow(this.path, px + s, py + s);
  }
  private paint(b: Box, pad = 0) {
    if (!this.track || !(b.x1 >= b.x0)) return;
    // a canvas clips to itself, then to the clip path
    const c = inter(inter({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, this.clipBox), { x0: 0, y0: 0, x1: this.canvas.width, y1: this.canvas.height });
    if (c.x1 < c.x0 || c.y1 < c.y0) return; // wholly clipped away
    if (this.style.globalAlpha === 0) return;
    const w = this.watch;
    if (w && (c.x0 < w.x - w.pad || c.y0 < w.y - w.pad || c.x1 > w.x + w.w + w.pad || c.y1 > w.y + w.h + w.pad)) this.outside.push(`${this.op} -> [${c.x0.toFixed(0)},${c.y0.toFixed(0)} .. ${c.x1.toFixed(0)},${c.y1.toFixed(0)}]`);
    grow(this.drawn, c.x0, c.y0);
    grow(this.drawn, c.x1, c.y1);
  }
  private rectBox(x: number, y: number, w: number, h: number): Box {
    const b = EMPTY();
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [a, c] = this.pt(px, py); grow(b, a, c); }
    return b;
  }
  private scaleNow() { return Math.hypot(this.m[0], this.m[1]); }
  // how far a shadow reaches: about 1.5 × its blur, plus its offset
  private shadowPad() { const s = this.style; return (Number(s.shadowBlur) || 0) * 1.5 + Math.max(Math.abs(Number(s.shadowOffsetX) || 0), Math.abs(Number(s.shadowOffsetY) || 0)); }

  // state
  save() { this.check('save', []); this.stack.push({ m: [...this.m] as M, clip: { ...this.clipBox }, style: { ...this.style } }); }
  restore() { this.check('restore', []); const s = this.stack.pop(); if (s) { this.m = s.m; this.clipBox = s.clip; Object.assign(this.style, s.style); } }
  get depth() { return this.stack.length; }
  // transform
  setTransform(a: number | { a: number; b: number; c: number; d: number; e: number; f: number } = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    if (typeof a === 'object') ({ a, b, c, d, e, f } = a);
    this.check('setTransform', [a, b, c, d, e, f]);
    this.m = [a, b, c, d, e, f];
  }
  resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0); }
  getTransform() { const [a, b, c, d, e, f] = this.m; return { a, b, c, d, e, f, m11: a, m12: b, m21: c, m22: d, m41: e, m42: f, is2D: true, isIdentity: a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0, inverse() { return this; } }; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) { this.check('transform', [a, b, c, d, e, f]); this.m = mul(this.m, [a, b, c, d, e, f]); }
  translate(x: number, y: number) { this.check('translate', [x, y]); this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  scale(x: number, y: number) { this.check('scale', [x, y]); this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  rotate(r: number) { this.check('rotate', [r]); const c = Math.cos(r), s = Math.sin(r); this.m = mul(this.m, [c, s, -s, c, 0, 0]); }
  // paths
  beginPath() { this.check('beginPath', []); this.path = EMPTY(); }
  closePath() { this.check('closePath', []); }
  moveTo(x: number, y: number) { this.check('moveTo', [x, y]); this.addPt(x, y); }
  lineTo(x: number, y: number) { this.check('lineTo', [x, y]); this.addPt(x, y); }
  rect(x: number, y: number, w: number, h: number) { this.check('rect', [x, y, w, h]); this.addPt(x, y); this.addPt(x + w, y + h); }
  roundRect(x: number, y: number, w: number, h: number, r?: unknown) { this.check('roundRect', [x, y, w, h, ...(Array.isArray(r) ? r : [r ?? 0])]); this.addPt(x, y); this.addPt(x + w, y + h); }
  arc(x: number, y: number, r: number, a0: number, a1: number) { this.check('arc', [x, y, r, a0, a1]); if (r < 0) this.violations.push(`arc radius ${r}`); this.addPt(x, y, Math.abs(r)); }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) { this.check('arcTo', [x1, y1, x2, y2, r]); if (r < 0) this.violations.push(`arcTo radius ${r}`); this.addPt(x1, y1); this.addPt(x2, y2); }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number) { this.check('ellipse', [x, y, rx, ry, rot, a0, a1]); if (rx < 0 || ry < 0) this.violations.push(`ellipse radius ${rx},${ry}`); this.addPt(x, y, Math.max(Math.abs(rx), Math.abs(ry))); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.check('quadraticCurveTo', [cx, cy, x, y]); this.addPt(cx, cy); this.addPt(x, y); }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) { this.check('bezierCurveTo', [a, b, c, d, x, y]); this.addPt(a, b); this.addPt(c, d); this.addPt(x, y); }
  fill(..._: unknown[]) { this.check('fill', []); this.paint(this.path, this.shadowPad()); }
  stroke(..._: unknown[]) { this.check('stroke', []); this.paint(this.path, (Number(this.style.lineWidth) || 1) * this.scaleNow() / 2 + this.shadowPad()); }
  clip(..._: unknown[]) { this.check('clip', []); this.clipBox = inter(this.clipBox, this.path); }
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
  // drawing
  fillRect(x: number, y: number, w: number, h: number) { this.check('fillRect', [x, y, w, h]); this.paint(this.rectBox(x, y, w, h), this.shadowPad()); }
  strokeRect(x: number, y: number, w: number, h: number) { this.check('strokeRect', [x, y, w, h]); this.paint(this.rectBox(x, y, w, h), (Number(this.style.lineWidth) || 1) * this.scaleNow() / 2 + this.shadowPad()); }
  clearRect(x: number, y: number, w: number, h: number) { this.check('clearRect', [x, y, w, h]); }
  private textBox(t: string, x: number, y: number): Box {
    const px = fontPx(String(this.style.font));
    const w = String(t).length * px * 0.62;
    const al = this.style.textAlign;
    const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
    const bl = this.style.textBaseline;
    const y0 = bl === 'top' || bl === 'hanging' ? y : bl === 'middle' ? y - px / 2 : bl === 'bottom' || bl === 'ideographic' ? y - px : y - px * 0.8;
    return this.rectBox(x0, y0, w, px);
  }
  fillText(t: string, x: number, y: number, maxW?: number) { this.check('fillText', [t, x, y, ...(maxW === undefined ? [] : [maxW])]); this.paint(this.textBox(t, x, y), this.shadowPad()); }
  strokeText(t: string, x: number, y: number, maxW?: number) { this.check('strokeText', [t, x, y, ...(maxW === undefined ? [] : [maxW])]); this.paint(this.textBox(t, x, y)); }
  measureText(t: string) {
    this.check('measureText', [t]);
    const px = fontPx(String(this.style.font));
    const w = String(t).length * px * 0.62;
    return { width: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, fontBoundingBoxAscent: px * 0.9, fontBoundingBoxDescent: px * 0.25 };
  }
  drawImage(img: unknown, ...a: number[]) {
    this.check('drawImage', a);
    const iw = (img as { width?: number })?.width ?? 0, ih = (img as { height?: number })?.height ?? 0;
    const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a.slice(0, 4) : [a[0], a[1], iw, ih];
    this.paint(this.rectBox(dx, dy, dw, dh), this.shadowPad());
  }
  // styles and images
  setLineDash(d: number[]) { this.check('setLineDash', d); this.dash = [...d]; }
  getLineDash() { return [...this.dash]; }
  createLinearGradient(...a: number[]) { this.check('createLinearGradient', a); return gradient(this); }
  createRadialGradient(...a: number[]) { this.check('createRadialGradient', a); if (a[2] < 0 || a[5] < 0) this.violations.push(`createRadialGradient radius ${a[2]},${a[5]}`); return gradient(this); }
  createConicGradient(...a: number[]) { this.check('createConicGradient', a); return gradient(this); }
  createPattern(img: unknown, rep: string) { this.check('createPattern', [rep]); return { setTransform: (m?: unknown) => void m }; }
  createImageData(w: number | { width: number; height: number }, h?: number) {
    const W = typeof w === 'object' ? w.width : w, H = typeof w === 'object' ? w.height : h!;
    this.check('createImageData', [W, H]);
    const n = Math.max(0, Math.round(W)) * Math.max(0, Math.round(H)) * 4;
    return { width: W, height: H, data: new Uint8ClampedArray(Number.isFinite(n) ? n : 0) };
  }
  getImageData(x: number, y: number, w: number, h: number) { this.check('getImageData', [x, y, w, h]); return this.createImageData(w, h); }
  putImageData(_d: unknown, ...a: number[]) { this.check('putImageData', a); }
  drawFocusIfNeeded() {}
}

function gradient(ctx: Rec2D) {
  return {
    addColorStop(at: number, c: string) {
      if (!Number.isFinite(at) || at < 0 || at > 1) ctx.violations.push(`addColorStop(${at}, ${c})`);
      if (/NaN|Infinity|undefined/.test(String(c))) ctx.violations.push(`addColorStop colour "${c}"`);
    },
  };
}

export function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

export class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  hidden = false;
  private ctx: Rec2D | null = null;
  constructor(public tracked = false) {}
  getContext(kind: string) {
    if (kind !== '2d') return null;
    this.ctx ??= new Rec2D(this, this.tracked);
    return this.ctx;
  }
  getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; }
  toDataURL() { return 'data:image/png;base64,'; }
  addEventListener() {}
}

// the few browser globals skins touch, for Node
export function installDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const offscreen: Rec2D[] = [];
  g.__offscreen = offscreen;
  if (!g.document) g.document = {};
  const doc = g.document as Record<string, unknown>;
  doc.createElement = (tag: string) => {
    if (String(tag).toLowerCase() !== 'canvas') return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} };
    const c = new FakeCanvas(false);
    return c;
  };
  doc.fonts ??= { addEventListener() {}, load: async () => [], ready: Promise.resolve() };
  if (!g.window) g.window = g;
  const win = g.window as Record<string, unknown>;
  win.innerWidth ??= 1400;
  win.innerHeight ??= 900;
  win.devicePixelRatio ??= 1;
  g.matchMedia ??= () => ({ matches: false, addEventListener() {} });
}
