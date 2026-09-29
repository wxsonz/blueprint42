// The top bar's GFX button: Full, Simple or Off for the skins' backgrounds,
// and what's drawing them (the GPU scene and its backend, or the canvas).
import { $, esc } from '../dom';
import { pageStats } from '../page';
import type { GridView } from '../render';
import type { Skin } from '../skins/types';
import { gfxMode, setGfx, type GfxMode } from './gfx';
import { sceneFor } from './scenes';

const MODES: { id: GfxMode; name: string; what: string }[] = [
  { id: 'full', name: 'Full', what: 'animated; on the GPU where the skin has a GPU scene' },
  { id: 'simple', name: 'Simple', what: 'a still picture of it, painted once' },
  { id: 'off', name: 'Off', what: "the skin's flat colour" },
];

export function initGfxButton(view: GridView, skin: () => Skin): void {
  const btn = $('gfx-btn');
  const menu = $('gfx-menu');
  const label = () => {
    btn.innerHTML = `GFX <b>${MODES.find((m) => m.id === gfxMode())!.name}</b>`;
  };
  const status = (): string => {
    const sk = skin();
    const scene = sceneFor(sk.id);
    const L = view.gfx;
    if (gfxMode() !== 'full') return `${esc(sk.name)}: ${gfxMode() === 'off' ? 'flat colour' : 'a still picture, drawn once'}.`;
    if (!scene) return `${esc(sk.name)} has no GPU scene yet: its background animates on the canvas.`;
    if (!L.ok) return `${esc(sk.name)}: GPU unavailable (${esc(L.failed || 'starting…')}), drawn on the canvas.`;
    return `${esc(sk.name)}: its GPU scene, on ${L.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}; ${L.lastMs.toFixed(2)} ms of CPU a frame.`;
  };
  const render = () => {
    menu.innerHTML = `<section><h3>Background<span>only the background: machines, belts and text are the same in every mode</span></h3>${MODES.map((m) =>
      `<button role="menuitemradio" data-gfx="${m.id}" aria-checked="${m.id === gfxMode()}"><b>${m.name}</b><span class="tag">${m.what}</span></button>`).join('')}</section>
      <div class="status">${status()}</div>`;
  };
  const open = (on: boolean) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) render();
  };
  label();
  // the readout beside the button: what draws it, frames a second, CPU ms
  const api = document.querySelector<HTMLElement>('#gfx-stats .gfx-api')!;
  const rate = document.querySelector<HTMLElement>('#gfx-stats .gfx-rate')!;
  let last = { t: performance.now(), gpu: 0, bg: 0, page: 0 };
  setInterval(() => {
    const now = performance.now();
    const L = view.gfx;
    const kind = view.bgKind === 'gpu' ? L.backend ?? 'webgpu' : view.bgKind;
    const names: Record<string, string> = { webgpu: 'WebGPU', webgl2: 'WebGL2', canvas: 'canvas', page: 'canvas', still: 'still', off: 'off' };
    api.textContent = names[kind] ?? kind;
    api.dataset.kind = kind;
    api.title = kind === 'webgpu' || kind === 'webgl2' ? 'drawn on the GPU' : kind === 'canvas' || kind === 'page' ? 'drawn on the CPU (the canvas): this skin has no GPU scene yet, or the GPU is unavailable' : kind === 'still' ? 'a still picture, painted once' : 'a flat colour';
    const dt = (now - last.t) / 1000;
    const n = view.bgKind === 'gpu' ? L.frames - last.gpu : view.bgKind === 'page' ? pageStats.frames - last.page : view.bgFrames - last.bg;
    const ms = view.bgKind === 'gpu' ? L.lastMs : view.bgKind === 'page' ? pageStats.ms : view.bgMs;
    rate.textContent = view.bgKind === 'off' ? '' : view.bgKind === 'still' ? `${ms.toFixed(1)} ms` : `${Math.round(n / dt)} fps · ${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
    last = { t: now, gpu: L.frames, bg: view.bgFrames, page: pageStats.frames };
  }, 500);
  btn.addEventListener('click', () => open(menu.hidden !== false));
  menu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gfx]');
    if (!b) return;
    setGfx(b.dataset.gfx as GfxMode);
    label();
    render();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') open(false);
  });
}
