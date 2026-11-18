import type { Num } from './metrics.ts';
export const COLORS = ['#5b3df5', '#f08a00', '#0a9d6b', '#d6336c'];
export const pct = (x: Num, d = 1) => (x === null ? '—' : `${(x * 100).toFixed(d)}%`);
export const num = (x: Num, d = 2) => (x === null ? '—' : x.toFixed(d));
export const dayLabel = (d: number) => new Date(d * 86400000).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
