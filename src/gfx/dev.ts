// Developer tools for the GPU scenes (dev builds only): a plain floating
// panel, not skinned. For now, PS2's glass tint: a colour and how deep it goes.
import type { Skin } from '../skins/types';
import { glassTint, setGlassTint } from './scenes/ps2';

export function initGlassPanel(skin: () => Skin): void {
  const box = document.createElement('div');
  box.hidden = true;
  box.style.cssText = 'position:fixed;right:8px;bottom:64px;z-index:50;padding:6px 8px;background:#222;color:#ddd;border:1px solid #555;font:12px system-ui,sans-serif;display:flex;gap:8px;align-items:center';
  const colour = Object.assign(document.createElement('input'), { type: 'color', value: '#6aa0ff', title: 'glass colour' });
  const strength = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '4', step: '0.05', value: '0', title: 'strength: 0 is clear glass' });
  const num = document.createElement('span');
  num.style.cssText = 'min-width:2.5em;text-align:right';
  const reset = Object.assign(document.createElement('button'), { textContent: 'clear', title: 'back to clear glass' });
  const apply = () => {
    setGlassTint(colour.value, +strength.value);
    num.textContent = (+strength.value).toFixed(2);
  };
  colour.addEventListener('input', apply);
  strength.addEventListener('input', apply);
  reset.addEventListener('click', () => {
    strength.value = '0';
    apply();
  });
  box.append('glass', colour, strength, num, reset);
  document.body.append(box);
  num.textContent = glassTint.strength.toFixed(2);
  // only while PS2's scene is what's showing
  setInterval(() => (box.hidden = skin().id !== 'ps2'), 500);
}
