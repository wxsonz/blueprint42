// M6: the page's end of live edits (server/live.mjs). One stream stays open
// to the local server; an edit is new text (and a cursor) for a file,
// whichever editor sent it. A static build has no server: this just stops.
export type LiveMsg =
  | { k: 'hello'; editors: string[] }
  | { k: 'editors'; editors: string[] }
  | { k: 'edit'; source: string; path: string; root: string | null; rel: string | null; text?: string; line?: number; col?: number }
  | { k: 'close'; source: string; path: string; root: string | null; rel: string | null }
  | { k: 'open'; source: string; dir: string }
  | { k: 'ping' };

const HEADERS = { 'content-type': 'application/json', 'x-ftb': '1' };

export function connectLive(on: (m: LiveMsg) => void, onDown: () => void): void {
  void (async () => {
    let delay = 1000;
    for (;;) {
      try {
        const res = await fetch('/api/live/stream', { method: 'POST', headers: HEADERS, body: JSON.stringify({ role: 'page' }) });
        if (res.status === 404 || res.status === 405) return;
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        delay = 1000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line) continue;
            let msg: LiveMsg;
            try {
              msg = JSON.parse(line) as LiveMsg;
            } catch {
              continue;
            }
            on(msg);
          }
        }
      } catch {
        /* the server restarted or went away: try again */
      }
      onDown();
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(15_000, delay * 2);
    }
  })();
}

// Ask the connected editors to show a place in the code.
export async function liveReveal(root: string, rel: string, line: number, col: number): Promise<void> {
  try {
    await fetch('/api/live/push', { method: 'POST', headers: HEADERS, body: JSON.stringify({ kind: 'reveal', root, rel, line, col }) });
  } catch {
    /* no server: nothing to tell */
  }
}

// After opening a folder: the editors' unsaved text inside it, as edits.
export async function liveReplay(): Promise<LiveMsg[]> {
  try {
    const res = await fetch('/api/live/push', { method: 'POST', headers: HEADERS, body: JSON.stringify({ kind: 'replay' }) });
    if (!res.ok) return [];
    const r = (await res.json()) as { ok: boolean; edits?: LiveMsg[] };
    return r.ok ? r.edits ?? [] : [];
  } catch {
    return [];
  }
}
