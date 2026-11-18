import { OFF, PRESETS, type Criteria, type Preset } from '../lib/screen.ts';

const SLIDERS = [
  { k: 'y3', label: 'Minimum 3Y return', min: -0.1, max: 0.4, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}% p.a.` },
  { k: 'dd', label: 'Worst drawdown allowed', min: -0.6, max: 0, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
  { k: 'vol', label: 'Maximum volatility', min: 0, max: 0.4, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
  { k: 'sh', label: 'Minimum Sharpe', min: -1, max: 2, step: 0.1, fmt: (v: number) => v.toFixed(1) },
] as const;

type Props = { f: Criteria; categories: string[]; shown: number; total: number; disabled: boolean; onChange: (p: Partial<Criteria>) => void; onPreset: (p: Preset) => void; onReset: () => void };

export function Filters({ f, categories, shown, total, disabled, onChange, onPreset, onReset }: Props) {
  const active = !!f.q || !!f.cat || SLIDERS.some((s) => f[s.k] !== OFF[s.k]);
  return (
    <aside className="rail" aria-label="Filters">
      <section>
        <h3>Quick screens</h3>
        <div className="presets">
          {PRESETS.map((p) => <button key={p.id} disabled={disabled} onClick={() => onPreset(p)}><b>{p.label}</b><small>{p.hint}</small></button>)}
        </div>
      </section>
      <section className="find">
        <h3>Find a fund</h3>
        <input type="search" placeholder="Fund or AMC name" aria-label="Search funds" value={f.q} onChange={(e) => onChange({ q: e.target.value })} />
        <select aria-label="Category" value={f.cat} onChange={(e) => onChange({ cat: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </section>
      <section>
        <h3>Limits</h3>
        {SLIDERS.map((s) => (
          <div className="slider" key={s.k}>
            <label htmlFor={`f-${s.k}`}><span>{s.label}</span><output>{f[s.k] === OFF[s.k] ? 'Any' : s.fmt(f[s.k])}</output></label>
            <input id={`f-${s.k}`} type="range" min={s.min} max={s.max} step={s.step} value={f[s.k]} onChange={(e) => onChange({ [s.k]: parseFloat(e.target.value) } as Partial<Criteria>)} />
          </div>
        ))}
      </section>
      <div className="rail-foot"><span aria-live="polite">{shown.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} funds</span><button onClick={onReset} disabled={!active}>Reset</button></div>
    </aside>
  );
}
