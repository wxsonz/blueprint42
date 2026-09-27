import type { IconKind } from './types';

// Plain glyphs for the entities that arrive in M2, tinted per skin.
export function genericIcon(g: CanvasRenderingContext2D, kind: IconKind, s: number, fg: string, bg: string): void {
  const u = s / 24;
  g.fillStyle = fg;
  g.strokeStyle = fg;
  g.lineWidth = 1.5 * u;
  switch (kind) {
    case 'strip':
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < 3 ? fg : bg;
        g.fillRect((2 + i * 4) * u, 10 * u, 3.4 * u, 6 * u);
        g.strokeRect((2 + i * 4) * u, 10 * u, 3.4 * u, 6 * u);
      }
      g.fillStyle = fg;
      g.beginPath(); g.moveTo(14 * u, 9 * u); g.lineTo(11.5 * u, 5 * u); g.lineTo(16.5 * u, 5 * u); g.fill();
      return;
    case 'drill':
      g.strokeRect(6 * u, 9 * u, 12 * u, 11 * u);
      g.beginPath(); g.moveTo(9 * u, 9 * u); g.lineTo(12 * u, 3 * u); g.lineTo(15 * u, 9 * u); g.fill();
      return;
    case 'copy':
      g.strokeRect(4 * u, 4 * u, 10 * u, 12 * u);
      g.fillStyle = bg;
      g.fillRect(10 * u, 8 * u, 10 * u, 12 * u);
      g.strokeRect(10 * u, 8 * u, 10 * u, 12 * u);
      return;
    case 'train':
      g.strokeRect(2 * u, 8 * u, 8 * u, 8 * u);
      g.strokeRect(14 * u, 8 * u, 8 * u, 8 * u);
      g.beginPath(); g.moveTo(10 * u, 12 * u); g.lineTo(14 * u, 12 * u); g.stroke();
      return;
    case 'stack':
      for (let i = 0; i < 4; i++) g.strokeRect(6 * u, (4 + i * 4.5) * u, 12 * u, 3.5 * u);
      return;
    default:
      g.strokeRect(4 * u, 4 * u, 16 * u, 16 * u);
  }
}
