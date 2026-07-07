// Quick test — check what DevelopmentAid exposes publicly
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// 1. Check the tender detail page the user shared
const detailUrl = 'https://www.developmentaid.org/tenders/view/1678645/uga22008-10316-framework-contract-for-the-provision-of-a-dedicated-internet-connection-at-selected-s';
const r1 = await fetch(detailUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
console.log(`Detail page: HTTP ${r1.status}`);
if (r1.ok) {
  const html = await r1.text();
  // Extract visible fields
  const title = html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]?.replace(/<[^>]+>/g,'').trim();
  const deadline = html.match(/[Dd]eadline[^:]*:\s*<[^>]+>([^<]+)/)?.[1]?.trim()
    ?? html.match(/[Cc]losing [Dd]ate[^:]*:\s*<[^>]+>([^<]+)/)?.[1]?.trim();
  const funder = html.match(/[Ff]under[^:]*:\s*<[^>]+>([^<]+)/)?.[1]?.trim()
    ?? html.match(/[Oo]rganization[^:]*:\s*<[^>]+>([^<]+)/)?.[1]?.trim();
  const locked = html.includes('member-only') || html.includes('Member-only') || html.includes('unlock') || html.includes('login to view');
  console.log({ title, deadline, funder, locked });
  console.log('HTML snippet (1500 chars):', html.slice(0, 1500).replace(/\s+/g, ' '));
}

// 2. Check the tenders search page for Africa/Uganda
const searchUrl = 'https://www.developmentaid.org/tenders/search?locations=35'; // 35 = Uganda
const r2 = await fetch(searchUrl, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
console.log(`\nSearch page (Uganda): HTTP ${r2.status}`);
if (r2.ok) {
  const html = await r2.text();
  const locked = html.includes('member-only') || html.includes('login');
  const links = [...html.matchAll(/href="(\/tenders\/view\/[^"]+)"/g)].slice(0,5).map(m => m[1]);
  console.log({ locked, sampleLinks: links });
}
