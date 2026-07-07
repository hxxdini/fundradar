// Check DevelopmentAid sitemap for tender/grant URL discovery
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const sitemaps = [
  'https://www.developmentaid.org/sitemap.xml',
  'https://www.developmentaid.org/sitemap_index.xml',
  'https://www.developmentaid.org/robots.txt',
];

for (const url of sitemaps) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  console.log(`${url} → HTTP ${r.status}`);
  if (r.ok) {
    const text = await r.text();
    console.log(text.slice(0, 2000));
    console.log('---');
  }
}
