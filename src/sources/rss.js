import { XMLParser } from 'fast-xml-parser';
import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchFeed(url) {
  const res = await fetchRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' },

  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

function rssToRecord(item, { source, funder, defaultType }) {
  const title = stripHtml(String(item.title ?? ''));
  const link = typeof item.link === 'string' ? item.link : item.link?.['#text'] ?? '';
  const desc = stripHtml(String(item.description ?? item['content:encoded'] ?? '')).slice(0, 1200);
  if (!title || !link) return null;

  let type = defaultType;
  const t = `${title} ${desc}`.toLowerCase();
  if (/fellowship|scholarship/.test(t)) type = 'fellowship';
  else if (/\baward\b|\bprize\b|competition|challenge/.test(t)) type = 'prize';
  else if (/tender|request for proposals|\brfp\b|procurement/.test(t)) type = 'tender';
  else if (/grant|call for proposals|funding/.test(t)) type = 'grant';

  let published = null;
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    if (!isNaN(d.getTime())) published = d.toISOString();
  }

  return enrich({
    id: makeId(source, link),
    source, funder,
    title: title.slice(0, 300),
    url: link,
    summary: desc,
    type,
    published_at: published,
    raw: { categories: item.category ?? null },
  });
}

// fundsforNGOs — aggregator; funder is named inside each post, so funder = null (parsed later)
export async function fetchFundsForNgos() {
  const feeds = [
    'https://www2.fundsforngos.org/feed/',
    'https://www2.fundsforngos.org/category/africa/feed/',
  ];
  const out = [];
  for (const f of feeds) {
    try {
      const items = await fetchFeed(f);
      for (const item of items) {
        const rec = rssToRecord(item, { source: 'fundsforNGOs', funder: null, defaultType: 'grant' });
        if (rec) out.push(rec);
      }
    } catch (e) {
      console.error(`  ! feed failed ${f}: ${e.message}`);
    }
  }
  return out;
}

export async function fetchOpportunityDesk() {
  const items = await fetchFeed('https://opportunitydesk.org/feed/');
  return items
    .map((i) => rssToRecord(i, { source: 'Opportunity Desk', funder: null, defaultType: 'fellowship' }))
    .filter(Boolean);
}
