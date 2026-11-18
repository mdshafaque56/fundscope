/**
 * Builds public/data/*: schemes.json (screener rows + precomputed metrics) and nav/<code>.json (history).
 *   node scripts/build-data.ts          live: AMFI NAVAll.txt (scheme list) + mfapi.in (NAV history)
 *   node scripts/build-data.ts --demo   synthetic data, for offline dev and as a CI fallback
 * Env: LIMIT (max schemes, default 2500).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cleanSeries, parseDate, sliceFrom, summary, type Series } from '../src/lib/metrics.ts';

const OUT = 'public/data';
const LIMIT = Number(process.env.LIMIT) || 2500;
const demo = process.argv.includes('--demo');
type Meta = { code: string; name: string; amc: string; category: string };

async function amfiSchemes(): Promise<Meta[]> {
  const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt');
  if (!res.ok) throw new Error(`AMFI ${res.status}`);
  const out: Meta[] = [];
  let amc = '', category = '';
  for (const raw of (await res.text()).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const p = line.split(';');
    if (p.length >= 6 && /^\d+$/.test(p[0])) out.push({ code: p[0], name: p[3].trim(), amc, category });
    else if (p.length === 1) {
      const m = /\((.+)\)\s*$/.exec(line);
      if (/schemes/i.test(line) && m) category = m[1]; else amc = line;
    }
  }
  // Direct + Growth plans only: one row per fund, no IDCW/dividend duplicates.
  return out.filter((s) => /direct/i.test(s.name) && /growth/i.test(s.name) && !/idcw|dividend|bonus/i.test(s.name)).slice(0, LIMIT);
}

async function history(code: string): Promise<Series> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`https://api.mfapi.in/mf/${code}`);
      if (!r.ok) throw new Error(String(r.status));
      return cleanSeries(((await r.json()) as { data?: { date: string; nav: string }[] }).data ?? []);
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)));
    }
  }
}

function demoSchemes(): { meta: Meta; series: Series }[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const cats = ['Large Cap Fund', 'Mid Cap Fund', 'Small Cap Fund', 'Flexi Cap Fund', 'ELSS', 'Liquid Fund', 'Corporate Bond Fund'];
  const amcs = ['Aarav', 'Bharat', 'Cauvery', 'Deccan', 'Ekta', 'Ganga', 'Himalaya', 'Indus'];
  const end = parseDate('19-11-2026')!;
  return Array.from({ length: Math.min(LIMIT, 2500) }, (_, i) => {
    const ci = i % cats.length, vol = [0.012, 0.015, 0.019, 0.013, 0.014, 0.0004, 0.002][ci], mu = [0.0004, 0.0005, 0.0006, 0.0004, 0.0004, 0.0002, 0.0003][ci] + (rnd() - 0.5) * 3e-4;
    const t: number[] = [], v: number[] = [];
    let nav = 10 + rnd() * 20;
    for (let d = end - 365 * 9; d <= end; d++) {
      const dow = (d + 4) % 7; // 1970-01-01 was a Thursday
      if (dow === 0 || dow === 6) continue;
      nav *= 1 + mu + vol * gauss();
      t.push(d); v.push(+nav.toFixed(4));
    }
    const cut = i % 5 === 0 ? 1400 : 0;
    return { meta: { code: String(100000 + i), name: `${amcs[i % 8]} ${cats[ci]} ${1 + (i / 7 | 0)} - Direct Plan - Growth`, amc: `${amcs[i % 8]} Mutual Fund`, category: `Demo - ${cats[ci]}` }, series: { t: t.slice(cut), v: v.slice(cut) } };
  });
}

/** ~40 points of the last year, rebased to 100: a tiny trend line for each table row. */
function sparkline(s: Series): number[] {
  const w = sliceFrom(s, s.t[s.t.length - 1] - 365);
  const step = Math.max(1, Math.floor(w.v.length / 40));
  const out: number[] = [];
  for (let i = 0; i < w.v.length; i += step) out.push(+((w.v[i] / w.v[0]) * 100).toFixed(1));
  if ((w.v.length - 1) % step) out.push(+((w.v[w.v.length - 1] / w.v[0]) * 100).toFixed(1));
  return out;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}/nav`, { recursive: true });
  const rows: unknown[] = [];
  let skipped = 0;
  const add = (m: Meta, s: Series) => {
    if (s.t.length < 30) return void skipped++;
    writeFileSync(`${OUT}/nav/${m.code}.json`, JSON.stringify({ t: s.t, v: s.v }));
    rows.push({ ...m, nav: s.v[s.v.length - 1], asOf: s.t[s.t.length - 1], spark: sparkline(s), ...summary(s) });
  };
  if (demo) for (const d of demoSchemes()) add(d.meta, d.series);
  else {
    const list = await amfiSchemes();
    console.log(`AMFI: ${list.length} candidate schemes`);
    let i = 0, done = 0;
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (i < list.length) {
        const m = list[i++];
        try { add(m, await history(m.code)); } catch { skipped++; }
        if (++done % 250 === 0) console.log(`  ${done}/${list.length}`);
      }
    }));
    if (rows.length < 50) throw new Error('too few schemes fetched; refusing to publish live data');
  }
  writeFileSync(`${OUT}/schemes.json`, JSON.stringify({ meta: { generated: new Date().toISOString(), source: demo ? 'demo' : 'AMFI + mfapi.in', skipped }, rows }));
  console.log(`wrote ${rows.length} schemes (${skipped} skipped)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
