import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Uganda e-Government Procurement portal (PPDA). Server-rendered tables.
// Row structure: Reference | Type | Subject (truncated) | Published | Deadline | Actions
// Notice URLs are absolute: https://egpuganda.go.ug/index/{id}_egp
const BASE = 'https://egpuganda.go.ug';
const PAGES = ['/bid-notices', '/bid-notices/consultancy', '/bid-notices/none-consultancy', '/bid-notices/supplies', '/bid-notices/works'];

async function fetchFullSubject(noticeUrl) {
  try {
    const res = await fetchRetry(noticeUrl, {}, { timeoutMs: 60000 });
    if (!res.ok) return null;
    const text = stripHtml(await res.text()).replace(/\s+/g, ' ');
    const m = text.match(/Subject of Procurement\s+([\s\S]*?)\s+Procurement Method/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

export async function fetchUgandaEgp() {
  const seen = new Set();
  const out = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const page of PAGES) {
    let html;
    try {
      const res = await fetchRetry(`${BASE}${page}`, {}, { timeoutMs: 60000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e) {
      console.error(`  ! uganda-egp ${page}: ${e.message}`);
      continue;
    }

    // Rows use absolute URLs: https://egpuganda.go.ug/index/{id}_egp
    for (const tr of html.split(/<tr[\s>]/).slice(1)) {
      // Match both relative /index/ and absolute https://egpuganda.go.ug/index/ links
      const noticeUrl = tr.match(/href="((?:https:\/\/egpuganda\.go\.ug)?\/index\/(\d+)_egp)"/)?.[1];
      const noticeId = tr.match(/\/index\/(\d+)_egp/)?.[1];
      if (!noticeUrl || !noticeId || seen.has(noticeId)) continue;

      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripHtml(m[1]).replace(/\s+/g, ' ').trim());
      if (cells.length < 4) continue;

      // cells[0]=ref, cells[1]=type, cells[2]=subject, cells[3]=published, cells[4]=deadline
      const subject = cells[2] ?? '';
      const published = cells[3] ?? '';
      const deadline = cells[4]?.slice(0, 10) ?? null;
      const entity = cells[0] ?? '';
      const type = cells[1] ?? '';

      if (!subject || subject.length < 8) continue;
      if (deadline && deadline < today) continue;

      seen.add(noticeId);

      // Fetch full subject if truncated
      const fullUrl = noticeUrl.startsWith('http') ? noticeUrl : `${BASE}${noticeUrl}`;
      const fullSubject = subject.endsWith('...') ? await fetchFullSubject(fullUrl) : null;

      out.push(enrich({
        id: makeId('uganda-egp', noticeId),
        source: 'Uganda eGP (PPDA)',
        funder: 'Government of Uganda',
        title: (fullSubject || subject).slice(0, 300),
        url: fullUrl,
        summary: `${entity} — ${type} tender`,
        type: 'tender',
        deadline,
        published: published.slice(0, 10) || null,
        countries: ['Uganda'],
        raw: { noticeId, ref: entity, type, cells: cells.slice(0, 5) },
      }));
    }
  }
  return out;
}
