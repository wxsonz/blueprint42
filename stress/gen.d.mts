export interface StressCase { id: string; title: string; blurb: string }
export const STRESS_SIZES: number[];
export const STRESS_CASES: StressCase[];
export function stressFiles(id: string, n: number): Record<string, string>;
