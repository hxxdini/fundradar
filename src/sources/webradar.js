import { XMLParser } from 'fast-xml-parser';
import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// "Web radar" — broad discovery via search-engine RSS (Google News + Bing).
// These are LEADS, not verified listings: no structured deadline source, and
// links go to whatever page the engine found. They widen the net beyond portals.
const QUERIES = [
  '"call for proposals" Uganda',
  '"call for proposals" "East Africa" NGO',
  '"grant" "East Africa" NGO apply',
  '"funding opportunity" Uganda OR Kenya OR Tanzania OR Rwanda',
  '"expression of interest" Uganda NGO',
  '"applications open" grant Africa 2026',
  '"request for proposals" Kenya OR Uganda NGO',
];

const parser = new XMLParser({ ignoreAttributes: false });

async function rssItems(url) {
  const res = await fetchRetry(url, {}, { retries: 2 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const items = doc?.rss?.channel?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

// Real destination beats a Google News redirect wrapper where extractable.
function cleanLink(item) {
  const link = typeof item.link === 'string' ? item.link : item.link?.['#text'] ?? '';
  const desc = String(item.description ?? '');
  const m = desc.match(/href="(https?:\/\/(?!news\.google)[^"]+)"/);
  return m?.[1] ?? link;
}

export async function fetchWebRadar() {
  const out = [];
  const seenUrls = new Set();

  for (const q of QUERIES) {
    const feeds = [
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
      `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss`,
    ];
    for (const feed of feeds) {
      let items;
      try {
        items = await rssItems(feed);
      } catch (e) {
        console.error(`  ! webradar feed failed (${q}): ${e.message}`);
        continue;
      }
      for (const item of items.slice(0, 20)) {
        const title = stripHtml(String(item.title ?? ''));
        const url = cleanLink(item);
        if (!title || !url || seenUrls.has(url)) continue;
        // Drop obvious non-opportunities (news about funding, not calls for it)
        const t = title.toLowerCase();
        if (!/(call for|proposal|grant|funding|fellowship|apply|application|tender|award|opportunit|eoi|expression of interest|rfp)/.test(t)) continue;
        seenUrls.add(url);

        let published = null;
        if (item.pubDate) {
          const d = new Date(item.pubDate);
          if (!isNaN(d.getTime())) published = d.toISOString();
        }
        const desc = stripHtml(String(item.description ?? '')).slice(0, 800);

        out.push(enrich({
          id: makeId('webradar', url),
          source: 'Web Radar (unverified lead)',
          funder: null,
          title: title.slice(0, 300),
          url,
          summary: desc,
          type: /tender|rfp|request for proposal|eoi/.test(t) ? 'tender'
            : /fellowship|scholarship/.test(t) ? 'fellowship'
            : /prize|award|competition|challenge/.test(t) ? 'prize' : 'grant',
          published_at: published,
          raw: { query: q },
        }));
      }
    }
  }
  return out;
}
