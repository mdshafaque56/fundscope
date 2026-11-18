import { describe, expect, it } from 'vitest';
import { cagr, cleanSeries, drawdown, monthsBack, parseDate, periodReturn } from './metrics.ts';

const day = (s: string) => parseDate(s)!;

describe('parseDate', () => {
  it('parses both feeds and rejects junk', () => {
    expect(parseDate('01-01-1970')).toBe(0);
    expect(parseDate('02-Jan-1970')).toBe(1);
    for (const bad of ['31-02-2024', '', 'N.A.', '2024-01-01', null]) expect(parseDate(bad)).toBeNull();
  });
});

describe('cleanSeries', () => {
  it('drops bad NAVs, dedupes and sorts', () => {
    const s = cleanSeries([
      { date: '03-01-2024', nav: '12' }, { date: '01-01-2024', nav: '10' }, { date: '02-01-2024', nav: 'N.A.' },
      { date: '01-01-2024', nav: '11' }, { date: '04-01-2024', nav: '0' }, { date: 'bad', nav: '5' },
    ]);
    expect(s.v).toEqual([11, 12]);
    expect(s.t[1] - s.t[0]).toBe(2);
  });
});

describe('returns', () => {
  const s = cleanSeries([{ date: '31-01-2023', nav: 100 }, { date: '31-01-2024', nav: 110 }, { date: '31-01-2025', nav: 121 }]);
  it('clamps month ends', () => expect(monthsBack(day('31-03-2024'), 1)).toBe(day('29-02-2024')));
  it('1Y is absolute, 2Y is annualised', () => {
    expect(periodReturn(s, 12)).toBeCloseTo(0.1, 3);
    expect(periodReturn(s, 24)).toBeCloseTo(0.1, 3);
  });
  it('returns null when history is too short', () => expect(periodReturn(s, 60)).toBeNull());
  it('cagr', () => expect(cagr(s)).toBeCloseTo(0.1, 3));
});

describe('drawdown', () => {
  it('finds max drawdown and recovery', () => {
    const d = drawdown({ t: [0, 1, 2, 3, 4], v: [100, 120, 90, 100, 125] });
    expect(d.max).toBeCloseTo(-0.25, 6);
    expect(d.recoveryDays).toBe(2);
  });
  it('monotonic series has no drawdown', () => expect(drawdown({ t: [0, 1], v: [1, 2] }).max).toBe(0));
});
