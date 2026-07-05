import { makeId, enrich, EA_COUNTRIES } from '../normalize.js';
import { fetchRetry } from '../http.js';

const API = 'https://search.worldbank.org/api/v2/procnotices';

// World Bank procurement notices — tenders under WB-financed projects.
// The API is huge (400k+ notices); we pull recent pages and keep EA countries with live deadlines.
export async function fetchWorldBank({ pages = 4, rows = 200 } = {}) {
  const out = [];
  for (let page = 0; page < pages; page++) {
    const url = `${API}?format=json&rows=${rows}&os=${page * rows}&srt=noticedate&order=desc`;
    const res = await fetchRetry(url, { });
    if (!res.ok) throw new Error(`worldbank HTTP ${res.status}`);
    const data = await res.json();
    const notices = data.procnotices ?? [];
    if (notices.length === 0) break;

    for (const n of notices) {
      const country = n.project_ctry_name ?? '';
      if (!EA_COUNTRIES.some((c) => country.includes(c.split(',')[0]))) continue;
      const deadline = n.submission_deadline_date ? n.submission_deadline_date.slice(0, 10) : null;
      if (deadline && deadline < new Date().toISOString().slice(0, 10)) continue;

      out.push(enrich({
        id: makeId('worldbank', n.id),
        source: 'World Bank Procurement',
        funder: 'World Bank',
        title: n.bid_description || n.project_name || `Notice ${n.id}`,
        url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${n.id}`,
        summary: [n.notice_type, n.project_name, n.procurement_method_name, n.bid_reference_no]
          .filter(Boolean).join(' — '),
        type: 'tender',
        deadline,
        countries: [country],
        published_at: n.noticedate ?? null,
        raw: n,
      }));
    }
  }
  return out;
}
