// Check DevelopmentAid sitemaps for EA-filtered tender/grant URLs
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const EA_SLUGS = ['uganda', 'kenya', 'tanzania', 'rwanda', 'burundi', 'south-sudan', 'ethiopia', 'somalia', 'congo'];

for (const sm of ['tenders_sitemap.xml', 'grants_sitemap.xml', 'search_sitemap_tender.xml', 'search_sitemap_grant.xml']) {
  const url = `https://www.developmentaid.org/${sm}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  console.log(`\n${sm} → HTTP ${r.status}`);
  if (!r.ok) continue;
  const xml = await r.text();
  // Find all URLs
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  console.log(`Total URLs: ${urls.length}`);
  // EA-relevant ones
  const ea = urls.filter(u => EA_SLUGS.some(s => u.toLowerCase().includes(s)));
  console.log(`EA-relevant: ${ea.length}`);
  console.log('Samples:', ea.slice(0, 5));
  // Also show first few raw entries
  if (ea.length === 0) console.log('First 3 raw:', urls.slice(0, 3));
}

// Also check how a detail page looks (extract title, funder, sector from <title> tag)
console.log('\n--- Detail page title extraction ---');
const detailUrl = 'https://www.developmentaid.org/tenders/view/1678645/uga22008-10316-framework-contract-for-the-provision-of-a-dedicated-internet-connection-at-selected-s';
const r = await fetch(detailUrl, { headers: { 'User-Agent': UA } });
if (r.ok) {
  const html = await r.text();
  const pageTitle = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? '';
  console.log('Page title:', pageTitle);
  // Pattern: "Open tender — TITLE — for COUNTRY by FUNDER in SECTOR sector"
  const m = pageTitle.match(/^(Open tender|Open grant) — (.*?) — for (.*?) by (.*?) in (.*?) sector/);
  if (m) console.log({ type: m[1], title: m[2], country: m[3], funder: m[4], sector: m[5] });
}
