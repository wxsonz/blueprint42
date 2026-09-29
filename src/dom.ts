// Small helpers every part of the page uses: an element by id, this app's
// corner of localStorage, and HTML escaping.
export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(`ftb.${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(`ftb.${k}`, v);
    } catch {
      /* private window etc. */
    }
  },
};

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
