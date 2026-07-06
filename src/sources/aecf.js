import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// AECF (Africa Enterprise Challenge Fund) — funding-opportunities page is a small,
// hand-curated list of currently-open programme windows (usually single digits).
// No deadlines are published on this page or the linked programme pages (these are
// rolling/continuous windows) — enrich() leaves deadline null, which is fine; the
// site shows undated-but-recently-seen items for 14 days.
const URL = 'https://www.aecfafrica.org/im-looking-to/see-aecfs-funding-opportunities/';

export async function fetchAecf() {
  const res = await fetchRetry(URL, {}, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const out = [];
  for (const li of html.split(/<li class="flex-parent">/).slice(1)) {
    const label = stripHtml(li.match(/<p class="text-label[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '');
    const title = stripHtml(li.match(/<h2 class="post-title[^"]*">([\s\S]*?)<\/h2>/)?.[1] ?? '');
    const href = li.match(/<a class="text-button[^"]*"\s+href="([^"]+)"/)?.[1];
    if (!title || !href) continue;

    out.push(enrich({
      id: makeId('aecf', href),
      source: 'AECF (Africa Enterprise Challenge Fund)',
      funder: 'AECF',
      title: label ? `${label}: ${title}` : title,
      url: href,
      summary: label,
      type: 'grant',
      raw: { label, title, href },
    }));
  }
  return out;
}
