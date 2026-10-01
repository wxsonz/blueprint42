// Launch a browser for the tools. Headless Chromium by default (no window).
// A visible one (`headed`, or Zen) is moved to the virtual desktop of the
// terminal this runs in, so it opens beside the terminal instead of over
// whatever the author is doing (KDE: a one-off KWin script; elsewhere a
// no-op). Headless Chromium has no GPU compositor: frame rates from it are
// not the author's; pictures and call counts are fine.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from 'playwright-core';
import { REPO } from './serve.mjs';

const CHROMIUM = process.env.CHROMIUM ?? '/usr/bin/chromium';
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const ppid = (pid) => Number(sh('ps', ['-o', 'ppid=', '-p', String(pid)])) || 0;

// the processes that could own the terminal's window: this process's
// ancestors, and under tmux the attached client's ancestors
function terminalPids() {
  const out = new Set();
  const walk = (p) => { for (let i = 0; p > 1 && i < 30; i++) { out.add(p); p = ppid(p); } };
  walk(process.pid);
  if (process.env.TMUX) walk(Number(sh('tmux', ['display', '-p', '#{client_pid}'])));
  return [...out];
}

// Move every normal window of `pid` (and its children) to the desktop of the
// terminal's window. Idempotent; run it again once the window exists.
// Returns 'moved', 'none' (not KDE: nothing to do) or 'lost' (the terminal's
// window couldn't be told apart: then nothing is moved, and the caller must
// not leave the window wherever the author happens to be).
//
// Which window is the terminal: one terminal process can own many windows
// (Ghostty, Konsole), so under tmux the client's window is given a unique
// title for a moment (written to the client's tty), found by it, and its
// title restored; without tmux, the one window of an ancestor process.
export function toTerminalDesktop(pid) {
  if (!sh('which', ['qdbus6'])) return 'none';
  const token = `b42-${process.pid}-${Date.now()}`;
  const tty = process.env.TMUX ? sh('tmux', ['display', '-p', '#{client_tty}']) : '';
  const title = (t) => { try { writeFileSync(tty, `\x1b]2;${t}\x07`); return true; } catch { return false; } };
  const marked = !!tty && title(token);
  if (marked) sh('sleep', ['0.25']); // the terminal shows it, KWin sees it
  const dir = mkdtempSync(join(tmpdir(), 'b42-kwin-'));
  const file = join(dir, 'move.js');
  const kids = sh('pgrep', ['-P', String(pid)]).split('\n').filter(Boolean).map(Number);
  writeFileSync(file, `
const mine = new Set(${JSON.stringify([pid, ...kids])});
const term = new Set(${JSON.stringify(terminalPids())});
const token = ${JSON.stringify(marked ? token : '')};
const wins = workspace.windowList().filter((w) => w.normalWindow);
const cands = wins.filter((w) => term.has(w.pid));
const t = token ? wins.find((w) => w.caption.includes(token)) ?? null : cands.length === 1 ? cands[0] : null;
let n = 0;
if (t) for (const w of wins) if (mine.has(w.pid)) (w.desktops = t.desktops), n++;
print('B42MOVE ${token} ' + (t ? 'moved ' + n : 'lost'));
`);
  const q = (...a) => sh('qdbus6', ['org.kde.KWin', '/Scripting', ...a]);
  const since = new Date(Date.now() - 1000).toISOString().replace('T', ' ').slice(0, 19);
  q('org.kde.kwin.Scripting.unloadScript', 'b42-move');
  q('org.kde.kwin.Scripting.loadScript', file, 'b42-move');
  q('org.kde.kwin.Scripting.start');
  q('org.kde.kwin.Scripting.unloadScript', 'b42-move');
  rmSync(dir, { recursive: true, force: true });
  // (put back the pane's own title: what the program in it last set)
  if (marked) title(sh('tmux', ['display', '-p', '#{pane_title}']) || 'tmux');
  // what the script said (it prints to the journal)
  let said = '';
  for (let i = 0; i < 10 && !said; i++) {
    said = sh('journalctl', ['--user', '--since', since, '-o', 'cat']).split('\n').reverse().find((l) => l.includes(`B42MOVE ${token}`)) ?? '';
    if (!said) sh('sleep', ['0.1']);
  }
  return said.includes(' moved ') ? 'moved' : 'lost';
}

// software: every 2D canvas on the CPU rasteriser from the start (Chromium
// moves a canvas there by itself after a few readbacks, and the two
// antialias differently: pictures compared across pages must not switch)
// uncapped: no vsync and no frame-rate limit, so frames a second is what a
// frame costs (CPU and GPU), not the screen's refresh rate
export async function launchChromium({ headed = false, gpu = headed, software = false, uncapped = false, width = 1400, height = 900, scale = 1 } = {}) {
  const args = ['--no-sandbox'];
  if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  if (software) args.push('--disable-accelerated-2d-canvas', '--disable-gpu');
  if (headed) args.push('--ozone-platform=wayland');
  if (gpu && !headed) args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--disable-vulkan-surface', '--ignore-gpu-blocklist');
  const browser = await chromium.launch({ headless: !headed, executablePath: CHROMIUM, args });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  if (headed) {
    // the browser process's window appears with the first page
    // (Playwright's Browser doesn't give its process: it's a child of this one)
    const pid = Number(sh('pgrep', ['-n', '-P', String(process.pid), basename(CHROMIUM)])) || 0;
    // never leave it on whatever desktop the author is on: beside the terminal, or not at all
    let where = 'lost';
    if (pid) for (const ms of [300, 1200]) { await page.waitForTimeout(ms); where = toTerminalDesktop(pid); }
    if (where === 'lost') {
      await browser.close();
      throw new Error('could not tell which window is this terminal, so the browser window was closed rather than left on another desktop');
    }
  }
  return { browser, page, close: () => browser.close() };
}

export { spawn };
