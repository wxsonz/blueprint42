// Drive Zen (or Firefox) for the tools, over WebDriver BiDi: a fresh
// temporary profile (WebGPU on, no prompts), the window moved to the
// terminal's virtual desktop, closed and cleaned up after. Firefox draws 2D
// canvases on a separate thread (CanvasRenderer), so its frame rates can
// differ a lot from Chromium's: measure there when that's the question.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toTerminalDesktop } from './browser.mjs';

const BIN = process.env.ZEN ?? '/opt/zen-browser-bin/zen-bin';

// headless: no window at all (Firefox's own --headless; the GPU is still used),
// for runs where there's no terminal window to put it beside (an agent's session)
// uncapped: no frame-rate limit (layout.frame_rate 0), so fps is a frame's whole cost
export async function launchZen({ port = 9400 + Math.floor(Math.random() * 400), headless = false, uncapped = false, width = 1400, height = 900 } = {}) {
  const prof = mkdtempSync(join(tmpdir(), 'b42-zen-'));
  writeFileSync(join(prof, 'user.js'), [
    'user_pref("dom.webgpu.enabled", true);', 'user_pref("gfx.webgpu.ignore-blocklist", true);',
    'user_pref("browser.shell.checkDefaultBrowser", false);', 'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("browser.tabs.warnOnClose", false);', ...(uncapped ? ['user_pref("layout.frame_rate", 0);'] : []),
    // headless Firefox paints 2D canvases in software unless told otherwise; a
    // window on this machine draws them on the GPU (CanvasRenderer, over GL), a
    // different cost altogether, so headless runs ask for the GPU like a window
    ...(headless ? ['user_pref("gfx.canvas.accelerated.force-enabled", true);', 'user_pref("gfx.webrender.software", false);', 'user_pref("layers.acceleration.force-enabled", true);'] : []), 'user_pref("browser.warnOnQuit", false);', 'user_pref("browser.sessionstore.resume_from_crash", false);',
  ].join('\n'));
  const proc = spawn(BIN, [...(headless ? ['--headless', '--width', String(width), '--height', String(height)] : []), '--no-remote', '--profile', prof, '--remote-debugging-port', String(port), '--new-window', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Zen did not open its remote port')), 30000);
    proc.stderr.on('data', (d) => { const m = String(d).match(/WebDriver BiDi listening on (ws:\/\/\S+)/); if (m) (clearTimeout(t), res(m[1])); });
    proc.on('exit', () => rej(new Error('Zen exited (another instance on this profile?)')));
  });
  const ws = new WebSocket(`${url}/session`);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) (wait.get(d.id)(d), wait.delete(d.id)); };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    wait.set(i, (d) => (d.type === 'error' ? rej(new Error(`${d.error}: ${d.message}`)) : res(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('session.new', { capabilities: {} });
  // a tab of our own, in front (Zen opens its own start tab)
  const { context } = await send('browsingContext.create', { type: 'tab', background: false });
  await send('browsingContext.activate', { context }).catch(() => {});
  // beside the terminal, or not at all (never on whatever desktop the author is on)
  let where = headless ? 'moved' : 'lost';
  if (!headless) for (const ms of [0, 800]) { await new Promise((r) => setTimeout(r, ms)); where = toTerminalDesktop(proc.pid); }
  if (where === 'lost') {
    try { await send('browser.close'); } catch { /* gone */ }
    proc.kill();
    throw new Error('could not tell which window is this terminal, so Zen was closed rather than left on another desktop');
  }
  const evaluate = async (expr) => {
    const r = await send('script.evaluate', { expression: expr, target: { context }, awaitPromise: true, resultOwnership: 'none' });
    if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
    const v = r.result;
    return v.type === 'string' ? v.value : v.value ?? v.type;
  };
  return {
    goto: (u) => send('browsingContext.navigate', { context, url: u, wait: 'complete' }),
    evaluate,
    async close() {
      try { await send('browser.close'); } catch { /* gone */ }
      await new Promise((r) => { const t = setTimeout(() => { proc.kill(); r(); }, 8000); proc.on('exit', () => (clearTimeout(t), r())); });
      rmSync(prof, { recursive: true, force: true });
    },
  };
}
