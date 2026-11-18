import { useMemo, useState } from 'react';
import { idxAtOrBefore } from '../lib/metrics.ts';
import { dayLabel } from '../lib/format.ts';

export type Line = { label: string; color: string; t: number[]; y: number[] };
const W = 760, H = 260, PAD = { l: 48, r: 12, t: 12, b: 24 };

export function Chart({ lines, fmt, title, area }: { lines: Line[]; fmt: (y: number) => string; title: string; area?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const l of lines) for (let i = 0; i < l.t.length; i++) {
      x0 = Math.min(x0, l.t[i]); x1 = Math.max(x1, l.t[i]); y0 = Math.min(y0, l.y[i]); y1 = Math.max(y1, l.y[i]);
    }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
    const sy = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    const paths = lines.map((l) => { // downsample to ~600 pts for smooth rendering
      const step = Math.max(1, Math.floor(l.t.length / 600)); let d = '';
      for (let i = 0; i < l.t.length; i += step) d += `${d ? 'L' : 'M'}${sx(l.t[i]).toFixed(1)},${sy(l.y[i]).toFixed(1)}`;
      return d;
    });
    return { x0, x1, y0, y1, sx, sy, paths };
  }, [lines]);

  const yTicks = [0, 1, 2, 3].map((i) => g.y0 + ((g.y1 - g.y0) * i) / 3);
  const xTicks = [0, 1, 2, 3].map((i) => g.x0 + ((g.x1 - g.x0) * i) / 3);
  const hx = hover === null ? null : g.x0 + hover * (g.x1 - g.x0);

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${lines.map((l) => l.label).join(', ')}`}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const f = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r); setHover(Math.min(1, Math.max(0, f))); }}
        onMouseLeave={() => setHover(null)}>
        {yTicks.map((y) => <g key={y}><line x1={PAD.l} x2={W - PAD.r} y1={g.sy(y)} y2={g.sy(y)} className="grid" /><text x={PAD.l - 6} y={g.sy(y) + 4} textAnchor="end">{fmt(y)}</text></g>)}
        {xTicks.map((x) => <text key={x} x={g.sx(x)} y={H - 6} textAnchor="middle">{dayLabel(Math.round(x))}</text>)}
        {area && lines.map((l, i) => <path key={`a${l.label}`} d={`${g.paths[i]}L${g.sx(l.t[l.t.length - 1]).toFixed(1)},${g.sy(0).toFixed(1)}L${g.sx(l.t[0]).toFixed(1)},${g.sy(0).toFixed(1)}Z`} fill={l.color} opacity="0.14" />)}
        {lines.map((l, i) => <path key={l.label} d={g.paths[i]} stroke={l.color} className="line" />)}
        {hx !== null && <line x1={g.sx(hx)} x2={g.sx(hx)} y1={PAD.t} y2={H - PAD.b} className="cursor" />}
      </svg>
      {hx !== null && (
        <div className="tip" role="status">
          <b>{dayLabel(Math.round(hx))}</b>
          {lines.map((l) => { const i = idxAtOrBefore(l.t, hx); return i < 0 ? null : <span key={l.label}><i style={{ background: l.color }} />{fmt(l.y[i])}</span>; })}
        </div>
      )}
    </figure>
  );
}
