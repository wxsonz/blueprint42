import { fileURLToPath } from 'node:url';
import { initParser, parse } from '../src/parse';
import { SAMPLES } from '../src/samples';

const nm = (p: string) => fileURLToPath(new URL(`../node_modules/${p}`, import.meta.url));

let ready: Promise<void> | null = null;
export function setupParser(): Promise<void> {
  ready ??= initParser({ runtime: nm('web-tree-sitter/web-tree-sitter.wasm'), grammar: nm('tree-sitter-c/tree-sitter-c.wasm') });
  return ready;
}

export const sample = (key: string) => SAMPLES.find((s) => s.key === key)!;
export const model = (key: string) => parse(sample(key).src);
