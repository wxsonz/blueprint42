import { backdrop, makeSkin, softShadow, type Palette, type Theme } from '../kit';
import { rrect } from '../util';
import { MONO, RODIN, text } from './common';

// ---------------- Nintendo ----------------

// The Wii Menu, after a recreation's measured tokens (zuvv/WiiMenu): a light
// blue desktop of fine lines, channels as glossy white 4:3 bezels (14px
// corners, #ccd5da edge) around a recessed "screen", grey #55636b labels,
// the Wii blue #35b4e5 ring on the one you point at.
function wiiOf(dark: boolean): Theme {
  const WII = '#35b4e5';
  const p: Palette = dark ? {
    bg: '#1a2024', card: '#2b3238', panel: '#252b30', line: '#46515a',
    fg: '#e8eef1', dim: '#a3b0b8', faint: '#6d7a83', accent: WII, ptr: '#ff9f43', ret: '#6bbf3a', wait: '#ffc94d', err: '#ff6464',
    param: '#7fd6f2', cell: '#1d3f4d', track: '#1f2529',
  } : {
    bg: '#dcecf3', card: '#ffffff', panel: '#f6f8f9', line: '#ccd5da',
    fg: '#3f4a51', dim: '#6b7980', faint: '#8a969c', accent: '#189fd6', ptr: '#e0782b', ret: '#4f9e22', wait: '#d69a00', err: '#e04848',
    param: '#0b6a9c', cell: '#d8f0fa', track: '#eef1f3',
  };
  const bezelTop = dark ? '#3a434a' : '#ffffff';
  const bezelBot = dark ? '#2c3439' : '#f2f5f7';
  const edge = dark ? '#4c5861' : '#ccd5da';
  return {
    id: dark ? 'wii-dark' : 'wii', name: 'Wii', blurb: dark ? 'the Wii Menu after dark' : 'the Wii Menu: glossy channels on fine blue lines',
    p, ui: RODIN, mono: MONO('"JetBrains Mono"'), radius: 10, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,222,232,0.6)',
    pulseColor: 'rgba(53,180,229,0.9)',
    card(dc, r, o) {
      const g = dc.g;
      const rad = Math.max(2, 9 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      if (o.fill !== 'transparent') {
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(1, bezelBot);
        g.fillStyle = o.kind === 'wall' ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.35)') : gl;
        g.fill();
      }
      g.strokeStyle = o.glow ? WII : edge;
      g.lineWidth = o.glow ? Math.max(1.5, 2 * dc.z) : 1;
      g.stroke();
    },
    background(dc) {
      backdrop(dc, dark ? 'wii-dark' : 'wii', (g, W, H) => {
        const bg = g.createLinearGradient(0, 0, 0, H);
        if (dark) (bg.addColorStop(0, '#20282d'), bg.addColorStop(1, '#141a1e'));
        else (bg.addColorStop(0, '#eef7fa'), bg.addColorStop(0.5, '#dcecf3'), bg.addColorStop(1, '#c9e2ec'));
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        // the fine horizontal lines of the Wii desktop
        g.fillStyle = dark ? 'rgba(120,170,190,0.07)' : 'rgba(188,215,226,0.45)';
        for (let y = 0; y < H; y += 5) g.fillRect(0, y, W, 1);
      });
    },
    window: {
      border: 5, corner: 14, titleH: 26, face: dark ? '#20262b' : '#fbfcfd', workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.4)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(3, 14 * dc.z);
        softShadow(dc, r, 14, 9, dark ? 'rgba(0,0,0,0.55)' : 'rgba(55,95,125,0.35)', 3 * dc.z);
        // the glossy bezel
        rrect(g, r.x, r.y, r.w, r.h, rad);
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(0.6, dark ? '#343c42' : '#ffffff');
        gl.addColorStop(1, bezelBot);
        g.fillStyle = gl;
        g.fill();
        g.strokeStyle = edge;
        g.lineWidth = 1;
        g.stroke();
        // the recessed "screen" set into it
        const b = Math.max(2, 5 * dc.z);
        const th = 26 * dc.z;
        const sc = { x: r.x + b, y: r.y + th, w: r.w - 2 * b, h: Math.max(0, r.h - th - b) };
        rrect(g, sc.x, sc.y, sc.w, sc.h, Math.max(2, 9 * dc.z));
        g.fillStyle = face;
        g.fill();
        g.strokeStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(30,60,80,0.12)';
        g.stroke();
        const inset = g.createLinearGradient(0, sc.y, 0, sc.y + Math.min(sc.h, 10 * dc.z));
        inset.addColorStop(0, dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.07)');
        inset.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = inset;
        g.fill();
        if (active) {
          // pointed at: the Wii-blue ring, lifted
          rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
          g.strokeStyle = dark ? WII : '#8ad3ef';
          g.lineWidth = Math.max(2, 2.5 * dc.z);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        // the channel's label: grey, centred
        text(dc, r, title, RODIN, 12.5, active ? (dark ? '#ffffff' : '#3f4a51') : dark ? '#a3b0b8' : '#55636b', { w: 700, align: 'center' });
      },
      progress(dc, r, fill, anim) {
        const g = dc.g;
        rrect(g, r.x, r.y, r.w, r.h, r.h / 2);
        g.fillStyle = dark ? '#1b2125' : '#e3e9ed';
        g.fill();
        g.strokeStyle = dark ? '#3a444b' : '#ccd4d9';
        g.lineWidth = 1;
        g.stroke();
        const x = anim ? r.x + r.w * (((dc.time * 0.45) % 1.3) - 0.3) : r.x;
        const w = anim ? r.w * 0.3 : r.w * fill;
        const a = Math.max(r.x, x);
        const e = Math.min(r.x + r.w, x + w);
        if (e - a < 2) return;
        rrect(g, a, r.y + 1, e - a, r.h - 2, (r.h - 2) / 2);
        const blue = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        blue.addColorStop(0, '#4fd0ff');
        blue.addColorStop(0.5, WII);
        blue.addColorStop(1, '#189fd6');
        g.fillStyle = blue;
        g.fill();
      },
    },
  };
}
export const wiiTheme = wiiOf(false);

export const wii = { ...makeSkin(wiiTheme), mode: 'light' as const };
export const wiiDark = { ...makeSkin(wiiOf(true)), variantOf: 'wii', mode: 'dark' as const };
