// Generates out/site.html — a self-contained, searchable view of live EA-relevant
// opportunities. Emitted as a body fragment (Artifact/host provides the document shell).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);
const db = openDb();

const rows = db.prepare(`
  SELECT title, url, funder, source, type, deadline, countries, sectors, amount
  FROM opportunities
  WHERE ea_relevant = 1
    AND (deadline >= ? OR (deadline IS NULL AND first_seen >= datetime('now', '-14 days')))
  ORDER BY (deadline IS NULL), deadline ASC
`).all(today);

const items = rows.map((r) => ({
  t: r.title, u: r.url, f: r.funder ?? '', s: r.source,
  y: r.type === 'grant' ? 'grant' : r.type === 'tender' ? 'tender' : 'fellowship',
  d: r.deadline, c: JSON.parse(r.countries ?? '[]'), k: JSON.parse(r.sectors ?? '[]'),
  a: r.amount,
}));
const nSources = db.prepare('SELECT COUNT(DISTINCT source) c FROM opportunities').get().c;
const nTotal = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c;
const json = JSON.stringify(items).replace(/</g, '\\u003c');

const html = `<title>FundRadar EA — Live Opportunities</title>
<style>
  :root {
    --paper: #FAFAF7; --ink: #182420; --muted: #5C6B64; --line: #E2E6E0;
    --panel: #F1F3EE; --accent: #0F7A5C; --accent-ink: #fff;
    --warn: #B26A00; --crit: #B3341D; --chip: #E8EDE8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #101714; --ink: #E6ECE7; --muted: #8FA098; --line: #24312B;
      --panel: #16201B; --accent: #3FBE93; --accent-ink: #0B120F;
      --warn: #E0A33B; --crit: #E76A50; --chip: #1E2A24;
    }
  }
  :root[data-theme="light"] {
    --paper: #FAFAF7; --ink: #182420; --muted: #5C6B64; --line: #E2E6E0;
    --panel: #F1F3EE; --accent: #0F7A5C; --accent-ink: #fff;
    --warn: #B26A00; --crit: #B3341D; --chip: #E8EDE8;
  }
  :root[data-theme="dark"] {
    --paper: #101714; --ink: #E6ECE7; --muted: #8FA098; --line: #24312B;
    --panel: #16201B; --accent: #3FBE93; --accent-ink: #0B120F;
    --warn: #E0A33B; --crit: #E76A50; --chip: #1E2A24;
  }
  body { background: var(--paper); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 28px 20px 80px; }
  a { color: inherit; }

  header.mast { border-bottom: 3px solid var(--ink); padding-bottom: 14px; margin-bottom: 18px; }
  .brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .wordmark { font-family: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
    font-size: 34px; font-weight: 700; letter-spacing: -0.5px; margin: 0; }
  .wordmark .ea { color: var(--accent); }
  .tagline { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; }
  .statline { display: flex; gap: 26px; margin-top: 14px; flex-wrap: wrap; }
  .stat { display: flex; flex-direction: column; gap: 1px; }
  .stat b { font: 600 20px/1.2 ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; }

  .note { background: var(--panel); border-left: 3px solid var(--accent); padding: 12px 16px; margin: 0 0 22px; font-size: 14px; }
  .note b { font-family: "Iowan Old Style", Palatino, Georgia, serif; }

  .controls { display: flex; flex-direction: column; gap: 10px; margin-bottom: 6px; position: sticky; top: 0;
    background: var(--paper); padding: 12px 0 10px; z-index: 5; border-bottom: 1px solid var(--line); }
  .row1 { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  input[type=search] { flex: 1; min-width: 220px; background: var(--panel); color: var(--ink);
    border: 1px solid var(--line); border-radius: 3px; padding: 8px 12px; font: inherit; }
  input[type=search]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .tabs { display: flex; gap: 2px; }
  .tabs button { background: none; border: 1px solid var(--line); color: var(--muted); padding: 7px 13px;
    font: 600 12.5px system-ui, sans-serif; cursor: pointer; letter-spacing: 0.3px; }
  .tabs button:first-child { border-radius: 3px 0 0 3px; }
  .tabs button:last-child { border-radius: 0 3px 3px 0; }
  .tabs button[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button { background: var(--chip); border: none; color: var(--ink); border-radius: 20px;
    padding: 4px 12px; font: 500 12.5px system-ui, sans-serif; cursor: pointer; }
  .chips button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }
  .chips button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .count { color: var(--muted); font-size: 12.5px; margin: 10px 2px; }

  ul.list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: 18px; justify-content: space-between; align-items: flex-start;
    padding: 14px 2px; border-bottom: 1px solid var(--line); }
  .main { min-width: 0; }
  .title { font-weight: 600; text-decoration: none; }
  .title:hover, .title:focus { color: var(--accent); text-decoration: underline; }
  .meta { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
  .meta .amt { color: var(--accent); font-weight: 600; }
  .tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
  .tag { background: var(--chip); border-radius: 2px; padding: 1.5px 7px; font-size: 11px; color: var(--muted); }
  .tag.type { color: var(--ink); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .when { text-align: right; flex-shrink: 0; font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-variant-numeric: tabular-nums; }
  .when .date { font-size: 13px; font-weight: 600; }
  .when .left { display: block; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .when.warn .date, .when.warn .left { color: var(--warn); }
  .when.crit .date, .when.crit .left { color: var(--crit); }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }

  footer { margin-top: 34px; padding-top: 14px; border-top: 3px solid var(--ink); color: var(--muted); font-size: 12.5px; }
  footer b { color: var(--ink); }
  @media (prefers-reduced-motion: no-preference) {
    .list li { animation: rise .25s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  }
</style>
<div class="wrap">
  <header class="mast">
    <div class="brand">
      <h1 class="wordmark">FundRadar<span class="ea">·EA</span></h1>
      <span class="tagline">East Africa Funding Intelligence</span>
    </div>
    <div class="statline">
      <div class="stat"><b id="statLive">${items.length}</b><span>Live opportunities</span></div>
      <div class="stat"><b>${nSources}</b><span>Sources monitored</span></div>
      <div class="stat"><b>${nTotal}</b><span>Tracked total</span></div>
      <div class="stat"><b>${today}</b><span>Issue №1</span></div>
    </div>
  </header>

  <p class="note"><b>Editor's note —</b> The money didn't disappear this year; the <em>map</em> did.
  With USAID gone and several European donors cutting budgets, what remains is scattered across portals
  nobody has time to check. We check them. Every deadline below links to its primary source.</p>

  <div class="controls">
    <div class="row1">
      <input type="search" id="q" placeholder="Search title, funder, sector…" aria-label="Search opportunities">
      <div class="tabs" role="group" aria-label="Filter by type">
        <button data-type="all" aria-pressed="true">All</button>
        <button data-type="grant" aria-pressed="false">Grants</button>
        <button data-type="tender" aria-pressed="false">Tenders</button>
        <button data-type="fellowship" aria-pressed="false">Fellowships</button>
      </div>
    </div>
    <div class="chips" id="chips" role="group" aria-label="Filter by country"></div>
  </div>
  <p class="count" id="count"></p>
  <ul class="list" id="list"></ul>

  <footer>
    <b>How this works:</b> FundRadar monitors World Bank procurement, the EU Funding &amp; Tenders portal,
    UNGM and other primary sources daily. Sector and eligibility tags are automated; deadlines are taken from
    structured source data where available. <b>Always verify against the linked source before applying.</b>
    Spotted an error? Tell us — corrections ship within 24 hours.
  </footer>
</div>
<script type="application/json" id="data">${json}</script>
<script>
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const list = document.getElementById('list');
  const q = document.getElementById('q');
  const chipsEl = document.getElementById('chips');
  const countEl = document.getElementById('count');
  let type = 'all', country = 'all', query = '';

  const countryCounts = {};
  DATA.forEach(o => o.c.forEach(c => { const n = c.split(',')[0]; countryCounts[n] = (countryCounts[n] || 0) + 1; }));
  const countries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  chipsEl.innerHTML = '<button data-c="all" aria-pressed="true">All countries</button>' +
    countries.map(([c, n]) => '<button data-c="' + c + '" aria-pressed="false">' + c + ' (' + n + ')</button>').join('') +
    '<button data-c="regional" aria-pressed="false">Regional / Global</button>';

  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  function daysLeft(d) { return Math.round((new Date(d + 'T00:00:00') - TODAY) / 86400000); }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function render() {
    const out = DATA.filter(o => {
      if (type !== 'all' && o.y !== type) return false;
      if (country === 'regional' && o.c.length > 0) return false;
      if (country !== 'all' && country !== 'regional' && !o.c.some(c => c.startsWith(country))) return false;
      if (query) {
        const hay = (o.t + ' ' + o.f + ' ' + o.s + ' ' + o.k.join(' ') + ' ' + o.c.join(' ')).toLowerCase();
        if (!query.toLowerCase().split(/\\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
    countEl.textContent = out.length + ' of ' + DATA.length + ' live opportunities';
    if (!out.length) { list.innerHTML = '<li class="empty">Nothing matches — widen the filters.</li>'; return; }
    list.innerHTML = out.map(o => {
      let when = '<span class="date">no date</span><span class="left">see source</span>', cls = '';
      if (o.d) {
        const dl = daysLeft(o.d);
        cls = dl <= 7 ? ' crit' : dl <= 21 ? ' warn' : '';
        when = '<span class="date">' + o.d + '</span><span class="left">' + (dl === 0 ? 'closes today' : dl + ' days left') + '</span>';
      }
      const meta = [o.f, o.c.map(c => c.split(',')[0]).join(', ')].filter(Boolean).join(' · ');
      return '<li><div class="main">' +
        '<a class="title" href="' + esc(o.u) + '" target="_blank" rel="noopener">' + esc(o.t) + '</a>' +
        '<div class="meta">' + esc(meta) + (o.a ? ' · <span class="amt">' + esc(o.a) + '</span>' : '') + ' · via ' + esc(o.s) + '</div>' +
        '<div class="tags"><span class="tag type">' + o.y + '</span>' + o.k.slice(0, 4).map(k => '<span class="tag">' + esc(k) + '</span>').join('') + '</div>' +
        '</div><div class="when' + cls + '">' + when + '</div></li>';
    }).join('');
  }

  q.addEventListener('input', () => { query = q.value.trim(); render(); });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.type;
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    render();
  }));
  chipsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    country = b.dataset.c;
    chipsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    render();
  });
  render();
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
