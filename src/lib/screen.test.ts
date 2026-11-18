import { describe, expect, it } from 'vitest';
import { OFF, applyFilters } from './screen.ts';

const row = (code: string, o: object) => ({ code, name: code, amc: 'A', category: 'X', nav: 1, asOf: 0, spark: [], m1: null, m3: null, m6: null, y1: null, y3: null, y5: null, cagr: null, vol: null, sharpe: null, mdd: null, ...o }) as any;
const base = { q: '', cat: '', ...OFF };
const rows = [row('a', { y3: 0.2, mdd: -0.1 }), row('b', { y3: 0.05, mdd: -0.4 }), row('c', {})];

describe('applyFilters', () => {
  it('keeps everything when all limits are off', () => expect(applyFilters(rows, base)).toHaveLength(3));
  it('drops funds with a missing value once a limit is active', () => expect(applyFilters(rows, { ...base, y3: 0.1 }).map((r) => r.code)).toEqual(['a']));
  it('drawdown limit keeps shallower funds only', () => expect(applyFilters(rows, { ...base, dd: -0.2 }).map((r) => r.code)).toEqual(['a']));
});
