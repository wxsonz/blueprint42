// The author's annotation layer. Source text is deliberately absent.
import { parseInvariant } from './invariants';
export type SpriteKind = 'strip' | 'marker' | 'chest' | 'drill' | 'copy' | 'stack' | 'train';
export interface Binding { scope: 'fn' | 'global'; fn?: string; expr: string }
export interface Sprite {
  id: string;
  kind: SpriteKind;
  x: number;
  y: number;
  label?: string;
  binding?: Binding;
  lengthExpr?: string;
  markers?: { expr: string; label: string }[];
  invariants?: string[]; // M4 truth checks, see invariants.ts
}
export interface BoundValue {
  bound: boolean;
  value?: string;
  number?: number;
  pointer?: number;
  bytes?: number[];
  length?: number;
  markers?: { label: string; index: number }[];
  error?: string;
}
// v2 (M5 projects) adds modules; its node positions are relative to their
// module's top-left, so moving a file's block rewrites one entry, not all.
export interface Blueprint {
  version: 1 | 2;
  nodes: Record<string, { x: number; y: number; pinned: boolean }>;
  modules?: Record<string, { x: number; y: number; pinned: boolean; collapsed: boolean }>;
  waypoints: Record<string, { x: number; y: number }>;
  sprites: Sprite[];
}

const kinds = new Set<SpriteKind>(['strip', 'marker', 'chest', 'drill', 'copy', 'stack', 'train']);
// A function key: its C name, or name@file for a static that another file shares.
const ident = /^[A-Za-z_]\w*(?:@[\w.+@ /-]{1,300})?$/;
const modulePath = (p: string) => p.length <= 400 && !p.split('/').some((s) => !s || s === '..' || s === '.');
const expression = /^[A-Za-z_]\w*(?:(?:\.|->)[A-Za-z_]\w*|\[(?:\d+|[A-Za-z_]\w*)\])*$/;
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Deliberately narrow: observational field/index expressions only. No calls,
// assignment, increment, dereference, casts or arbitrary pointer arithmetic.
export function isSafeBindingExpr(value: string): boolean {
  return value.length <= 160 && expression.test(value.trim());
}

export function parseBlueprint(input: unknown): Blueprint {
  const data: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!rec(data) || (data.version !== 1 && data.version !== 2) || !rec(data.nodes) || !rec(data.waypoints) || !Array.isArray(data.sprites))
    throw new Error('Invalid blueprint format');
  let modules: Blueprint['modules'];
  if (data.version === 2 && data.modules !== undefined) {
    if (!rec(data.modules) || Object.keys(data.modules).length > 1000) throw new Error('Invalid modules');
    modules = Object.create(null) as NonNullable<Blueprint['modules']>;
    for (const [file, m] of Object.entries(data.modules)) {
      if (!modulePath(file) || !rec(m) || !finite(m.x) || !finite(m.y) || typeof m.pinned !== 'boolean' || typeof m.collapsed !== 'boolean') throw new Error('Invalid module');
      modules[file] = { x: m.x, y: m.y, pinned: m.pinned, collapsed: m.collapsed };
    }
  }
  if (Object.keys(data.nodes).length > 1000 || Object.keys(data.waypoints).length > 2000 || data.sprites.length > 500)
    throw new Error('Blueprint is too large');
  const nodes: Blueprint['nodes'] = Object.create(null);
  const waypoints: Blueprint['waypoints'] = Object.create(null);
  for (const [id, p] of Object.entries(data.nodes)) {
    if (!id.startsWith('func:') || !rec(p) || !finite(p.x) || !finite(p.y) || typeof p.pinned !== 'boolean') throw new Error('Invalid node position');
    nodes[id] = { x: p.x, y: p.y, pinned: p.pinned };
  }
  for (const [id, p] of Object.entries(data.waypoints)) {
    if (id.length > 200 || !rec(p) || !finite(p.x) || !finite(p.y)) throw new Error('Invalid route waypoint');
    waypoints[id] = { x: p.x, y: p.y };
  }
  const ids = new Set<string>();
  const sprites: Sprite[] = data.sprites.map((raw: unknown) => {
    if (!rec(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || ids.has(raw.id) || !kinds.has(raw.kind as SpriteKind) || !finite(raw.x) || !finite(raw.y))
      throw new Error('Invalid sprite');
    ids.add(raw.id);
    const sprite: Sprite = { id: raw.id, kind: raw.kind as SpriteKind, x: raw.x, y: raw.y };
    if (raw.label !== undefined) {
      if (typeof raw.label !== 'string' || raw.label.length > 100) throw new Error('Invalid sprite label');
      sprite.label = raw.label;
    }
    if (raw.binding !== undefined) {
      const b = raw.binding;
      if (!rec(b) || (b.scope !== 'fn' && b.scope !== 'global') || typeof b.expr !== 'string' || !isSafeBindingExpr(b.expr) || (b.scope === 'fn' && (typeof b.fn !== 'string' || !ident.test(b.fn))))
        throw new Error('Invalid sprite binding');
      sprite.binding = { scope: b.scope, expr: b.expr.trim() };
      if (b.scope === 'fn') sprite.binding.fn = b.fn as string;
    }
    if (raw.lengthExpr !== undefined) {
      if (typeof raw.lengthExpr !== 'string' || !isSafeBindingExpr(raw.lengthExpr)) throw new Error('Invalid strip length');
      sprite.lengthExpr = raw.lengthExpr.trim();
    }
    if (raw.markers !== undefined) {
      if (!Array.isArray(raw.markers) || raw.markers.length > 16) throw new Error('Invalid markers');
      sprite.markers = raw.markers.map((m: unknown) => {
        if (!rec(m) || typeof m.expr !== 'string' || !isSafeBindingExpr(m.expr) || typeof m.label !== 'string' || m.label.length > 40) throw new Error('Invalid marker');
        return { expr: m.expr.trim(), label: m.label };
      });
    }
    if (raw.invariants !== undefined) {
      if (!Array.isArray(raw.invariants) || raw.invariants.length > 8) throw new Error('Invalid invariants');
      sprite.invariants = raw.invariants.map((inv: unknown) => {
        if (typeof inv !== 'string' || typeof parseInvariant(inv) === 'string') throw new Error('Invalid invariant');
        return inv.trim();
      });
    }
    return sprite;
  });
  return data.version === 2 ? { version: 2, nodes, ...(modules ? { modules } : {}), waypoints, sprites } : { version: 1, nodes, waypoints, sprites };
}

export function serializeBlueprint(blueprint: Blueprint): string {
  return JSON.stringify(parseBlueprint(blueprint), null, 2);
}
