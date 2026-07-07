// Probe sub-sitemaps to find EA-country tender/grant URLs
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// EA country codes that appear in URL slugs
const EA_CODES = ['uga', 'ken', 'tan', 'rwa', 'bdi', 'ssd', 'eth', 'som', 'cod', 'uganda', 'kenya', 'tanzania', 'rwanda', 'south-sudan', 'ethiopia', 'somalia'];

async function getUrls(sitemapUrl) {
  const r = await fetch(sitemapUrl, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const xml = await r.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
}

// Sample first 5 sub-sitemaps for tenders to understand structure
console.log('=== Tender sub-sitemaps (first 5) ===');
for (let i = 1; i <= 5; i++) {
  const urls = await getUrls(`https://www.developmentaid.org/tenders_sitemap_${i}.xml`);
  const ea = urls.filter(u => EA_CODES.some(c => u.toLowerCase().includes(c)));
  console.log(`tenders_sitemap_${i}.xml → ${urls.length} total, ${ea.length} EA`);
  if (ea.length > 0) console.log('  EA samples:', ea.slice(0,3));
  else console.log('  Samples:', urls.slice(0,2));
}

// Also check last sub-sitemap (recent = higher numbers)
const lastUrls = await getUrls('https://www.developmentaid.org/tenders_sitemap_245.xml');
const lastEa = lastUrls.filter(u => EA_CODES.some(c => u.toLowerCase().includes(c)));
console.log(`\ntenders_sitemap_245.xml → ${lastUrls.length} total, ${lastEa.length} EA`);
console.log('Samples:', lastUrls.slice(0,3));

// Check grants sub-sitemaps (only 24 of them)
console.log('\n=== Grant sub-sitemaps (all 24) ===');
let totalEaGrants = 0;
const eaGrantUrls = [];
for (let i = 1; i <= 24; i++) {
  const urls = await getUrls(`https://www.developmentaid.org/grants_sitemap_${i}.xml`);
  const ea = urls.filter(u => EA_CODES.some(c => u.toLowerCase().includes(c)));
  totalEaGrants += ea.length;
  eaGrantUrls.push(...ea);
  if (ea.length > 0) console.log(`grants_sitemap_${i}.xml → ${urls.length} total, ${ea.length} EA`);
}
console.log(`\nTotal EA grants found: ${totalEaGrants}`);
console.log('Sample EA grant URLs:', eaGrantUrls.slice(0,5));
