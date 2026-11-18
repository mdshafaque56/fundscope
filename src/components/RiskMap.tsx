import { useEffect, useMemo, useRef, useState } from 'react';
import type { Row } from '../lib/data.ts';
import { COLORS, num, pct } from '../lib/format.ts';

type Props = { rows: Row[]; shown: Row[]; selected: string[]; onToggle: (code: string) => void; theme: string };
const M = { l: 46, r: 14, t: 12, b: 28 }, H = 300;
const ok = (r: Row) => r.vol !== null && r.y3 !== null;

/** Canvas scatter of every fund: x = volatility, y = 3Y return. Filtered funds light up; click a dot to compare. */
export function RiskMap({ rows, shown, selected, onToggle, theme }: Props) {
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<{ r: Row; x: number; y: number } | null>(null);

  const ext = useMemo(() => {
    let x1 = 0.05, y0 = 0, y1 = 0.1;
    for (const r of rows) if (ok(r)) { x1 = Math.max(x1, r.vol!); y0 = Math.min(y0, r.y3!); y1 = Math.max(y1, r.y3!); }
    return { x1: x1 * 1.05, y0: y0 - 0.02, y1: y1 * 1.05 + 0.01 };
  }, [rows]);
  const sx = (v: number) => M.l + (v / ext.x1) * (w - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - ext.y0) / (ext.y1 - ext.y0)) * (H - M.t - M.b);
  const pts = useMemo(() => shown.filter(ok).map((r) => ({ r, x: sx(r.vol!), y: sy(r.y3!) })), [shown, w, ext]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current!, ctx = c.getContext('2d')!, dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement), col = (n: string) => css.getPropertyValue(n).trim();
    c.width = w * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    ctx.font = '11px Manrope, system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yv = ext.y0 + ((ext.y1 - ext.y0) * i) / 4, xv = (ext.x1 * i) / 4;
      ctx.strokeStyle = col('--line'); ctx.beginPath(); ctx.moveTo(M.l, sy(yv)); ctx.lineTo(w - M.r, sy(yv)); ctx.stroke();
      ctx.fillStyle = col('--muted'); ctx.textAlign = 'right'; ctx.fillText(pct(yv, 0), M.l - 6, sy(yv) + 4);
      ctx.textAlign = 'center'; ctx.fillText(pct(xv, 0), sx(xv), H - 10);
    }
    ctx.textAlign = 'left'; ctx.fillText('3Y return p.a.', M.l + 6, M.t + 10);
    ctx.textAlign = 'right'; ctx.fillText('Volatility (risk)', w - M.r - 4, H - M.b - 6);
    const on = new Set(shown.map((r) => r.code));
    ctx.fillStyle = col('--line');
    for (const r of rows) if (ok(r) && !on.has(r.code)) { ctx.beginPath(); ctx.arc(sx(r.vol!), sy(r.y3!), 2.2, 0, 7); ctx.fill(); }
    ctx.fillStyle = col('--accent'); ctx.globalAlpha = 0.6;
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    selected.forEach((code, i) => {
      const r = rows.find((x) => x.code === code);
      if (!r || !ok(r)) return;
      const x = sx(r.vol!), y = sy(r.y3!);
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fillStyle = col('--panel'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = COLORS[i]; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = col('--ink'); ctx.textAlign = x > w - 190 ? 'right' : 'left';
      ctx.fillText(r.name.split(' - ')[0].slice(0, 30), x + (x > w - 190 ? -11 : 11), y - 9);
    });
    if (!pts.length) { ctx.fillStyle = col('--muted'); ctx.textAlign = 'center'; ctx.font = '600 14px Manrope, sans-serif'; ctx.fillText('No funds match these limits', w / 2, H / 2); }
  }, [w, rows, shown, pts, selected, theme, ext]); // eslint-disable-line react-hooks/exhaustive-deps

  const near = (e: React.MouseEvent) => {
    const b = cv.current!.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best: (typeof pts)[number] | null = null, bd = 144; // 12px radius, squared
    for (const p of pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  };

  return (
    <section className="panel" aria-label="Risk versus return map">
      <div className="panel-h">
        <h2>Risk vs return</h2>
        <p>Each dot is a fund. Higher and further left means more return for less risk. Click a dot to compare it.</p>
      </div>
      <div className="map" ref={box}>
        <canvas ref={cv} style={{ height: H, cursor: hover ? 'pointer' : 'default' }} role="img" aria-label="Scatter of 3-year return against volatility for every fund. Use the table below to select funds with the keyboard."
          onMouseMove={(e) => { const p = near(e); setHover(p ? { r: p.r, x: p.x, y: p.y } : null); }}
          onMouseLeave={() => setHover(null)} onClick={(e) => { const p = near(e); if (p) onToggle(p.r.code); }} />
        {hover && (
          <div className="maptip" style={{ left: Math.min(hover.x + 12, w - 230), top: Math.max(hover.y - 64, 4) }}>
            <b>{hover.r.name}</b>
            <span>3Y {pct(hover.r.y3)} · Vol {pct(hover.r.vol)} · Sharpe {num(hover.r.sharpe)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
