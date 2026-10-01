import type { GResult } from '../src/gdb';
import type { Sprite } from '../src/blueprint';

export interface TraceRequest {
  src?: string;
  project?: { files: Record<string, string> };
  files?: Record<string, string>;
  defines?: string[];
  stdin?: string;
  args?: string[];
  fns: string[];
  maxSteps?: number;
  maxSeconds?: number;
  bindings?: Sprite[];
  terminal?: boolean; // stdout a terminal (line-buffered, the default) or a pipe (fully buffered, the bytes exactly)
}
export function handleTrace(req: TraceRequest): Promise<GResult>;
export function parseDiagnostics(text: string, dir?: string | null, paths?: string[] | null): { file: string; line: number; col: number; severity: string; msg: string }[];
export function traceMiddleware(opts?: { initial?: string | null }): (req: unknown, res: unknown, next: () => void) => void;
