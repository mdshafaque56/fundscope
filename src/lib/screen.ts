import type { Row } from './data.ts';

/** Everything the left rail can filter on. A range value equal to OFF[key] means "no limit". */
export type Criteria = { q: string; cat: string; y3: number; dd: number; vol: number; sh: number };
export const OFF = { y3: -0.1, dd: -0.6, vol: 0.4, sh: -1 } as const;

/** Funds with no value for an active limit are excluded, never guessed. */
export function applyFilters(rows: Row[], f: Criteria): Row[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) =>
    (!f.cat || r.category === f.cat) &&
    (!needle || `${r.name} ${r.amc}`.toLowerCase().includes(needle)) &&
    (f.y3 === OFF.y3 || (r.y3 !== null && r.y3 >= f.y3)) &&
    (f.dd === OFF.dd || (r.mdd !== null && r.mdd >= f.dd)) &&
    (f.vol === OFF.vol || (r.vol !== null && r.vol <= f.vol)) &&
    (f.sh === OFF.sh || (r.sharpe !== null && r.sharpe >= f.sh)));
}

export type Preset = { id: string; label: string; hint: string; f: Partial<Criteria>; sort: 'y3' | 'mdd' | 'sharpe' | 'vol'; dir: 'asc' | 'desc' };
export const PRESETS: Preset[] = [
  { id: 'steady', label: 'Steady compounders', hint: '3Y at least 12% p.a., drawdown within 30%', f: { y3: 0.12, dd: -0.3 }, sort: 'y3', dir: 'desc' },
  { id: 'shallow', label: 'Shallow drawdowns', hint: 'Never fell more than 15% from a peak', f: { dd: -0.15 }, sort: 'mdd', dir: 'desc' },
  { id: 'sharpe', label: 'Best risk-adjusted', hint: 'Sharpe of 0.8 or more', f: { sh: 0.8 }, sort: 'sharpe', dir: 'desc' },
  { id: 'calm', label: 'Low volatility', hint: 'Volatility of 10% or less', f: { vol: 0.1 }, sort: 'vol', dir: 'asc' },
];
