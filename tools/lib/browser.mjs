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
export function toTerminalDesktop(pid) {
  if (!sh('which', ['qdbus6'])) return false;
  const dir = mkdtempSync(join(tmpdir(), 'b42-kwin-'));
  const file = join(dir, 'move.js');
  const kids = sh('pgrep', ['-P', String(pid)]).split('\n').filter(Boolean).map(Number);
  writeFileSync(file, `
const mine = new Set(${JSON.stringify([pid, ...kids])});
const term = new Set(${JSON.stringify(terminalPids())});
const hint = ${JSON.stringify(basename(REPO))};
const wins = workspace.windowList().filter((w) => w.normalWindow);
const cands = wins.filter((w) => term.has(w.pid));
const t = cands.find((w) => w.caption.includes(hint)) ?? (cands.length === 1 ? cands[0] : null);
const to = t ? t.desktops : [workspace.currentDesktop];
for (const w of wins) if (mine.has(w.pid)) w.desktops = to;
`);
  const q = (...a) => sh('qdbus6', ['org.kde.KWin', '/Scripting', ...a]);
  q('org.kde.kwin.Scripting.unloadScript', 'b42-move');
  q('org.kde.kwin.Scripting.loadScript', file, 'b42-move');
  q('org.kde.kwin.Scripting.start');
  q('org.kde.kwin.Scripting.unloadScript', 'b42-move');
  rmSync(dir, { recursive: true, force: true });
  return true;
}

// software: every 2D canvas on the CPU rasteriser from the start (Chromium
// moves a canvas there by itself after a few readbacks, and the two
// antialias differently: pictures compared across pages must not switch)
export async function launchChromium({ headed = false, gpu = headed, software = false, width = 1400, height = 900, scale = 1 } = {}) {
  const args = ['--no-sandbox'];
  if (software) args.push('--disable-accelerated-2d-canvas', '--disable-gpu');
  if (headed) args.push('--ozone-platform=wayland');
  if (gpu && !headed) args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--disable-vulkan-surface', '--ignore-gpu-blocklist');
  const browser = await chromium.launch({ headless: !headed, executablePath: CHROMIUM, args });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  if (headed) {
    // the browser process's window appears with the first page
    const pid = browser.process?.()?.pid;
    if (pid) for (const ms of [300, 1200]) { await page.waitForTimeout(ms); toTerminalDesktop(pid); }
  }
  return { browser, page, close: () => browser.close() };
}

export { spawn };
