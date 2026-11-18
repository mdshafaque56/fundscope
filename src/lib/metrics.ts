/** Pure, dependency-free fund maths. Days are integer epoch-days (UTC), so there are no timezone surprises. */
export type Series = { t: number[]; v: number[] };
export type Num = number | null;
export type Summary = { m1: Num; m3: Num; m6: Num; y1: Num; y3: Num; y5: Num; cagr: Num; vol: Num; sharpe: Num; mdd: Num };

export const RISK_FREE = 0.065; // annual, documented in README
const DAY = 86400000;
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Accepts dd-mm-yyyy (mfapi) and dd-Mon-yyyy (AMFI). Returns null for anything invalid. */
export function parseDate(s: unknown): number | null {
  const m = /^(\d{1,2})-(\d{1,2}|[A-Za-z]{3})-(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const mon = /^\d+$/.test(m[2]) ? +m[2] - 1 : MON.indexOf(m[2].toLowerCase());
  const d = +m[1];
  if (mon < 0 || mon > 11 || d < 1 || d > 31) return null;
  const ms = Date.UTC(+m[3], mon, d);
  return new Date(ms).getUTCDate() === d ? Math.floor(ms / DAY) : null; // rejects 31-Feb
}

/** Drops bad rows (NaN, <=0, "N.A.", bad dates), de-duplicates dates, sorts ascending. */
export function cleanSeries(rows: { date: string; nav: string | number }[]): Series {
  const byDay = new Map<number, number>();
  for (const r of rows) {
    const t = parseDate(r?.date);
    const v = typeof r?.nav === 'number' ? r.nav : parseFloat(String(r?.nav));
    if (t !== null && Number.isFinite(v) && v > 0) byDay.set(t, v);
  }
  const t = [...byDay.keys()].sort((a, b) => a - b);
  return { t, v: t.map((k) => byDay.get(k)!) };
}

/** Index of the last point on or before day x, or -1. */
export function idxAtOrBefore(t: number[], x: number): number {
  let lo = 0, hi = t.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t[m] <= x) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** Same calendar day `months` earlier, clamped to month end (31 Mar - 1m => 28/29 Feb). */
export function monthsBack(day: number, months: number): number {
  const d = new Date(day * DAY);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const lastDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.floor(first.getTime() / DAY) + Math.min(d.getUTCDate(), lastDate) - 1;
}

export function sliceFrom(s: Series, day: number): Series {
  const i = idxAtOrBefore(s.t, day - 1) + 1;
  return { t: s.t.slice(i), v: s.v.slice(i) };
}

/** Return over the last `months` calendar months. >12 months is annualised (CAGR). null if history is too short or stale. */
export function periodReturn(s: Series, months: number): Num {
  const n = s.t.length;
  if (n < 2) return null;
  const end = s.t[n - 1];
  const target = monthsBack(end, months);
  const i = idxAtOrBefore(s.t, target);
  if (i < 0 || target - s.t[i] > 7 || i === n - 1) return null;
  const ratio = s.v[n - 1] / s.v[i];
  const years = (end - s.t[i]) / 365.25;
  return months > 12 ? Math.pow(ratio, 1 / years) - 1 : ratio - 1;
}

export function cagr(s: Series): Num {
  const n = s.t.length;
  const years = n > 1 ? (s.t[n - 1] - s.t[0]) / 365.25 : 0;
  return years >= 1 ? Math.pow(s.v[n - 1] / s.v[0], 1 / years) - 1 : null;
}

/** Annualised st.dev of daily simple returns (252 trading days). Needs >= 30 returns. */
export function volatility(s: Series): Num {
  const r: number[] = [];
  for (let i = 1; i < s.v.length; i++) r.push(s.v[i] / s.v[i - 1] - 1);
  if (r.length < 30) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function drawdown(s: Series) {
  let peak = -Infinity, peakI = 0, max = 0, maxPeak = 0, maxTrough = 0;
  const dd = s.v.map((v, i) => {
    if (v > peak) { peak = v; peakI = i; }
    const d = v / peak - 1;
    if (d < max) { max = d; maxPeak = peakI; maxTrough = i; }
    return d;
  });
  let rec = -1;
  if (max < 0) for (let i = maxTrough; i < s.v.length; i++) if (s.v[i] >= s.v[maxPeak]) { rec = i; break; }
  return { dd, max, recoveryDays: max === 0 ? 0 : rec < 0 ? null : s.t[rec] - s.t[maxTrough] };
}

export const rebase = (s: Series): number[] => s.v.map((x) => (x / s.v[0]) * 100);

/** Headline numbers. Vol / Sharpe use the last 3 years (or all history if shorter). */
export function summary(s: Series): Summary {
  const w = sliceFrom(s, s.t[s.t.length - 1] - 1096);
  const vol = volatility(w);
  const wr = cagr(w) ?? periodReturn(w, 6);
  return {
    m1: periodReturn(s, 1), m3: periodReturn(s, 3), m6: periodReturn(s, 6),
    y1: periodReturn(s, 12), y3: periodReturn(s, 36), y5: periodReturn(s, 60),
    cagr: cagr(s), vol, sharpe: vol && wr !== null && vol > 0 ? (wr - RISK_FREE) / vol : null,
    mdd: s.v.length > 1 ? drawdown(s).max : null,
  };
}
