// A run as one HTML file (docs/OBJECTIVES.md, nice to have 10): the app,
// built into a single page (vite.replay.config.mjs), and a replay in it: the
// code, the layout, the sprites, the skin and the trace exactly as recorded
// (src/pack.ts keeps its shared snapshots shared). Opened anywhere, with no
// server and no gdb, it plays that run: it never runs the code again, so
// what it shows is what happened when it was recorded. Read-only.
import { pack, unpack } from './pack';
import type { Trace } from './interp';
import type { Saved } from './sample-ui';

export interface Replay {
  v: 1;
  title: string;
  made: string; // when it was exported (ISO)
  sample: string; // the sample it was made from (its support files and defines come with the app)
  saved: Saved; // the code as it ran, the layout, sprites, run settings
  skin: string;
  pos: number;
  trace: unknown; // pack(trace)
}

export const makeReplay = (r: Omit<Replay, 'v' | 'trace'>, trace: Trace): Replay => ({ v: 1, ...r, trace: pack(trace) });

// the page's replay, if it is one (a JSON script tag)
export function readReplay(): (Replay & { run: Trace }) | null {
  const el = document.getElementById('b42-replay');
  if (!el?.textContent) return null;
  const r = JSON.parse(el.textContent) as Replay;
  if (r.v !== 1) throw new Error(`a replay file of version ${String(r.v)}: this player reads version 1`);
  return { ...r, run: unpack(r.trace as Parameters<typeof unpack>[0]) as Trace };
}

// the player's HTML with the replay in it (`<` escaped, so nothing in it ends the script)
export const withReplay = (player: string, r: Replay): string => {
  const tag = `<script type="application/json" id="b42-replay">${JSON.stringify(r).replace(/</g, '\\u003c')}</script>`;
  const at = player.lastIndexOf('</body>');
  return at < 0 ? player + tag : player.slice(0, at) + tag + player.slice(at);
};
