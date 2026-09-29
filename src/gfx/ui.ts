// The top bar's GFX button: Full, Simple or Off for the skins' backgrounds,
// and what's drawing them (the GPU scene and its backend, or the canvas).
import { $, esc } from '../dom';
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
