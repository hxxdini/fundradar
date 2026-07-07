import { makeId, enrich, stripHtml, EA_COUNTRIES } from '../normalize.js';
import { fetchRetry } from '../http.js';

const API = 'https://api.reliefweb.int/v1';
const APP = 'fundradar';

// ReliefWeb — humanitarian funding intel. Free public API, no key required.
// Fetches two endpoints: /reports (appeals, RFPs, calls for proposals)
// and /jobs (consultancies + vacancies that include project-based work).

async function rwFetch(endpoint, body) {
  const url = `${API}/${endpoint}?appname=${APP}`;
  const res = await fetchRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'FundRadar/0.1' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`reliefweb ${endpoint} HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function fetchReliefWeb() {
  const out = [];
  const eaNames = EA_COUNTRIES.map((c) =>
    c === 'Congo, Democratic Republic of' ? 'Congo, the Democratic Republic of the' : c
  );

  // --- Reports: appeals, evaluations, RFPs, calls for proposals ---
  const reports = await rwFetch('reports', {
    limit: 30,
    sort: ['date.created:desc'],
    fields: { include: ['title', 'url', 'date', 'body-html', 'source', 'country', 'type'] },
    filter: {
      operator: 'AND',
      conditions: [
        {
          field: 'type.name',
          value: ['Appeal', 'Evaluation and Lessons Learned', 'Manual and Guideline', 'Other'],
          operator: 'OR',
        },
        {
          field: 'country.name',
          value: eaNames,
          operator: 'OR',
        },
      ],
    },
  });

  for (const item of reports) {
    const f = item.fields ?? {};
    const title = f.title ?? '';
    const url = f.url ?? '';
    if (!title || !url) continue;

    const body = stripHtml(f['body-html'] ?? '').slice(0, 1200);
    const countries = (f.country ?? []).map((c) => c.name).filter(Boolean);
    const source = (f.source ?? [])[0]?.name ?? 'ReliefWeb';

    let type = 'grant';
    const t = `${title} ${body}`.toLowerCase();
    if (/tender|request for proposals|\brfp\b|procurement|bid/.test(t)) type = 'tender';
    else if (/fellowship|scholarship/.test(t)) type = 'fellowship';
    else if (/\baward\b|\bprize\b|competition|challenge/.test(t)) type = 'prize';

    const published_at = f.date?.created ? new Date(f.date.created).toISOString() : null;

    const rec = enrich({
      id: makeId('ReliefWeb', url),
      source: 'ReliefWeb',
      funder: source !== 'ReliefWeb' ? source : null,
      title: title.slice(0, 300),
      url,
      summary: body,
      type,
      deadline: null,
      countries,
      published_at,
      raw: { type: (f.type ?? [])[0]?.name ?? null },
    });
    if (rec) out.push(rec);
  }

  // --- Jobs: consultancies and project-based opportunities ---
  const jobs = await rwFetch('jobs', {
    limit: 30,
    sort: ['date.closing:desc'],
    fields: { include: ['title', 'url', 'date', 'body-html', 'source', 'country', 'type', 'closing_date'] },
    filter: {
      operator: 'AND',
      conditions: [
        { field: 'type.name', value: 'Consultancy', operator: 'OR' },
        { field: 'country.name', value: eaNames, operator: 'OR' },
      ],
    },
  });

  for (const item of jobs) {
    const f = item.fields ?? {};
    const title = f.title ?? '';
    const url = f.url ?? '';
    if (!title || !url) continue;

    const body = stripHtml(f['body-html'] ?? '').slice(0, 1200);
    const countries = (f.country ?? []).map((c) => c.name).filter(Boolean);
    const source = (f.source ?? [])[0]?.name ?? 'ReliefWeb';
    const deadline = parseDate(f.date?.closing);
    const published_at = f.date?.created ? new Date(f.date.created).toISOString() : null;

    const rec = enrich({
      id: makeId('ReliefWeb', url),
      source: 'ReliefWeb',
      funder: source !== 'ReliefWeb' ? source : null,
      title: title.slice(0, 300),
      url,
      summary: body,
      type: 'tender',
      deadline,
      countries,
      published_at,
      raw: { rw_type: 'consultancy' },
    });
    if (rec) out.push(rec);
  }

  return out;
}
