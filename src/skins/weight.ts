// How heavy is a skin (docs/OBJECTIVES.md, nice to have 12): light, medium
// or heavy, from the bench numbers kept in weight-data.ts (tools/bench.mjs
// --uncapped --save). Relative to the lightest skin measured, so it holds on a
// slower machine too: within 1.3× of it is light, within 2× medium, beyond
// heavy. A skin that makes many gradients a frame gets a note: Firefox draws
// those slower than Chromium does.
import { WEIGHT_MEASURED, WEIGHTS } from './weight-data';

export interface Weight {
  cls: 'light' | 'medium' | 'heavy';
  ms: number;
  title: string;
}

const lightest = Math.min(...Object.values(WEIGHTS).map((w) => w.ms));

export function weightOf(id: string): Weight | null {
  const w = WEIGHTS[id];
  if (!w || !Number.isFinite(lightest)) return null;
  const x = w.ms / lightest;
  const cls = x <= 1.3 ? 'light' : x <= 2 ? 'medium' : 'heavy';
  const m = WEIGHT_MEASURED as { when: string; browser: string; sample: string; note?: string };
  const grad = w.grad >= 10 ? ` It makes ${w.grad} gradients a frame: Firefox pays more for those than Chromium.` : '';
  return {
    cls, ms: w.ms,
    title: `${cls}: a frame costs ${w.ms} ms here, ${x.toFixed(1)}× the lightest skin (${w.cpu} ms of it drawing the grid on the CPU).${grad} Measured ${m.when} in ${m.browser} on the ${m.sample} sample${m.note ? ` (${m.note})` : ''}.`,
  };
}
