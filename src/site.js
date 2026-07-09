// Generates out/site.html (artifact fragment) and docs/index.html (full document
// for GitHub Pages) — a searchable console of live EA-relevant opportunities.
// Titles render in full (no truncation) — the list is not virtualized, since the
// live population is bounded by open deadlines rather than growing unbounded.
// All per-item text (titles, funders, summaries — scraped, untrusted)
// is rendered client-side through esc(); only literal source names and computed
// numbers/dates are ever interpolated server-side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);
const db = openDb();

const rows = db.prepare(`
  SELECT id, title, url, funder, source, type, deadline, countries, sectors, amount, first_seen
  FROM opportunities
  WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline ASC
`).all(today);

const items = rows.map((r) => ({
  id: r.id, t: r.title, u: r.url, f: r.funder ?? '', s: r.source,
  y: r.type === 'grant' ? 'grant' : r.type === 'tender' ? 'tender' : 'fellowship',
  d: r.deadline, c: JSON.parse(r.countries ?? '[]'), k: JSON.parse(r.sectors ?? '[]'),
  a: r.amount, n: r.first_seen.slice(0, 10),
}));

const nSources = db.prepare('SELECT COUNT(DISTINCT source) c FROM opportunities').get().c;
const nTotal = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c;

// Daily discovery counts, last 14 days — for the sparkline. Full table (not just
// currently-live items), so an item that has since expired still counts on the
// day it was first found.
const dailyRaw = db.prepare(`
  SELECT substr(first_seen, 1, 10) d, COUNT(*) c
  FROM opportunities
  WHERE ea_relevant = 1 AND first_seen >= datetime('now', '-13 days', 'start of day')
  GROUP BY d
`).all();
const dailyMap = new Map(dailyRaw.map((r) => [r.d, r.c]));
const daily = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
  return { date: d, count: dailyMap.get(d) ?? 0 };
});

// Source ledger — names here are literal strings from our own fetcher code
// (e.g. "World Bank Procurement"), never scraped text, so safe to interpolate directly.
const sourceMeta = db.prepare(`
  SELECT source, COUNT(*) total, MAX(last_seen) latest FROM opportunities GROUP BY source ORDER BY total DESC
`).all();

function sparklineSvg(series) {
  const W = 220, H = 44, PAD = 3;
  const max = Math.max(1, ...series.map((d) => d.count));
  const stepX = (W - 2 * PAD) / (series.length - 1);
  const pts = series.map((d, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (d.count / max) * (H - 2 * PAD),
    ...d,
  }));
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length - 1].x.toFixed(1)},${H - PAD} L${pts[0].x.toFixed(1)},${H - PAD} Z`;
  const last = pts[pts.length - 1];
  const dots = pts.map((p) =>
    `<circle class="spark-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"><title>${p.date}: ${p.count} discovered</title></circle>`
  ).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Opportunities discovered per day, last 14 days">
    <path class="spark-area" d="${area}"></path>
    <path class="spark-line" d="${line}"></path>
    ${dots}
    <circle class="spark-end" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.5"></circle>
  </svg>`;
}

const json = JSON.stringify(items).replace(/</g, '\\u003c');

const html = `<title>FundRadar EA — Funding &amp; Tender Intelligence</title>
<style>
  :root {
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;

    --paper: #F5F3EC; --surface: #FFFFFF; --surface2: #FBFAF5; --ink: #15181C;
    --muted: #5B6470; --line: #DEDACD; --chip: #ECE8DC;
    --signal: #146675; --signal-ink: #FFFFFF;
    --good: #3F7A3F; --warn: #9C6B12; --crit: #A23B2E;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #0C1013; --surface: #12171C; --surface2: #161C22; --ink: #E8ECEF;
      --muted: #8B97A3; --line: #212A31; --chip: #1B2329;
      --signal: #49C7D6; --signal-ink: #08252A;
      --good: #8FCB6B; --warn: #E3A73B; --crit: #E8705A;
    }
  }
  :root[data-theme="light"] {
    --paper: #F5F3EC; --surface: #FFFFFF; --surface2: #FBFAF5; --ink: #15181C;
    --muted: #5B6470; --line: #DEDACD; --chip: #ECE8DC;
    --signal: #146675; --signal-ink: #FFFFFF;
    --good: #3F7A3F; --warn: #9C6B12; --crit: #A23B2E;
  }
  :root[data-theme="dark"] {
    --paper: #0C1013; --surface: #12171C; --surface2: #161C22; --ink: #E8ECEF;
    --muted: #8B97A3; --line: #212A31; --chip: #1B2329;
    --signal: #49C7D6; --signal-ink: #08252A;
    --good: #8FCB6B; --warn: #E3A73B; --crit: #E8705A;
  }

  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font: 15px/1.5 var(--sans); margin: 0; }
  a { color: inherit; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 26px 20px 70px; }

  /* ---------- masthead ---------- */
  header.mast { border-bottom: 3px solid var(--ink); padding-bottom: 18px; margin-bottom: 18px; }
  .mast-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .wordmark { font-family: var(--serif); font-size: 32px; font-weight: 700; letter-spacing: -0.4px; margin: 0; }
  .wordmark .signal-text { color: var(--signal); }
  .tagline { color: var(--muted); font-size: 13px; max-width: 46ch; margin: 6px 0 0; }
  .theme-toggle { background: var(--surface); border: 1px solid var(--line); color: var(--ink);
    width: 40px; height: 40px; border-radius: 50%; font-size: 15px; cursor: pointer; flex-shrink: 0; }
  .theme-toggle:hover { border-color: var(--signal); }
  .theme-toggle:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }

  .mast-bottom { display: flex; align-items: center; gap: 30px; margin-top: 18px; flex-wrap: wrap; }
  .hero { display: flex; flex-direction: column; gap: 0; }
  .hero-num { font: 700 46px/1 var(--mono); letter-spacing: -1px; }
  .hero-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.9px; margin-top: 4px; }
  .stat-strip { display: flex; gap: 24px; }
  .stat { display: flex; flex-direction: column; }
  .stat b { font: 600 19px var(--mono); font-variant-numeric: tabular-nums; }
  .stat span { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
  .spark-wrap { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .spark-label { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; }
  .spark { display: block; }
  .spark-area { fill: var(--signal); opacity: 0.14; }
  .spark-line { fill: none; stroke: var(--signal); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .spark-dot { fill: var(--signal); opacity: 0; }
  .spark-dot:hover, .spark-dot:focus { opacity: 0.25; }
  .spark-end { fill: var(--signal); stroke: var(--paper); stroke-width: 2; }

  /* ---------- closing-soon rail ---------- */
  .rail-head { display: flex; align-items: baseline; justify-content: space-between; margin: 22px 0 8px; }
  .eyebrow { font: 700 11px var(--sans); text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); margin: 0; }
  .eyebrow .crit-dot { color: var(--crit); display: inline-block; }
  .rail { display: flex; gap: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 2px 2px 14px; scroll-behavior: smooth; }
  .rail.snap { scroll-snap-type: x proximity; }
  .rail-card { scroll-snap-align: start; flex: 0 0 208px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 7px; padding: 11px 13px; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 6px;
    transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
  .rail-card:hover { border-color: var(--crit); transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
  .rail-days { font: 700 20px var(--mono); color: var(--crit); font-variant-numeric: tabular-nums; }
  .rail-title { font-size: 12.5px; font-weight: 600; line-height: 1.35; }
  .rail-meta { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail-empty { color: var(--muted); font-size: 13px; padding: 10px 2px; }

  /* ---------- brief ---------- */
  .brief { background: var(--surface); border-left: 3px solid var(--signal); border-radius: 0 6px 6px 0;
    padding: 13px 16px; margin: 20px 0 22px; }
  .brief .eyebrow { margin-bottom: 6px; }
  .brief p { font-size: 13.5px; margin: 0; max-width: 90ch; }

  /* ---------- subscribe ---------- */
  .subscribe-card { background: var(--surface); border-left: 3px solid var(--signal); border-radius: 0 6px 6px 0;
    padding: 13px 16px 2px; margin: 20px 0 8px; }
  .subscribe-card .eyebrow { margin-bottom: 2px; }
  .subscribe-card iframe { width: 100%; display: block; }

  /* ---------- controls ---------- */
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; position: sticky; top: 0;
    background: var(--paper); padding: 10px 0; z-index: 5; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
  input[type=search] { flex: 1; min-width: 200px; background: var(--surface); color: var(--ink);
    border: 1px solid var(--line); border-radius: 5px; padding: 10px 12px; font-family: inherit; font-size: 16px; }
  input[type=search]:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  select { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 5px;
    padding: 7px 10px; font: 600 12.5px var(--sans); cursor: pointer; }
  select:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .tabs { display: flex; gap: 2px; }
  .tabs button { background: var(--surface); border: 1px solid var(--line); color: var(--muted); padding: 7px 13px;
    font: 600 12.5px var(--sans); cursor: pointer; letter-spacing: 0.3px; }
  .tabs button:first-child { border-radius: 5px 0 0 5px; }
  .tabs button:last-child { border-radius: 0 5px 5px 0; }
  .tabs button + button { border-left: none; }
  .tabs button[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .tabs button:focus-visible, .toggle:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .toggle { background: var(--surface); border: 1px solid var(--line); color: var(--muted); border-radius: 5px;
    padding: 7px 13px; font: 600 12.5px var(--sans); cursor: pointer; }
  .toggle[aria-pressed="true"] { background: var(--signal); color: var(--signal-ink); border-color: var(--signal); }

  /* ---------- board: sidebar + results ---------- */
  .board { display: grid; grid-template-columns: 226px 1fr; gap: 22px; align-items: start; }
  @media (max-width: 860px) { .board { grid-template-columns: 1fr; } }
  aside.sidebar { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 66px; }
  @media (max-width: 860px) { aside.sidebar { position: static; } }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 13px; }
  .panel h2 { font: 700 11px var(--sans); text-transform: uppercase; letter-spacing: 1.3px; color: var(--muted); margin: 0 0 10px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chips button { background: var(--chip); border: none; color: var(--ink); border-radius: 20px;
    padding: 7px 13px; font: 500 12px var(--sans); cursor: pointer; min-height: 32px; }
  .chips button[aria-pressed="true"] { background: var(--signal); color: var(--signal-ink); }
  .chips button:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }

  .sbar-row { display: flex; flex-direction: column; gap: 3px; margin-bottom: 9px; }
  .sbar-row:last-child { margin-bottom: 0; }
  .sbar-btn { background: none; border: none; padding: 0; margin: 0; width: 100%; text-align: left; cursor: pointer; color: inherit; }
  .sbar-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sbar-row[aria-pressed="true"] .sbar-label { color: var(--signal); }
  .sbar-track { display: flex; align-items: center; gap: 7px; height: 13px; }
  .sbar-fill { height: 9px; background: var(--signal); border-radius: 0 4px 4px 0; min-width: 3px; }
  .sbar-row[data-other="1"] .sbar-fill { background: var(--muted); opacity: 0.5; }
  .sbar-val { font: 600 11.5px var(--mono); color: var(--ink); font-variant-numeric: tabular-nums; flex-shrink: 0; }

  main.results { display: flex; flex-direction: column; min-width: 0; }
  .count { color: var(--muted); font-size: 12.5px; margin: 0 2px 8px; }
  .count b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .viewport { border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
    overflow-y: auto; -webkit-overflow-scrolling: touch; max-height: min(72vh, 760px); position: relative; }
  .pool { display: flex; flex-direction: column; }
  .row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px;
    border-bottom: 1px solid var(--line); box-sizing: border-box; transition: background-color .12s ease; }
  .row:hover { background: var(--surface2); }
  .live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--good); margin-right: 6px; flex-shrink: 0; }
  .star { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--line); flex-shrink: 0;
    width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; }
  .star.active { color: var(--signal); }
  .star:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .row-title-line { display: flex; align-items: baseline; gap: 7px; min-width: 0; flex-wrap: wrap; }
  .row-title { font-weight: 600; font-size: 14px; line-height: 1.4; text-decoration: none; word-break: break-word; }
  .row-title:hover, .row-title:focus { color: var(--signal); text-decoration: underline; }
  .badge-new { font: 700 9.5px var(--sans); text-transform: uppercase; letter-spacing: 0.5px; color: var(--good);
    border: 1px solid var(--good); border-radius: 3px; padding: 1px 5px; flex-shrink: 0; }
  .row-meta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-meta .amt { color: var(--signal); font-weight: 600; }
  .tag-type { font: 600 10px var(--sans); text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink);
    background: var(--chip); border-radius: 3px; padding: 1px 6px; margin-right: 6px; flex-shrink: 0; }
  .row-when { text-align: right; flex-shrink: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; width: 96px; }
  .row-when .rdate { display: block; font-size: 11.5px; color: var(--muted); }
  .row-when .rleft { display: block; font-size: 14px; font-weight: 700; margin-top: 1px; }
  .row-when.warn .rleft { color: var(--warn); }
  .row-when.crit .rleft, .row-when.crit .rdate { color: var(--crit); }
  .empty { color: var(--muted); padding: 60px 0; text-align: center; }

  /* ---------- footer / ledger ---------- */
  footer { margin-top: 30px; padding-top: 16px; border-top: 3px solid var(--ink); }
  .ledger-head { margin: 0 0 10px; }
  .ledger-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 20px; margin-bottom: 18px; }
  .ledger-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; border-bottom: 1px dotted var(--line); padding-bottom: 4px; }
  .lg-name { color: var(--ink); font-weight: 600; }
  .lg-meta { color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; flex-shrink: 0; }
  .fine { color: var(--muted); font-size: 12.5px; max-width: 74ch; }
  .fine b { color: var(--ink); }

  /* ---------- mobile ---------- */
  @media (max-width: 640px) {
    .wrap { padding: 18px 14px 60px; }
    .wordmark { font-size: 26px; }
    .tagline { max-width: 100%; }
    .mast-bottom { flex-direction: column; align-items: flex-start; gap: 16px; }
    .hero-num { font-size: 36px; }
    .stat-strip { gap: 18px; flex-wrap: wrap; }
    .spark-wrap { margin-left: 0; align-items: flex-start; width: 100%; }
    .spark { max-width: 100%; height: auto; }

    .rail-card { flex: 0 0 168px; }

    input[type=search] { flex: 1 1 100%; }
    .tabs { flex: 1 1 100%; }
    .tabs button { flex: 1; padding: 9px 4px; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    select, .toggle { flex: 1; }

    .row { gap: 8px; padding: 10px; }
    .tag-type { padding: 1px 5px; font-size: 9px; margin-right: 4px; }
    .row-title { font-size: 13.5px; }
    .row-meta { font-size: 11px; }
    .row-when { width: 70px; }
    .row-when .rdate { display: none; }
    .row-when .rleft { font-size: 12.5px; }
  }

  @media (prefers-reduced-motion: no-preference) {
    .row { animation: rise .18s ease both; }
    @keyframes rise { from { opacity: 0; } to { opacity: 1; } }
    .crit-dot, .live-dot { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
  }
</style>
<div class="wrap">
  <header class="mast">
    <div class="mast-top">
      <div>
        <div class="brand">
          <h1 class="wordmark">FundRadar<span class="signal-text">·EA</span></h1>
        </div>
        <p class="tagline">Signals intelligence for East African funding — every open grant, tender and call, watched daily so you don't have to.</p>
      </div>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle color theme" title="Toggle color theme">&#9680;</button>
    </div>
    <div class="mast-bottom">
      <div class="hero"><b class="hero-num" id="statLive">${items.length}</b><span class="hero-label">Live opportunities</span></div>
      <div class="stat-strip">
        <div class="stat"><b>${nSources}</b><span>Sources watched</span></div>
        <div class="stat"><b>${nTotal.toLocaleString()}</b><span>Ever tracked</span></div>
        <div class="stat"><b><span class="live-dot"></span>${today}</b><span>Last swept</span></div>
      </div>
      <div class="spark-wrap">
        <span class="spark-label">New discoveries · 14 days</span>
        ${sparklineSvg(daily)}
      </div>
    </div>
  </header>

  <div class="subscribe-card">
    <p class="eyebrow">Get the weekly digest</p>
    <iframe src="https://fundradar.substack.com/embed?transparent=1" width="480" height="150" style="border:0; background:transparent;" frameborder="0" scrolling="no"></iframe>
  </div>

  <div class="rail-head">
    <p class="eyebrow"><span class="crit-dot">&#9679;</span> Closing within 7 days</p>
  </div>
  <div class="rail" id="rail"></div>

  <div class="brief">
    <p class="eyebrow">Situation brief</p>
    <p>The money didn't disappear this year; the <em>map</em> did. With USAID gone and several European donors
    cutting budgets, what remains is scattered across portals nobody has time to check. We check them —
    government e-procurement systems, multilateral tender platforms, and web-wide discovery feeds — every day.
    Every deadline below links to its primary source.</p>
  </div>

  <div class="controls">
    <input type="search" id="q" placeholder="Search title, funder, sector… (press / to focus)" aria-label="Search opportunities">
    <div class="tabs" role="group" aria-label="Filter by type">
      <button data-type="all" aria-pressed="true">All</button>
      <button data-type="grant" aria-pressed="false">Grants</button>
      <button data-type="tender" aria-pressed="false">Tenders</button>
      <button data-type="fellowship" aria-pressed="false">Fellowships</button>
    </div>
    <select id="sort" aria-label="Sort order">
      <option value="deadline_asc">Deadline · soonest</option>
      <option value="deadline_desc">Deadline · latest</option>
      <option value="new_desc">Newest discovered</option>
    </select>
    <button class="toggle" id="newToggle" aria-pressed="false">&#10022; New (<span id="newCount">0</span>)</button>
    <button class="toggle" id="shortlistToggle" aria-pressed="false">&#9734; Shortlist (<span id="shortlistCount">0</span>)</button>
  </div>

  <div class="board">
    <aside class="sidebar">
      <div class="panel">
        <h2>Country</h2>
        <div class="chips" id="countryChips"></div>
      </div>
      <div class="panel">
        <h2>Sector (live)</h2>
        <div id="sectorChart"></div>
      </div>
    </aside>
    <main class="results">
      <p class="count" id="count"></p>
      <div class="viewport" id="viewport" tabindex="0">
        <div class="pool" id="pool" role="list" aria-label="Opportunities"></div>
      </div>
    </main>
  </div>

  <footer>
    <p class="eyebrow ledger-head">Source ledger — last confirmed check</p>
    <div class="ledger-grid">
      ${sourceMeta.map((s) => `<div class="ledger-row"><span class="lg-name">${s.source}</span><span class="lg-meta">${s.total} tracked · ${s.latest.slice(0, 16).replace('T', ' ')}</span></div>`).join('')}
    </div>
    <p class="fine">FundRadar monitors government e-procurement portals, multilateral tender systems and web-wide
    discovery feeds daily. Sector and eligibility tags are automated; deadlines come from structured source data
    where available. <b>Always verify against the linked source before applying.</b> Spotted an error?
    Corrections ship within 24 hours.</p>
  </footer>
</div>
<script>var BUILD_DATE = "${today}";</script>
<script type="application/json" id="data">${json}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var q = document.getElementById('q');
  var sortSel = document.getElementById('sort');
  var newBtn = document.getElementById('newToggle');
  var newCountEl = document.getElementById('newCount');
  var shortlistBtn = document.getElementById('shortlistToggle');
  var shortlistCountEl = document.getElementById('shortlistCount');
  var countryChipsEl = document.getElementById('countryChips');
  var sectorChartEl = document.getElementById('sectorChart');
  var countEl = document.getElementById('count');
  var railEl = document.getElementById('rail');
  var viewport = document.getElementById('viewport');
  var pool = document.getElementById('pool');
  var themeToggle = document.getElementById('themeToggle');

  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  var state = { type: 'all', country: 'all', sector: 'all', query: '', sort: 'deadline_asc', shortlistOnly: false, newOnly: false };
  newCountEl.textContent = DATA.filter(function (o) { return o.n === BUILD_DATE; }).length;
  var current = [];

  // ---------- shortlist (localStorage) ----------
  var shortlist;
  try { shortlist = new Set(JSON.parse(localStorage.getItem('fundradar_shortlist') || '[]')); }
  catch (e) { shortlist = new Set(); }
  function saveShortlist() {
    try { localStorage.setItem('fundradar_shortlist', JSON.stringify(Array.from(shortlist))); } catch (e) {}
    shortlistCountEl.textContent = shortlist.size;
  }
  saveShortlist();

  // ---------- theme toggle ----------
  var storedTheme = null;
  try { storedTheme = localStorage.getItem('fundradar_theme'); } catch (e) {}
  if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);
  themeToggle.addEventListener('click', function () {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var current = document.documentElement.getAttribute('data-theme') || (mql.matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('fundradar_theme', next); } catch (e) {}
  });

  // ---------- date math ----------
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  function daysLeft(d) { return Math.round((new Date(d + 'T00:00:00') - TODAY) / 86400000); }

  // ---------- facets (country / sector), computed once from the live dataset ----------
  var countryCounts = {};
  DATA.forEach(function (o) { o.c.forEach(function (c) { var n = c.split(',')[0]; countryCounts[n] = (countryCounts[n] || 0) + 1; }); });
  var countryEntries = Object.entries(countryCounts).sort(function (a, b) { return b[1] - a[1]; });
  countryChipsEl.innerHTML = '<button data-c="all" aria-pressed="true">All</button>' +
    countryEntries.map(function (e) { return '<button data-c="' + esc(e[0]) + '" aria-pressed="false">' + esc(e[0]) + ' (' + e[1] + ')</button>'; }).join('') +
    '<button data-c="regional" aria-pressed="false">Regional / Global</button>';

  var sectorCounts = {};
  DATA.forEach(function (o) { o.k.forEach(function (k) { sectorCounts[k] = (sectorCounts[k] || 0) + 1; }); });
  var sectorEntries = Object.entries(sectorCounts).sort(function (a, b) { return b[1] - a[1]; });
  var TOP_N = 7;
  var sectorTop = sectorEntries.slice(0, TOP_N);
  var sectorRest = sectorEntries.slice(TOP_N).reduce(function (s, e) { return s + e[1]; }, 0);
  var maxSector = Math.max(1, sectorTop.length ? sectorTop[0][1] : 1, sectorRest);
  var sectorHtml = sectorTop.map(function (e) {
    var pct = Math.max(6, Math.round((e[1] / maxSector) * 100));
    return '<div class="sbar-row" data-sector="' + esc(e[0]) + '" aria-pressed="false">' +
      '<button class="sbar-btn" type="button">' +
      '<span class="sbar-label">' + esc(e[0]) + '</span>' +
      '<span class="sbar-track"><span class="sbar-fill" style="width:' + pct + '%"></span><span class="sbar-val">' + e[1] + '</span></span>' +
      '</button></div>';
  }).join('');
  if (sectorRest > 0) {
    var pctO = Math.max(6, Math.round((sectorRest / maxSector) * 100));
    sectorHtml += '<div class="sbar-row" data-other="1"><span class="sbar-label">Other</span>' +
      '<span class="sbar-track"><span class="sbar-fill" style="width:' + pctO + '%"></span><span class="sbar-val">' + sectorRest + '</span></span></div>';
  }
  sectorChartEl.innerHTML = sectorHtml;

  // ---------- closing-soon rail (static, computed once) ----------
  var closing = DATA.filter(function (o) { return o.d && daysLeft(o.d) >= 0 && daysLeft(o.d) <= 7; })
    .sort(function (a, b) { return daysLeft(a.d) - daysLeft(b.d); }).slice(0, 14);
  if (closing.length) {
    railEl.innerHTML = closing.map(function (o) {
      var dl = daysLeft(o.d);
      return '<a class="rail-card" href="' + esc(o.u) + '" target="_blank" rel="noopener">' +
        '<span class="rail-days">' + (dl === 0 ? 'today' : dl + 'd') + '</span>' +
        '<span class="rail-title">' + esc(o.t) + '</span>' +
        '<span class="rail-meta">' + esc(o.f || o.s) + '</span></a>';
    }).join('');
  } else {
    var soonest = DATA.filter(function (o) { return o.d; }).sort(function (a, b) { return daysLeft(a.d) - daysLeft(b.d); })[0];
    railEl.outerHTML = '<p class="rail-empty">Nothing closing within 7 days right now' +
      (soonest ? ' — the nearest deadline is in ' + daysLeft(soonest.d) + ' days.' : '.') + '</p>';
  }

  // ---------- rail auto-scroll (paused on hover/touch/focus, off for reduced-motion) ----------
  if (closing.length > 2 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var railPaused = false, railResuming = null;
    (function railTick() {
      if (!railPaused) {
        var max = railEl.scrollWidth - railEl.clientWidth;
        if (max > 1) {
          if (railEl.scrollLeft >= max - 1) {
            railPaused = true;
            railResuming = setTimeout(function () {
              railEl.scrollTo({ left: 0, behavior: 'smooth' });
              railResuming = setTimeout(function () { railPaused = false; }, 600);
            }, 1400);
          } else {
            railEl.scrollLeft += 0.55;
          }
        }
      }
      requestAnimationFrame(railTick);
    })();
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) {
      railEl.addEventListener(ev, function () {
        railPaused = true;
        railEl.classList.add('snap');
        if (railResuming) { clearTimeout(railResuming); railResuming = null; }
      }, { passive: true });
    });
    ['mouseleave', 'focusout'].forEach(function (ev) {
      railEl.addEventListener(ev, function () {
        railEl.classList.remove('snap');
        railPaused = false;
      }, { passive: true });
    });
  }

  // ---------- filter + sort ----------
  function matches(o) {
    if (state.type !== 'all' && o.y !== state.type) return false;
    if (state.country === 'regional' && o.c.length > 0) return false;
    if (state.country !== 'all' && state.country !== 'regional' && !o.c.some(function (c) { return c.indexOf(state.country) === 0; })) return false;
    if (state.sector !== 'all' && o.k.indexOf(state.sector) === -1) return false;
    if (state.newOnly && o.n !== BUILD_DATE) return false;
    if (state.shortlistOnly && !shortlist.has(o.id)) return false;
    if (state.query) {
      var hay = (o.t + ' ' + o.f + ' ' + o.s + ' ' + o.k.join(' ') + ' ' + o.c.join(' ')).toLowerCase();
      var words = state.query.toLowerCase().split(/\s+/);
      for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) === -1) return false; }
    }
    return true;
  }
  function sortFn(a, b) {
    if (state.sort === 'new_desc') return a.n < b.n ? 1 : a.n > b.n ? -1 : 0;
    var ad = a.d || '9999', bd = b.d || '9999';
    return state.sort === 'deadline_desc' ? (ad < bd ? 1 : ad > bd ? -1 : 0) : (ad < bd ? -1 : ad > bd ? 1 : 0);
  }

  function rowHtml(o, idx) {
    var when = '<span class="rdate">no date</span><span class="rleft">see source</span>', cls = '';
    if (o.d) {
      var dl = daysLeft(o.d);
      cls = dl <= 7 ? ' crit' : dl <= 21 ? ' warn' : '';
      when = '<span class="rdate">' + o.d + '</span><span class="rleft">' + (dl <= 0 ? 'today' : dl + 'd left') + '</span>';
    }
    var meta = [o.f, o.c.map(function (c) { return c.split(',')[0]; }).join(', '), o.k[0]].filter(Boolean).join(' · ');
    var isNew = o.n === BUILD_DATE;
    var starred = shortlist.has(o.id);
    return '<div class="row" role="listitem" aria-posinset="' + (idx + 1) + '" aria-setsize="' + current.length + '">' +
      '<button class="star' + (starred ? ' active' : '') + '" data-id="' + esc(o.id) + '" aria-pressed="' + starred + '" aria-label="Add to shortlist">' + (starred ? '★' : '☆') + '</button>' +
      '<div class="row-main">' +
        '<div class="row-title-line"><span class="tag-type">' + o.y + '</span>' +
        '<a class="row-title" href="' + esc(o.u) + '" target="_blank" rel="noopener">' + esc(o.t) + '</a>' +
        (isNew ? '<span class="badge-new">New</span>' : '') + '</div>' +
        '<div class="row-meta" title="' + esc(meta + ' · via ' + o.s) + '">' + esc(meta) + (o.a ? ' · <span class="amt">' + esc(o.a) + '</span>' : '') + ' · via ' + esc(o.s) + '</div>' +
      '</div>' +
      '<div class="row-when' + cls + '">' + when + '</div>' +
    '</div>';
  }

  function renderList() {
    if (!current.length) {
      pool.innerHTML = '<p class="empty">Nothing matches — widen the filters.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < current.length; i++) html += rowHtml(current[i], i);
    pool.innerHTML = html;
  }

  function refilter() {
    current = DATA.filter(matches).sort(sortFn);
    countEl.innerHTML = '<b>' + current.length + '</b> of ' + DATA.length + ' live opportunities';
    viewport.scrollTop = 0;
    renderList();
  }

  // ---------- wiring ----------
  var searchTimer;
  q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.query = q.value.trim(); refilter(); }, 140);
  });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.dataset.type;
      document.querySelectorAll('.tabs button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      refilter();
    });
  });
  sortSel.addEventListener('change', function () { state.sort = sortSel.value; refilter(); });
  newBtn.addEventListener('click', function () {
    state.newOnly = !state.newOnly;
    newBtn.setAttribute('aria-pressed', state.newOnly);
    refilter();
  });
  shortlistBtn.addEventListener('click', function () {
    state.shortlistOnly = !state.shortlistOnly;
    shortlistBtn.setAttribute('aria-pressed', state.shortlistOnly);
    refilter();
  });
  countryChipsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.country = b.dataset.c;
    countryChipsEl.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    refilter();
  });
  sectorChartEl.addEventListener('click', function (e) {
    var row = e.target.closest('.sbar-row'); if (!row || row.dataset.other) return;
    var sector = row.dataset.sector;
    var already = row.getAttribute('aria-pressed') === 'true';
    sectorChartEl.querySelectorAll('.sbar-row').forEach(function (r) { r.setAttribute('aria-pressed', 'false'); });
    state.sector = already ? 'all' : sector;
    if (!already) row.setAttribute('aria-pressed', 'true');
    refilter();
  });
  pool.addEventListener('click', function (e) {
    var star = e.target.closest('.star'); if (!star) return;
    var id = star.dataset.id;
    if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
    saveShortlist();
    renderList();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/') return;
    var t = document.activeElement, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault(); q.focus();
  });

  refilter();

  // ---------- hero number count-up ----------
  var statLiveEl = document.getElementById('statLive');
  if (statLiveEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var target = parseInt(statLiveEl.textContent, 10) || 0;
    var start = null, dur = 700;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      statLiveEl.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
</script>
`;

fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const outPath = path.join(ROOT, 'out', 'site.html');
fs.writeFileSync(outPath, html);
console.log(`Site written: ${outPath} (${items.length} live items embedded)`);

// Full standalone document for GitHub Pages (the artifact host supplies its own shell)
const styleEnd = html.indexOf('</style>') + '</style>'.length;
const fullDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="FundRadar EA — every open grant, tender and opportunity relevant to East African organizations, tracked from primary sources and updated daily.">
<meta name="theme-color" content="#146675">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
${html.slice(0, styleEnd)}
</head>
<body>
${html.slice(styleEnd)}
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), fullDoc);
console.log('Pages doc written: docs/index.html');
