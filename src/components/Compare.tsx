import { useEffect, useMemo, useState } from 'react';
import { loadSeries, type Row } from '../lib/data.ts';
import { cagr, drawdown, monthsBack, periodReturn, rebase, sliceFrom, summary, type Series } from '../lib/metrics.ts';
import { COLORS, num, pct } from '../lib/format.ts';
import { Chart, type Line } from './Chart.tsx';

const RANGES = [['6M', 6], ['1Y', 12], ['3Y', 36], ['5Y', 60], ['MAX', 0]] as const;
type State = { s?: Series; err?: string };

export function Compare({ funds, onRemove }: { funds: Row[]; onRemove: (code: string) => void }) {
  const [data, setData] = useState<Record<string, State>>({});
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('3Y');
  const [attempt, setAttempt] = useState(0);
  const key = funds.map((f) => f.code).join();

  useEffect(() => {
    let live = true;
    for (const f of funds) {
      if (data[f.code]?.s) continue;
      loadSeries(f.code).then((s) => live && setData((d) => ({ ...d, [f.code]: { s } })), (e: Error) => live && setData((d) => ({ ...d, [f.code]: { err: e.message } })));
    }
    return () => { live = false; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const months = RANGES.find((r) => r[0] === range)![1];
  const view = useMemo(() => {
    const ready = funds.map((f, i) => ({ f, i, s: data[f.code]?.s })).filter((x): x is { f: Row; i: number; s: Series } => !!x.s);
    const end = Math.max(0, ...ready.map((x) => x.s.t[x.s.t.length - 1]));
    // MAX = since the youngest fund began, so every line starts at 100 on the same day.
    const start = months ? monthsBack(end, months) : Math.max(0, ...ready.map((x) => x.s.t[0]));
    const items = ready.map((x) => ({ ...x, w: sliceFrom(x.s, start), enough: x.s.t[0] <= start + 7 }));
    return { items: items.filter((x) => x.enough && x.w.t.length > 1), short: items.filter((x) => !x.enough) };
  }, [data, funds, months]);

  if (!funds.length) return <section id="compare" className="tray empty"><h2>Compare funds</h2><p>Tick up to four funds in the table to see returns, drawdown and risk side by side.</p></section>;

  const lines = (f: (w: Series) => number[]): Line[] => view.items.map(({ f: row, i, w }) => ({ label: row.name, color: COLORS[i], t: w.t, y: f(w) }));
  const dds = view.items.map((x) => drawdown(x.w));
  const metrics: { label: string; get: (k: number) => number | null; fmt: (v: number | null) => string; best: 'max' | 'min' }[] = [
    { label: 'CAGR since launch', get: (k) => cagr(view.items[k].s), fmt: (v) => pct(v), best: 'max' },
    { label: '1Y return', get: (k) => periodReturn(view.items[k].s, 12), fmt: (v) => pct(v), best: 'max' },
    { label: '3Y return (p.a.)', get: (k) => periodReturn(view.items[k].s, 36), fmt: (v) => pct(v), best: 'max' },
    { label: '5Y return (p.a.)', get: (k) => periodReturn(view.items[k].s, 60), fmt: (v) => pct(v), best: 'max' },
    { label: 'Volatility (3Y)', get: (k) => summary(view.items[k].s).vol, fmt: (v) => pct(v), best: 'min' },
    { label: 'Sharpe (3Y)', get: (k) => summary(view.items[k].s).sharpe, fmt: (v) => num(v), best: 'max' },
    { label: `Max drawdown (${range})`, get: (k) => dds[k].max, fmt: (v) => pct(v), best: 'max' },
    { label: 'Recovery (days)', get: (k) => dds[k].recoveryDays, fmt: (v) => (v === null ? 'not yet' : String(v)), best: 'min' },
  ];

  return (
    <section id="compare" className="tray" aria-label="Fund comparison">
      <div className="tray-head">
        <h2>Compare funds</h2>
        <div role="group" aria-label="Time range" className="seg">
          {RANGES.map(([l]) => <button key={l} aria-pressed={range === l} onClick={() => setRange(l)}>{l}</button>)}
        </div>
      </div>
      <ul className="chips">
        {funds.map((f, i) => {
          const st = data[f.code];
          return (
            <li key={f.code} style={{ borderTopColor: COLORS[i] }}>
              <div><span>{f.name}</span><small>1Y {pct(f.y1)} · 3Y {pct(f.y3)} · Sharpe {num(f.sharpe)}</small></div>
              {!st && <em className="skeleton-text">loading…</em>}
              {st?.err && <><em className="err">{st.err}</em><button onClick={() => { setData((d) => { const { [f.code]: _, ...rest } = d; return rest; }); setAttempt((a) => a + 1); }}>Retry</button></>}
              <button aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.code)}>✕</button>
            </li>
          );
        })}
      </ul>
      {view.short.length > 0 && <p className="note">{view.short.map((x) => x.f.name).join(', ')} {view.short.length > 1 ? 'have' : 'has'} less than {range} of history and {view.short.length > 1 ? 'are' : 'is'} left out of the charts.</p>}
      {view.items.length === 0 ? (
        funds.every((f) => data[f.code]?.err) ? null : <div className="chart skeleton" aria-busy="true" aria-label="Loading charts" />
      ) : (
        <>
          <div className="charts">
            <Chart title={`Growth of ₹100 (${range})`} lines={lines(rebase)} fmt={(y) => y.toFixed(0)} />
            <Chart title="Drawdown from peak" area lines={view.items.map(({ f, i, w }, k) => ({ label: f.name, color: COLORS[i], t: w.t, y: dds[k].dd.map((d) => d * 100) }))} fmt={(y) => `${y.toFixed(0)}%`} />
          </div>
          <div className="scroll-x">
            <table className="metrics">
              <thead><tr><th /> {view.items.map(({ f, i }) => <th key={f.code}><i style={{ background: COLORS[i] }} /> {f.name}</th>)}</tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const vals = view.items.map((_, k) => m.get(k));
                  const ok = vals.filter((v): v is number => v !== null);
                  const best = ok.length > 1 ? (m.best === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
                  return <tr key={m.label}><th scope="row">{m.label}</th>{vals.map((v, k) => <td key={k} className={v !== null && v === best ? 'best' : ''}>{m.fmt(v)}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
