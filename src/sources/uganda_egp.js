import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Uganda e-Government Procurement portal (PPDA). Server-rendered tables:
// Procuring Entity | Type/Method | Subject | Published | Deadline | Actions
const BASE = 'https://egpuganda.go.ug';
const PAGES = ['/bid-notices', '/bid-notices/consultancy', '/bid-notices/supplies', '/bid-notices/works'];

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

    for (const tr of html.split(/<tr[\s>]/).slice(1)) {
      const noticeUrl = tr.match(/href="(\/bid\/notice\/\d+[^"]*)"/)?.[1];
      if (!noticeUrl) continue;
      const noticeId = noticeUrl.match(/\/notice\/(\d+)/)?.[1];
      if (!noticeId || seen.has(noticeId)) continue;

      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripHtml(m[1]));
      if (cells.length < 4) continue;
      // Layout varies slightly per tab; identify by content shape
      const dates = cells.filter((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
      const entity = cells[0];
      const subject = cells.slice(1, 4).sort((a, b) => b.length - a.length)[0] ?? '';
      const deadline = dates.length >= 2 ? dates[1].slice(0, 10) : dates[0]?.slice(0, 10) ?? null;
      if (!subject || subject.length < 8) continue;
      if (deadline && deadline < today) continue;

      seen.add(noticeId);
      out.push(enrich({
        id: makeId('uganda-egp', noticeId),
        source: 'Uganda eGP (PPDA)',
        funder: entity || 'Government of Uganda',
        title: subject.slice(0, 300),
        url: `${BASE}${noticeUrl}`,
        summary: `${entity} — ${cells.find((c) => /bidding|tender|quotation|proposal/i.test(c)) ?? 'bid notice'}`,
        type: 'tender',
        deadline,
        countries: ['Uganda'],
        raw: { noticeId, cells: cells.slice(0, 6) },
      }));
    }
  }
  return out;
}
