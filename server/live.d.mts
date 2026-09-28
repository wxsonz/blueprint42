import type { IncomingMessage, ServerResponse } from 'node:http';
export function liveStream(b: unknown, req: IncomingMessage, res: ServerResponse): Promise<void>;
export function livePush(b: unknown): Promise<{ ok: boolean; [k: string]: unknown }>;
