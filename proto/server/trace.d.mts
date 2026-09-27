import type { GResult } from '../src/gdb';

export interface TraceRequest {
  src: string;
  files?: Record<string, string>;
  defines?: string[];
  stdin?: string;
  fns: string[];
  maxSteps?: number;
  maxSeconds?: number;
}
export function handleTrace(req: TraceRequest): Promise<GResult>;
export function parseDiagnostics(text: string): { line: number; col: number; severity: string; msg: string }[];
export function traceMiddleware(): (req: unknown, res: unknown, next: () => void) => void;
