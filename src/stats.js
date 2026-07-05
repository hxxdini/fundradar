import { openDb } from './db.js';

const db = openDb();
console.log('By source:');
for (const r of db.prepare('SELECT source, COUNT(*) c, SUM(ea_relevant) ea FROM opportunities GROUP BY source ORDER BY c DESC').all())
  console.log(`  ${r.source}: ${r.c} (${r.ea} EA-relevant)`);
console.log('\nBy type (EA-relevant, live):');
for (const r of db.prepare("SELECT type, COUNT(*) c FROM opportunities WHERE ea_relevant=1 AND (deadline >= date('now') OR deadline IS NULL) GROUP BY type").all())
  console.log(`  ${r.type}: ${r.c}`);
console.log('\nBy country (EA-relevant):');
for (const r of db.prepare('SELECT countries, COUNT(*) c FROM opportunities WHERE ea_relevant=1 GROUP BY countries ORDER BY c DESC LIMIT 12').all())
  console.log(`  ${r.countries}: ${r.c}`);
