import { Fragment, memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { loadRows, type Row } from './lib/data.ts';
import { csvCell, dayLabel, num, pct } from './lib/format.ts';
import { Compare } from './components/Compare.tsx';
import { Filters } from './components/Filters.tsx';
import { RiskMap } from './components/RiskMap.tsx';
import { OFF, applyFilters, type Preset } from './lib/screen.ts';

type Key = 'name' | 'category' | 'y1' | 'y3' | 'y5' | 'vol' | 'sharpe' | 'mdd';
const COLS: { key: Key; label: string; text?: boolean; show: (r: Row) => string }[] = [
  { key: 'name', label: 'Scheme', text: true, show: (r) => r.name },
  { key: 'category', label: 'Category', text: true, show: (r) => r.category },
  { key: 'y1', label: '1Y', show: (r) => pct(r.y1) },
  { key: 'y3', label: '3Y p.a.', show: (r) => pct(r.y3) },
  { key: 'y5', label: '5Y p.a.', show: (r) => pct(r.y5) },
  { key: 'vol', label: 'Volatility', show: (r) => pct(r.vol) },
  { key: 'sharpe', label: 'Sharpe', show: (r) => num(r.sharpe) },
  { key: 'mdd', label: 'Max drawdown', show: (r) => pct(r.mdd) },
];
const ROW = 54, VIEW = 560, MAX_COMPARE = 4;

function readUrl() {
  const p = new URLSearchParams(location.search);
  const sort = p.get('sort') as Key;
  const n = (k: string, d: number) => { const v = parseFloat(p.get(k) ?? ''); return Number.isFinite(v) ? v : d; };
  return {
    y3: n('y3', OFF.y3), dd: n('dd', OFF.dd), vol: n('vol', OFF.vol), sh: n('sh', OFF.sh),
    q: p.get('q') ?? '', cat: p.get('cat') ?? '', sort: COLS.some((c) => c.key === sort) ? sort : ('y3' as Key),
    dir: p.get('dir') === 'asc' ? 'asc' as const : 'desc' as const, sel: (p.get('sel') ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE),
  };
}

function Spark({ v }: { v?: number[] }) {
  if (!v || v.length < 2) return <span className="muted">—</span>;
  const lo = Math.min(...v), hi = Math.max(...v), w = 92, h = 28;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 3 - ((y - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1)}`).join(' ');
  return <svg className={`spark ${v[v.length - 1] >= v[0] ? 'up' : 'dn'}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline points={pts} /></svg>;
}

const TableRow = memo(function TableRow({ r, i, picked, locked, onToggle }: { r: Row; i: number; picked: boolean; locked: boolean; onToggle: (c: string) => void }) {
  return (
    <div role="row" className={`row${picked ? ' picked' : ''}`} style={{ top: i * ROW, height: ROW }} aria-rowindex={i + 2} aria-selected={picked} onClick={() => onToggle(r.code)}>
      <div role="cell"><input type="checkbox" checked={picked} disabled={locked && !picked} onChange={() => {}} aria-label={`Compare ${r.name}`} /></div>
      {COLS.map((c) => {
        const v = c.show(r);
        const raw = c.key === 'y1' || c.key === 'y3' || c.key === 'y5' ? r[c.key] : null;
        const tone = raw === null ? '' : raw < 0 ? ' neg' : ' pos';
        return (
          <Fragment key={c.key}>
            <div role="cell" className={`${c.text ? 'txt' : 'n'}${tone}`} title={c.text ? v : undefined}>
              {c.key === 'name' ? <><b>{v}</b><small>{r.amc}</small></> : v}
            </div>
            {c.key === 'category' && <div role="cell"><Spark v={r.spark} /></div>}
          </Fragment>
        );
      })}
    </div>
  );
});

export function App() {
  const [state, setState] = useState(readUrl);
  const [load, setLoad] = useState<{ status: 'loading' | 'error' | 'ready'; rows: Row[]; error?: string; generated?: string; source?: string }>({ status: 'loading', rows: [] });
  const [attempt, setAttempt] = useState(0);
  const [top, setTop] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [note, setNote] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const flipTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode: theme just won't persist */ }
  };
  const q = useDeferredValue(state.q);

  useEffect(() => {
    setLoad((l) => ({ ...l, status: 'loading' }));
    loadRows().then((d) => setLoad({ status: 'ready', ...d }), (e: Error) => setLoad({ status: 'error', rows: [], error: e.message }));
  }, [attempt]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  useEffect(() => { // shareable links: all view state lives in the query string
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    p.set('sort', state.sort); p.set('dir', state.dir);
    for (const k of ['y3', 'dd', 'vol', 'sh'] as const) if (state[k] !== OFF[k]) p.set(k, String(state[k]));
    if (state.sel.length) p.set('sel', state.sel.join(','));
    history.replaceState(null, '', `?${p}`);
  }, [state]);

  const categories = useMemo(() => [...new Set(load.rows.map((r) => r.category))].sort(), [load.rows]);
  const { list, ms } = useMemo(() => {
    const t0 = performance.now();
    const out = applyFilters(load.rows, { ...state, q });
    const k = state.sort, sign = state.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x === null && y === null) return 0;
      if (x === null) return 1; // missing values always sink to the bottom
      if (y === null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sign;
    });
    return { list: out, ms: performance.now() - t0 };
  }, [load.rows, q, state.cat, state.sort, state.dir, state.y3, state.dd, state.vol, state.sh]);

  const byCode = useMemo(() => new Map(load.rows.map((r) => [r.code, r])), [load.rows]);
  const funds = state.sel.map((c) => byCode.get(c)).filter((r): r is Row => !!r);
  const locked = state.sel.length >= MAX_COMPARE;
  const toggle = (code: string) => setState((s) => {
    if (s.sel.includes(code)) { setNote(''); return { ...s, sel: s.sel.filter((c) => c !== code) }; }
    if (s.sel.length >= MAX_COMPARE) { setNote('You can compare up to 4 funds. Remove one to add another.'); return s; }
    setNote(''); return { ...s, sel: [...s.sel, code] };
  });
  const sortBy = (key: Key) => setState((s) => ({ ...s, sort: key, dir: s.sort === key && s.dir === 'desc' ? 'asc' : key === 'name' || key === 'category' ? 'asc' : 'desc' }));
  const clearFilters = () => setState((s) => ({ ...s, ...OFF, q: '', cat: '' }));
  const applyPreset = (p: Preset) => setState((s) => ({ ...s, ...OFF, ...p.f, sort: p.sort, dir: p.dir }));
  const exportCsv = () => {
    const csv = [COLS.map((c) => c.label).join(','), ...list.map((r) => COLS.map((c) => csvCell(c.show(r))).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'funds.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const start = Math.max(0, Math.floor(top / ROW) - 6), end = Math.min(list.length, Math.ceil((top + VIEW) / ROW) + 6);
  const asOf = load.rows.reduce((m, r) => Math.max(m, r.asOf), 0);

  return (
    <>
      {!online && <div className="banner" role="alert">You're offline. Showing what's already loaded; new fund histories can't be fetched.</div>}
      <header className="bar">
        <span className="logo"><i /> Fundscope</span>
        <span className="meta">{load.status === 'ready' ? `${load.rows.length.toLocaleString('en-IN')} schemes · ${categories.length} categories · NAV as of ${dayLabel(asOf)}${load.source === 'demo' ? ' · demo data' : ''}` : 'Indian mutual funds, screened by risk and return'}</span>
        <button className="theme" onClick={flipTheme} aria-pressed={theme === 'dark'}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
      </header>
      <div className="app">
        <Filters f={state} categories={categories} shown={list.length} total={load.rows.length} disabled={load.status !== 'ready'}
          onChange={(p) => setState((s) => ({ ...s, ...p }))} onPreset={applyPreset} onReset={() => setState((s) => ({ ...s, ...OFF, q: '', cat: '' }))} />

      <main>
        {load.status === 'ready' ? <RiskMap rows={load.rows} shown={list} selected={state.sel} onToggle={toggle} theme={theme} /> : <div className="panel" aria-busy="true"><span className="skeleton" style={{ height: 300 }} /></div>}
        <div className="controls">
          <b>{list.length.toLocaleString('en-IN')} funds</b>
          <span className="muted">sorted in {ms < 1 ? '<1' : ms.toFixed(0)} ms</span>
          {load.status === 'ready' && <span className="hint">{funds.length ? 'Click a row again to remove it' : 'Click a row or a dot on the map to compare (up to 4)'}</span>}
          <button onClick={exportCsv} disabled={!list.length}>Export CSV</button>
        </div>
        <p className="note" role="status">{note}</p>

        <div className="table" role="table" aria-label="Mutual fund schemes" aria-rowcount={list.length + 1}>
          <div className="row head" role="row">
            <div role="columnheader"><span className="sr">Compare</span></div>
            {COLS.map((c) => (
              <Fragment key={c.key}>
                <div role="columnheader" aria-sort={state.sort === c.key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={c.text ? 'txt' : 'n'}>
                  <button onClick={() => sortBy(c.key)}>{c.label}{state.sort === c.key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
                </div>
                {c.key === 'category' && <div role="columnheader" className="txt"><span>1Y trend</span></div>}
              </Fragment>
            ))}
          </div>
          <div className="body" style={{ height: VIEW }} onScroll={(e) => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-busy={load.status === 'loading'}>
            {load.status === 'loading' && Array.from({ length: 10 }, (_, i) => <div key={i} className="row skel" style={{ position: 'static', height: ROW }}>{Array.from({ length: 10 }, (_, j) => <div key={j}><span className="skeleton" /></div>)}</div>)}
            {load.status === 'error' && <div className="state"><h2>Couldn't load fund data</h2><p>{load.error}</p><button className="primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button></div>}
            {load.status === 'ready' && list.length === 0 && <div className="state"><h2>No schemes match</h2><p>No fund passes every filter. Loosen a limit or clear them all.</p><button className="primary" onClick={clearFilters}>Clear filters</button></div>}
            {load.status === 'ready' && list.length > 0 && (
              <div style={{ height: list.length * ROW, position: 'relative' }}>
                {list.slice(start, end).map((r, i) => <TableRow key={r.code} r={r} i={start + i} picked={state.sel.includes(r.code)} locked={locked} onToggle={toggle} />)}
              </div>
            )}
          </div>
        </div>

        <Compare funds={funds} onRemove={toggle} />
        {funds.length > 0 && (
          <div className="dock" role="region" aria-label="Selected funds">
            <span>{funds.length} of {MAX_COMPARE} selected</span>
            <button className="primary" onClick={() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' })}>View comparison</button>
            <button onClick={() => setState((s) => ({ ...s, sel: [] }))}>Clear</button>
          </div>
        )}
      </main>
      </div>
      <footer>Returns over 1 year are annualised. Volatility and Sharpe use daily NAVs over 3 years with a 6.5% risk-free rate. Past performance does not predict future returns.</footer>
    </>
  );
}
