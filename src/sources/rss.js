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
  const SOURCE = 'Opportunity Desk';
  const out = [];
  // RSS feed returns 403 — use the WordPress REST API instead
  const url = 'https://opportunitydesk.org/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,excerpt,date';
  const res = await fetchRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)' },
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const posts = await res.json();

  for (const post of posts) {
    const title = stripHtml(post.title?.rendered ?? '');
    const link = post.link ?? '';
    if (!title || !link) continue;

    const excerptRaw = stripHtml(post.excerpt?.rendered ?? '').slice(0, 1200);

    // Extract deadline from excerpt text: "Deadline: Month DD, YYYY" or "Deadline: Unspecified"
    let deadline = null;
    const dlMatch = excerptRaw.match(/Deadline:\s*([A-Za-z]+ \d{1,2},\s*\d{4})/);
    if (dlMatch) {
      const d = new Date(dlMatch[1]);
      if (!isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
    }

    // Strip the "Deadline: ..." prefix from summary
    const summary = excerptRaw.replace(/^Deadline:\s*[^\n]+\n?/, '').trim();

    let type = 'fellowship';
    const t = `${title} ${summary}`.toLowerCase();
    if (/\baward\b|\bprize\b|competition|challenge/.test(t)) type = 'prize';
    else if (/tender|request for proposals|\brfp\b|procurement/.test(t)) type = 'tender';
    else if (/grant|call for proposals|funding/.test(t)) type = 'grant';
    else if (/fellowship|scholarship/.test(t)) type = 'fellowship';

    let published_at = null;
    if (post.date) {
      const d = new Date(post.date);
      if (!isNaN(d.getTime())) published_at = d.toISOString();
    }

    const rec = enrich({
      id: makeId(SOURCE, link),
      source: SOURCE,
      funder: null,
      title: title.slice(0, 300),
      url: link,
      summary,
      type,
      deadline,
      published_at,
      raw: { wp_id: post.id },
    });
    if (rec) out.push(rec);
  }
  return out;
}
