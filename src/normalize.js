import crypto from 'node:crypto';

export const EA_COUNTRIES = [
  'Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi',
  'South Sudan', 'Ethiopia', 'Somalia', 'Congo, Democratic Republic of',
];

const COUNTRY_ALIASES = {
  'Uganda': ['uganda', 'ugandan'],
  'Kenya': ['kenya', 'kenyan'],
  'Tanzania': ['tanzania', 'tanzanian'],
  'Rwanda': ['rwanda', 'rwandan'],
  'Burundi': ['burundi'],
  'South Sudan': ['south sudan'],
  'Ethiopia': ['ethiopia', 'ethiopian'],
  'Somalia': ['somalia', 'somali '],
  'Congo, Democratic Republic of': ['democratic republic of congo', 'dr congo', 'drc'],
};

const REGION_HINTS = [
  'east africa', 'eastern africa', 'sub-saharan africa', 'sub saharan africa',
  'africa', 'african', 'developing countries', 'global south', 'low- and middle-income',
  'low and middle income', 'lmic', 'acp countries', 'worldwide', 'global',
];

const SECTOR_KEYWORDS = {
  'Agriculture & Food': ['agricultur', 'farmer', 'food security', 'agri-', 'agribusiness', 'livestock', 'crop', 'fisheries', 'nutrition'],
  'Health': ['health', 'medical', 'disease', 'hiv', 'malaria', 'tuberculosis', 'vaccine', 'maternal', 'sanitation'],
  'Education': ['education', 'school', 'teacher', 'learner', 'literacy', 'scholarship', 'curriculum', 'student'],
  'Climate & Environment': ['climate', 'environment', 'biodiversity', 'conservation', 'renewable', 'resilience', 'adaptation', 'carbon', 'forest'],
  'Water & WASH': ['water', 'wash ', 'hygiene', 'irrigation', 'borehole'],
  'Governance & Rights': ['governance', 'human rights', 'democracy', 'justice', 'accountability', 'anti-corruption', 'rule of law', 'civic'],
  'Gender & Inclusion': ['gender', 'women', 'girls', 'gbv', 'inclusion', 'disability', 'lgbt'],
  'Youth': ['youth', 'young people', 'adolescent'],
  'Energy': ['energy', 'solar', 'electrification', 'off-grid'],
  'Digital & ICT': ['digital', 'ict', 'technology', 'innovation', 'internet', ' ai ', 'data '],
  'Humanitarian': ['humanitarian', 'refugee', 'displacement', 'emergency', 'crisis response'],
  'Livelihoods & Economic Dev': ['livelihood', 'economic', 'entrepreneur', 'sme', 'business development', 'employment', 'financial inclusion', 'microfinance', 'trade'],
  'Media & Journalism': ['journalis', 'media', 'press freedom', 'reporting'],
};

const ELIGIBILITY_KEYWORDS = {
  'NGOs/CSOs': ['ngo', 'civil society', 'cso', 'non-profit', 'nonprofit', 'community-based', 'community organisations', 'community organizations'],
  'Local/national organizations': ['local organi', 'national organi', 'grassroots', 'locally led', 'local partners'],
  'SMEs/Startups': ['sme', 'startup', 'start-up', 'enterprise', 'business'],
  'Individuals': ['individual', 'fellowship', 'scholarship', 'artist', 'writer', 'student'],
  'Researchers/Academia': ['research', 'universit', 'academic', 'scientist'],
  'Journalists': ['journalist', 'media professional'],
  'Government': ['government', 'ministry', 'public sector', 'municipal'],
};

export function makeId(source, key) {
  return crypto.createHash('sha256').update(`${source}::${key}`).digest('hex').slice(0, 24);
}

export function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectCountries(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) hits.push(country);
  }
  return hits;
}

export function detectRegionHint(text) {
  const t = text.toLowerCase();
  return REGION_HINTS.some((r) => t.includes(r));
}

export function detectSectors(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(sector);
  }
  return hits;
}

export function detectEligibility(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [group, kws] of Object.entries(ELIGIBILITY_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(group);
  }
  return hits;
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Extract a deadline date from free text: "Deadline: 12 August 2026", "(Deadline: July 31, 2026)", "12-Aug-26", "31/07/2026"
export function extractDeadline(text) {
  if (!text) return null;
  const t = text.replace(/ /g, ' ');

  // "Deadline: <something>" windows first, else scan whole text
  const windowMatch = t.match(/deadline[^a-z0-9]{0,5}(?:date)?[^a-z0-9]{0,5}([^.;|]{4,60})/i);
  const scan = windowMatch ? windowMatch[1] : t;

  // 12 August 2026 / August 12, 2026 / 12-Aug-2026 / 12 Aug 26
  let m = scan.match(/(\d{1,2})[\s\-/]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/,]*(\d{2,4})/i);
  if (m) return toIso(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], m[1]);
  m = scan.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]*(\d{2,4})/i);
  if (m) return toIso(m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], m[2]);
  // 31/07/2026 or 31-07-2026 (day-first, the regional convention)
  m = scan.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return toIso(m[3], Number(m[2]) - 1, m[1]);
  // ISO already
  m = scan.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toIso(y, monthIdx, d) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const day = Number(d);
  if (monthIdx == null || monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;
  if (year < 2020 || year > 2035) return null;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Extract an amount like "$50,000", "USD 100,000", "€2 million", "UGX 20,000,000"
export function extractAmount(text) {
  if (!text) return null;
  const m = text.match(/(?:USD|EUR|GBP|UGX|KES|TZS|\$|€|£)\s?[\d,.]+(?:\s?(?:million|m|billion|k))?/i);
  return m ? m[0].trim() : null;
}

// A record is EA-relevant if it names an EA country, or is Africa/global-scoped
export function isEaRelevant(countries, text) {
  if (countries.length > 0) return true;
  return detectRegionHint(text);
}

export function enrich(base) {
  const text = `${base.title} ${base.summary ?? ''}`;
  // Merge explicit source countries (authoritative) with text detection
  const countries = [...new Set([...(base.countries ?? []), ...detectCountries(text)])];
  return {
    ...base,
    countries,
    sectors: detectSectors(text),
    eligibility: detectEligibility(text),
    deadline: base.deadline ?? extractDeadline(text),
    amount: base.amount ?? extractAmount(text),
    ea_relevant: isEaRelevant(countries, text),
  };
}
