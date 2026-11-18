import type { Series, Summary } from './metrics.ts';

export type Row = { code: string; name: string; amc: string; category: string; nav: number; asOf: number; spark: number[] } & Summary;
const base = import.meta.env.BASE_URL + 'data/';

async function getJSON(path: string): Promise<any> {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`Request failed (${r.status}) for ${path}`);
  return r.json();
}

export async function loadRows(): Promise<{ rows: Row[]; generated?: string; source?: string }> {
  const j = await getJSON('schemes.json');
  if (!Array.isArray(j?.rows)) throw new Error('schemes.json is malformed');
  const rows = j.rows.filter((r: any) => r && typeof r.code === 'string' && typeof r.name === 'string');
  return { rows, generated: j.meta?.generated, source: j.meta?.source };
}

const cache = new Map<string, Promise<Series>>();
export function loadSeries(code: string): Promise<Series> {
  if (!cache.has(code)) {
    const p = getJSON(`nav/${encodeURIComponent(code)}.json`).then((j) => {
      if (!Array.isArray(j?.t) || !Array.isArray(j?.v) || j.t.length !== j.v.length || j.t.length < 2) throw new Error('NAV history is malformed');
      return j as Series;
    });
    p.catch(() => cache.delete(code)); // failed loads can be retried
    cache.set(code, p);
  }
  return cache.get(code)!;
}
