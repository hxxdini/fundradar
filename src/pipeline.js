import { openDb, upsertOpportunity } from './db.js';
import { fetchWorldBank } from './sources/worldbank.js';
import { fetchEuSedia } from './sources/eu_sedia.js';
import { fetchFundsForNgos, fetchOpportunityDesk } from './sources/rss.js';
import { fetchUngm } from './sources/ungm.js';
import { fetchUgandaEgp } from './sources/uganda_egp.js';
import { fetchKenyaTenders } from './sources/kenya_tenders.js';
import { fetchWebRadar } from './sources/webradar.js';

// UNDP export feed is dead (404) — see src/sources/undp.js; UNGM covers UNDP notices anyway.
const SOURCES = [
  ['World Bank Procurement', fetchWorldBank],
  ['EU Funding & Tenders', fetchEuSedia],
  ['fundsforNGOs', fetchFundsForNgos],
  ['Opportunity Desk', fetchOpportunityDesk],
  ['UNGM (UN agencies)', fetchUngm],
  ['Uganda eGP (PPDA)', fetchUgandaEgp],
  ['Kenya PPIP', fetchKenyaTenders],
  ['Web Radar', fetchWebRadar],
];

const db = openDb();
let totalNew = 0;
let totalSeen = 0;

for (const [name, fetcher] of SOURCES) {
  process.stdout.write(`→ ${name} ... `);
  try {
    const records = await fetcher();
    let added = 0;
    const before = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
    for (const rec of records) upsertOpportunity(db, rec);
    const after = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
    added = after - before;
    totalNew += added;
    totalSeen += records.length;
    console.log(`${records.length} fetched, ${added} new`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
}

const stats = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(ea_relevant) AS ea,
    SUM(CASE WHEN deadline >= date('now') THEN 1 ELSE 0 END) AS live_deadline
  FROM opportunities
`).get();

console.log(`\nRun complete: ${totalSeen} records processed, ${totalNew} new.`);
console.log(`Database: ${stats.total} opportunities | ${stats.ea} EA-relevant | ${stats.live_deadline} with live deadlines.`);
