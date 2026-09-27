export const META: string;
export function wanted(rel: string): boolean;
export function safeRel(rel: string): boolean;
export interface ProjectFile { path: string; mtime: number; size: number; text: string }
export function listDir(dir?: string): Promise<{ dir: string; parent: string | null; dirs: string[]; project: boolean; home: string }>;
export function openProject(dir: string): Promise<{ root: string; name: string; files: ProjectFile[]; truncated: boolean }>;
export function pollProject(root: string, known: Record<string, number>): Promise<{ changed: ProjectFile[]; removed: string[] }>;
export function saveFiles(root: string, writes: { path: string; text: string; base: number | null }[], force?: boolean): Promise<{ saved: { path: string; mtime: number }[]; conflicts: { path: string; mtime: number | null; text: string | null }[] }>;
