// A minimap (docs/OBJECTIVES.md, nice to have 11): the whole grid small in a
// corner, each machine (and collapsed module) a box where it is, the running
// one lit, the view as a frame. Click or drag in it to move the view there.
// Only when the grid doesn't fit the view. Chrome, not the grid: its colours
// are the skin's CSS variables, and it draws only when something it shows
// changed.
import { activeHostRect } from './hit';
import { sceneAt } from './playback';
import type { GridView } from './render';
import { S } from './state';

const W = 180, H = 120, PAD = 6;
let canvas: HTMLCanvasElement | null = null;
let shown = '';
let world = { x: 0, y: 0, k: 1 }; // minimap px = (world - x) * k + PAD

function el(view: GridView, onPan: () => void): HTMLCanvasElement {
  if (canvas) return canvas;
  const c = document.createElement('canvas');
  c.id = 'minimap';
  c.title = 'The whole grid: click or drag to look there';
  document.getElementById('grid-wrap')!.appendChild(c);
  const go = (e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    const wx = (e.clientX - r.left - PAD) / world.k + world.x;
    const wy = (e.clientY - r.top - PAD) / world.k + world.y;
    const vw = view.w / view.cs, vh = view.h / view.cs;
    // (panPx moves the camera and its target together, so it stays there)
    view.panPx((view.cam.x - (wx - vw / 2)) * view.cs, (view.cam.y - (wy - vh / 2)) * view.cs);
    onPan();
  };
  let dragging = false;
  c.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; dragging = true; c.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
  c.addEventListener('pointermove', (e) => dragging && go(e));
  c.addEventListener('pointerup', () => (dragging = false));
  c.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  return (canvas = c);
}

export function renderMinimap(view: GridView, onPan: () => void): void {
  const c = el(view, onPan);
  const scene = S.model ? sceneAt(S) : null;
  const hosts = scene ? [...scene.hosts.values()] : [];
  const vw = view.w / view.cs, vh = view.h / view.cs;
  const vx = view.cam.x, vy = view.cam.y;
  if (!hosts.length) return void (c.hidden = true);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const h of hosts) (x0 = Math.min(x0, h.x)), (y0 = Math.min(y0, h.y)), (x1 = Math.max(x1, h.x + h.w)), (y1 = Math.max(y1, h.y + h.h));
  // only for grids bigger than the view
  const fits = x0 >= vx && y0 >= vy && x1 <= vx + vw && y1 <= vy + vh;
  const act = activeHostRect(S);
  // (the running host's rect starts at its x; nearest in y, for copies stacked in a column)
  const lit = act ? hosts.filter((h) => h.x === act.x).sort((a, b) => Math.abs(a.y - act.y) - Math.abs(b.y - act.y))[0] ?? null : null;
  const key = JSON.stringify([fits, x0, y0, x1, y1, Math.round(vx * 4), Math.round(vy * 4), Math.round(vw * 4), Math.round(vh * 4), lit?.key ?? '', hosts.length, S.skin.id, devicePixelRatio]);
  if (key === shown) return;
  shown = key;
  c.hidden = fits;
  if (fits) return;
  const dpr = devicePixelRatio;
  if (c.width !== W * dpr) (c.width = W * dpr), (c.height = H * dpr);
  // the world and the view both fit, with the view where it is
  const bx0 = Math.min(x0, vx), by0 = Math.min(y0, vy), bx1 = Math.max(x1, vx + vw), by1 = Math.max(y1, vy + vh);
  const k = Math.min((W - PAD * 2) / (bx1 - bx0), (H - PAD * 2) / (by1 - by0));
  world = { x: bx0, y: by0, k };
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const fg = v('--panel-fg', '#ccc'), accent = v('--accent', '#58e0c0');
  const px = (x: number) => (x - bx0) * k + PAD, py = (y: number) => (y - by0) * k + PAD;
  g.globalAlpha = 0.45;
  g.fillStyle = fg;
  for (const h of hosts) if (h !== lit) g.fillRect(px(h.x), py(h.y), Math.max(1.5, h.w * k), Math.max(1.5, h.h * k));
  g.globalAlpha = 1;
  if (lit) {
    g.fillStyle = accent;
    g.fillRect(px(lit.x), py(lit.y), Math.max(2, lit.w * k), Math.max(2, lit.h * k));
  }
  // the view: in the text colour, so it reads apart from the lit machine
  g.strokeStyle = fg;
  g.lineWidth = 1.25;
  g.strokeRect(px(vx) + 0.5, py(vy) + 0.5, Math.max(3, vw * k - 1), Math.max(3, vh * k - 1));
}
