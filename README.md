# Fund Screener

Screen and compare Indian mutual funds (AMFI scheme list + mfapi.in NAV history). Static site, deployed on GitHub Pages.

## Run
```bash
npm install
npm run data:demo   # offline synthetic data (or `npm run data` for live AMFI + mfapi.in, LIMIT=2500 by default)
npm run dev         # http://localhost:5173
npm test && npm run build
```
Needs Node 22.18+ (the data script runs TypeScript natively).

## Deploy
Push to `main` with **Settings → Pages → Source: GitHub Actions**. The workflow tests, refreshes data (falls back to demo data if the live sources fail), builds and publishes. It also re-runs daily so NAVs stay fresh.

## How it works
- `scripts/build-data.ts` parses AMFI `NAVAll.txt` (Direct + Growth plans only), pulls each history from mfapi.in, and writes `schemes.json` (rows with precomputed metrics) plus one `nav/<code>.json` per fund. The browser only reads static files: no CORS, no rate limits, no backend.
- `src/lib/metrics.ts` is pure and tested. It is used by both the build script and the compare view, so table and charts always agree.
- Table: windowed (virtualised) rows, multi-state sort, search + category filter, all view state in the URL (`?q=&cat=&sort=&dir=&sel=`). The header shows how long the last sort took.
- Compare (max 4): growth of ₹100, drawdown from peak, and a metrics table with the best value highlighted. Histories load lazily with per-fund retry.
- States: skeleton loading, empty (with clear filters), error (with retry), offline banner, empty compare tray.

## Method (what the numbers mean)
- NAV rows with bad dates, `N.A.`, zero/negative values are dropped; duplicate dates are collapsed; series are sorted ascending.
- Period returns use calendar dates (nearest NAV on or before the target date, max 7 days stale). Periods over 1 year are annualised (CAGR). Funds with too little history show `—`, never 0.
- Volatility: st. dev. of daily returns × √252, over the last 3 years. Sharpe: (annualised return − 6.5% risk-free) / volatility.
- Max drawdown: worst fall from a running peak; recovery = days from the trough back to that peak (`not yet` if it hasn't).
- Compare MAX range starts at the youngest fund's first NAV so every line begins at 100 on the same day.
