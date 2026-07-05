import { makeId, enrich } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Kenya Public Procurement Information Portal — clean JSON API (OCDS ids).
const API = 'https://tenders.go.ke/api/active-tenders';

export async function fetchKenyaTenders({ pages = 3, perpage = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    // The portal rate-limits aggressively — go slow and give it room
    if (page > 1) await new Promise((r) => setTimeout(r, 5000));
    const res = await fetchRetry(`${API}?perpage=${perpage}&page=${page}`, {
      headers: { Accept: 'application/json' },
    }, { retries: 4, backoffMs: 15000, timeoutMs: 120000 });
    if (!res.ok) throw new Error(`kenya-tenders HTTP ${res.status}`);
    const data = await res.json();
    const tenders = data.data ?? [];
    if (tenders.length === 0) break;

    for (const t of tenders) {
      if (!t.title || t.terminated) continue;
      const deadline = t.close_at ? String(t.close_at).slice(0, 10) : null;

      out.push(enrich({
        id: makeId('kenya-tenders', t.id),
        source: 'Kenya PPIP (tenders.go.ke)',
        funder: t.pe?.name ?? 'Government of Kenya',
        title: String(t.title).slice(0, 300),
        url: `https://tenders.go.ke/tenders/${t.id}`,
        summary: [t.tender_ref, t.venue].filter(Boolean).join(' — '),
        type: 'tender',
        deadline,
        countries: ['Kenya'],
        published_at: t.published_at ? String(t.published_at).slice(0, 10) : null,
        raw: { id: t.id, ocid: t.ocid, ref: t.tender_ref },
      }));
    }
    if (data.last_page && page >= data.last_page) break;
  }
  return out;
}
