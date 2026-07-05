# FundRadar East Africa

Funding intelligence pipeline for East African organizations: every open grant, tender and opportunity, pulled from primary sources, classified, and published as a weekly digest.

## How it works

```
sources (APIs/RSS/scrapers) → normalize + classify → SQLite → weekly digest (md)
```

- `npm run pipeline` — fetch all sources, upsert into `data/fundradar.db`
- `npm run digest` — generate `out/digest-YYYY-MM-DD.md` from live EA-relevant records (prepends `out/editors-note.md` if present)
- `npm run stats` — database breakdown by source/type/country

## Sources (v1)

| Source | Method | Notes |
|---|---|---|
| World Bank procurement | JSON API v2 | filtered to EA countries, live deadlines |
| EU Funding & Tenders (SEDIA) | multipart search API | open + forthcoming calls, EN |
| UNGM (all UN agencies) | POST search, HTML rows | filtered to EA countries |
| fundsforNGOs | RSS | feed capped at 1 item by site — needs page scraper (backlog) |
| Opportunity Desk | RSS | fellowships/prizes |

Dead/backlog: UNDP export feed (404 — UNGM covers UNDP notices), fundsforNGOs category pages (JS-rendered), AfDB, FCDO DevTracker, foundation pages (Mastercard, Segal, Hilton), Global Fund, GCF.

## Design decisions

- **East Africa scope**: Uganda, Kenya, Tanzania, Rwanda, Burundi, South Sudan, Ethiopia, Somalia, DRC (`src/normalize.js`).
- **Classification** is keyword-heuristic for now (sectors, eligibility, deadlines, amounts extracted from text). A Claude API enrichment pass is the planned upgrade — the heuristics deliberately live in one file so they can be swapped.
- **Accuracy rule**: every digest item links to its primary source; deadlines come from structured fields where available, text extraction otherwise. Never publish a deadline we can't source.
- **HTTP via curl** with retries (`src/http.js`) — Node's resolver flaked for some hosts in sandboxed local runs; curl is also what a cron VPS will use happily.

## Roadmap

1. More sources (target 40): AfDB, FCDO DevTracker, foundations, embassy small grants
2. Claude API classification pass (better sectors/eligibility, funder name extraction from aggregator posts)
3. Deadline re-verification job (re-fetch source pages within 7 days of publish)
4. Beehiiv integration → weekly send
5. Web app: searchable database + matched alerts (paid tier)
