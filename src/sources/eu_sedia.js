import { makeId, enrich } from '../normalize.js';
import { fetchRetry } from '../http.js';

const API = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***';

// SEDIA returns programme codes, not names
const PROGRAMMES = {
  43108390: 'Horizon Europe',
  43152860: 'Digital Europe',
  43251567: 'Creative Europe',
  43252386: 'Erasmus+',
  43252476: 'LIFE',
  44181033: 'Global Europe (NDICI)',
  43254037: 'Citizens, Equality, Rights and Values',
  43332642: 'Single Market Programme',
  45532249: 'EU External Action',
};
const programmeName = (code) => PROGRAMMES[code] ?? 'European Union';

// EU Funding & Tenders portal (SEDIA). Multipart form query for open + forthcoming
// grant calls and tenders. Status codes: 31094501 = Forthcoming, 31094502 = Open.
export async function fetchEuSedia({ pages = 3, pageSize = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const res = await fetchRetry(`${API}&pageSize=${pageSize}&pageNumber=${page}`, {
      method: 'POST',
      form: {
        query: JSON.stringify({
          bool: { must: [
            { terms: { type: ['1', '2', '8'] } },
            { terms: { status: ['31094501', '31094502'] } },
          ] },
        }),
        sort: JSON.stringify({ field: 'sortStatus', order: 'ASC' }),
        languages: JSON.stringify(['en']),
      },
    });
    if (!res.ok) throw new Error(`eu-sedia HTTP ${res.status}`);
    const data = await res.json();
    const results = data.results ?? [];
    if (results.length === 0) break;

    for (const r of results) {
      const md = r.metadata ?? {};
      const first = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
      const identifier = first(md.identifier) ?? r.reference;
      const title = first(md.title) ?? r.summary ?? identifier;
      if (!identifier || !title) continue;

      const deadlineRaw = first(md.deadlineDate) ?? first(md.deadlineDatesLong);
      let deadline = null;
      if (deadlineRaw) {
        const d = new Date(isNaN(Number(deadlineRaw)) ? deadlineRaw : Number(deadlineRaw));
        if (!isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
      }
      const isTender = first(md.type) === '2';

      out.push(enrich({
        id: makeId('eu-sedia', identifier),
        source: 'EU Funding & Tenders',
        funder: programmeName(first(md.frameworkProgramme)),
        title: String(title).slice(0, 300),
        url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/${isTender ? 'tender' : 'topic'}-details/${String(identifier).toLowerCase()}`,
        summary: first(md.callTitle) ?? first(md.descriptionByte) ?? null,
        type: isTender ? 'tender' : 'grant',
        deadline,
        published_at: first(md.startDate) ?? null,
        raw: { identifier, status: first(md.status), programme: first(md.frameworkProgramme) },
      }));
    }
  }
  return out;
}
