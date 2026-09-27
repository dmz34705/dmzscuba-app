// Reads flights out of an airline confirmation email on the device — no network. Airline emails
// differ, so this looks for the pieces every one of them has (a flight number, two airport codes,
// departure and arrival times, a date) and groups them per flight. Anything it can't pin down is
// reported in `issues`; the caller then offers smart import or leaves it for the diver to fill in.
// Pure and deterministic: pass `today` so years can be inferred for dates printed without one.

export const AIRLINES = Object.freeze({
  UA: 'United', AA: 'American', DL: 'Delta', WN: 'Southwest', B6: 'JetBlue', AS: 'Alaska', NK: 'Spirit', F9: 'Frontier',
  HA: 'Hawaiian', SY: 'Sun Country', MX: 'Breeze', G4: 'Allegiant', AC: 'Air Canada', WS: 'WestJet', AM: 'Aeromexico',
  Y4: 'Volaris', VB: 'Viva Aerobus', CM: 'Copa', AV: 'Avianca', BW: 'Caribbean Airlines', KX: 'Cayman Airways', UP: 'Bahamasair',
  BA: 'British Airways', VS: 'Virgin Atlantic', AF: 'Air France', KL: 'KLM', LH: 'Lufthansa', LX: 'Swiss', IB: 'Iberia',
  TP: 'TAP Air Portugal', EI: 'Aer Lingus', EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad', TK: 'Turkish Airlines',
  SQ: 'Singapore Airlines', CX: 'Cathay Pacific', QF: 'Qantas', NZ: 'Air New Zealand', JL: 'Japan Airlines', NH: 'ANA',
  KE: 'Korean Air', PR: 'Philippine Airlines', '5J': 'Cebu Pacific', GA: 'Garuda Indonesia', MH: 'Malaysia Airlines',
  TG: 'Thai Airways', FJ: 'Fiji Airways', TN: 'Air Tahiti Nui', MS: 'EgyptAir', ET: 'Ethiopian', MU: 'China Eastern', CI: 'China Airlines',
});
const NAME_TO_CODE = Object.fromEntries(Object.entries(AIRLINES).map(([code, name]) => [name.toLowerCase(), code]));
const NAME_PATTERN = Object.values(AIRLINES).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
const CODE_PATTERN = Object.keys(AIRLINES).join('|');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_PATTERN = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
// Three-letter words in capitals that are not airports.
const NOT_AIRPORTS = new Set(`THE AND FOR YOU ARE NOT BUT ALL ANY CAN HAS HER HIS HOW ITS MAY NEW NOW OFF ONE OUR OUT OWN SEE SHE TOO TWO USE WAY WHO WHY YES YET
  USD EUR GBP CAD MXN AUD NZD JPY PDF EST EDT CST CDT MST MDT PST PDT AKST HST UTC GMT MON TUE WED THU FRI SAT SUN JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC
  TSA FAQ APP SMS VIP ROW FLT DEP ARR TKT REF PNR BAG QTY TAX FEE NON AIR KID MRS DOB ETA ETD APT CTR DAY WEB URL MPH KGS LBS INC LLC CEO MIN MAX REV`.split(/\s+/));

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');
export const addDay = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export function normalizeEmailText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[–—→➝➡]/g, (c) => (c === '–' || c === '—' ? '-' : ' → '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// A date printed without a year belongs to the next time that month/day comes round.
function withYear(month, day, year, today) {
  if (year) return isoDate(year < 100 ? 2000 + year : year, month, day);
  const base = today || new Date().toISOString().slice(0, 10);
  const guess = isoDate(Number(base.slice(0, 4)), month, day);
  return guess && guess < addDay(base, -60) ? isoDate(Number(base.slice(0, 4)) + 1, month, day) : guess;
}

export function findDates(text, today) {
  const found = [];
  const push = (index, value) => { if (value) found.push({ index, value }); };
  const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  let m;
  const monthFirst = new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = monthFirst.exec(text))) push(m.index, withYear(monthIndex(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0, today));
  const dayFirst = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN},?(?:\\s+(\\d{4}))?`, 'gi');
  while ((m = dayFirst.exec(text))) push(m.index, withYear(monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : 0, today));
  const compact = /\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2}|\d{4})?\b/g;
  while ((m = compact.exec(text))) push(m.index, withYear(monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : 0, today));
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(text))) push(m.index, isoDate(Number(m[1]), Number(m[2]), Number(m[3])));
  const numeric = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/g; // US order, as US airlines print it
  while ((m = numeric.exec(text))) push(m.index, withYear(Number(m[1]), Number(m[2]), Number(m[3]), today));
  // Overlapping matches ("Nov 7, 2026" also looks like "7, 2026") — keep the first at each spot.
  // Booking, payment and offer dates are paperwork, never travel: "Booking date 10 October 2025".
  const paperwork = /\b(?:book(?:ing|ed)(?: date| on)?|reserv(?:ation|ed)(?: date| on)|received(?: on)?|paid(?: on)?|payment(?: date)?|issued?(?: date| on)?|purchase(?:d| date)?(?: on)?|valid until|expires?|sent|order date)\W*$/i;
  return found.sort((a, b) => a.index - b.index)
    .filter((entry, i, all) => i === 0 || entry.index - all[i - 1].index > 3)
    .filter((entry) => !paperwork.test(text.slice(Math.max(0, entry.index - 40), entry.index)));
}

export function findTimes(text) {
  const found = [];
  // Colon times only: "12.50" is usually a price.
  const re = /\b([01]?\d|2[0-3]):([0-5]\d)(?!\d)\s*([ap])?\.?\s*(m\b\.?)?/gi;
  let m;
  while ((m = re.exec(text))) {
    let h = Number(m[1]);
    // "4:00 - 4:30 pm": the range's am/pm belongs to both times.
    const shared = !m[3] && h <= 12 ? /^\s*(?:-|to)\s*\d{1,2}:\d{2}\s*([ap])\.?\s*m\b/i.exec(text.slice(re.lastIndex, re.lastIndex + 24))?.[1] : null;
    const suffix = (m[3] || shared)?.toLowerCase();
    if (suffix) { if (h > 12 || h === 0) continue; if (suffix === 'p' && h < 12) h += 12; if (suffix === 'a' && h === 12) h = 0; }
    found.push({ index: m.index, value: `${pad(h)}:${m[2]}` });
  }
  return found;
}

function findAirports(text) {
  const inParens = [], bare = [];
  let m;
  const parens = /\(([A-Z]{3})\)/g;
  while ((m = parens.exec(text))) if (!NOT_AIRPORTS.has(m[1])) inParens.push({ index: m.index, value: m[1] });
  const words = /(?<![A-Za-z0-9])([A-Z]{3})(?![A-Za-z0-9])/g;
  while ((m = words.exec(text))) if (!NOT_AIRPORTS.has(m[1])) bare.push({ index: m.index, value: m[1] });
  return { inParens, bare };
}

function findFlightNumbers(text, fallbackCode) {
  const found = [];
  let m;
  const byCode = new RegExp(`(?<![A-Za-z0-9])(${CODE_PATTERN})\\s?-?(\\d{1,4})(?![\\d:])`, 'g');
  while ((m = byCode.exec(text))) found.push({ index: m.index, code: m[1], number: m[2] });
  const byName = new RegExp(`\\b(${NAME_PATTERN})(?:\\s+(?:Airlines|Air Lines|Airways))?\\s+(?:flight\\s+)?#?\\s?(\\d{1,4})\\b(?![:/])`, 'gi');
  while ((m = byName.exec(text))) found.push({ index: m.index, code: NAME_TO_CODE[m[1].toLowerCase()], number: m[2] });
  if (fallbackCode) {
    // "Flight 1 of 3" counts flights; it isn't a flight number.
    const bare = /\bflight(?:\s+(?:number|no\.?))?\s*[:#]?\s*(\d{1,4})\b(?!\s*of\s+\d)/gi;
    while ((m = bare.exec(text))) found.push({ index: m.index, code: fallbackCode, number: m[1] });
  }
  // One flight per spot, first match wins ("United flight 1234" and "flight 1234" are the same).
  return found.sort((a, b) => a.index - b.index).filter((entry, i, all) => i === 0 || entry.index - all[i - 1].index > 25 || `${entry.code}${entry.number}` !== `${all[i - 1].code}${all[i - 1].number}`);
}

export function mostMentionedAirline(text) {
  let best = '', count = 0;
  for (const [code, name] of Object.entries(AIRLINES)) {
    const hits = (text.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
    if (hits > count) { best = code; count = hits; }
  }
  return best;
}

export function findConfirmation(text) {
  const re = /\b(?:confirmation(?:\s+(?:number|code|#))?|record\s+locator|booking\s+(?:reference|code|number)|reservation\s+(?:code|number)|trip\s+confirmation|PNR)\b\s*(?:is|:|#|-)?\s*:?\s*([A-Z0-9]{6})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const code = m[1].toUpperCase();
    if (/[A-Z]/.test(code) && !/^(NUMBER|NUMBERS)$/.test(code)) return code;
  }
  return '';
}

const within = (list, start, end) => list.filter((entry) => entry.index >= start && entry.index < end);
const lastBefore = (list, index) => [...list].reverse().find((entry) => entry.index < index);

// Reads one flight from the stretch of text around its flight number.
function readFlight(text, flight, start, end, tokens) {
  const region = text.slice(start, end);
  const parens = within(tokens.airports.inParens, start, end);
  const airports = (parens.length >= 2 ? parens : within(tokens.airports.bare, start, end)).map((entry) => entry.value)
    .filter((code, i, all) => all.indexOf(code) === i);
  const times = within(tokens.times, start, end).map((entry) => entry.value);
  const dates = within(tokens.dates, start, end).map((entry) => entry.value);
  const carried = lastBefore(tokens.dates, start)?.value || '';
  const startDate = dates[0] || carried;
  let endDate = dates[1] && dates[1] >= startDate ? dates[1] : startDate;
  if (startDate && endDate === startDate && /\+\s?1\b|next day|arrives the following day/i.test(region)) endDate = addDay(startDate, 1);
  const seat = /\bseats?\s*(?:number)?\s*:?\s*(\d{1,2}[A-K])\b/i.exec(region)?.[1];
  return {
    type: 'flight', title: `${flight.code} ${flight.number}`, provider: AIRLINES[flight.code] || '',
    from: airports[0] || '', to: airports[1] || '', startDate, startTime: times[0] || '', endDate, endTime: times[1] || '',
    notes: seat ? `Seat ${seat.toUpperCase()}` : '',
  };
}

const completeness = (flight) => ['from', 'to', 'startDate', 'startTime', 'endTime'].filter((key) => flight[key]).length;

export function parseFlightText(input, { today } = {}) {
  const text = normalizeEmailText(input);
  const fallback = mostMentionedAirline(text);
  const tokens = { dates: findDates(text, today), times: findTimes(text), airports: findAirports(text) };
  const numbers = findFlightNumbers(text, fallback);

  // Some emails put a flight's details after its number, others before. Read both ways and keep
  // whichever explains more of the email.
  const read = (after) => numbers.map((flight, i) => {
    const start = after ? flight.index : (i ? numbers[i - 1].index + 8 : Math.max(0, flight.index - 400));
    const end = after ? (numbers[i + 1]?.index ?? Math.min(text.length, flight.index + 600)) : flight.index + 12;
    return readFlight(text, flight, start, end, tokens);
  });
  const score = (list) => list.reduce((sum, flight) => sum + completeness(flight), 0);
  const after = read(true), before = read(false);
  const candidates = score(before) > score(after) ? before : after;

  // Emails repeat flights (summary + details): keep the most complete copy of each.
  const byKey = new Map();
  for (const flight of candidates) {
    const key = `${flight.title}|${flight.startDate}`;
    const existing = byKey.get(key);
    if (!existing || completeness(flight) > completeness(existing)) byKey.set(key, flight);
  }
  const flights = [...byKey.values()]
    .filter((flight) => completeness(flight) >= 2)
    .sort((a, b) => `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`));

  const issues = [];
  if (!flights.length) issues.push('No flights found.');
  flights.forEach((flight, i) => {
    const missing = [!flight.from || !flight.to ? 'airports' : '', !flight.startDate ? 'date' : '', !flight.startTime || !flight.endTime ? 'times' : ''].filter(Boolean);
    if (missing.length) issues.push(`Flight ${i + 1} (${flight.title}) is missing ${missing.join(' and ')}.`);
  });
  return { flights, reference: findConfirmation(text), issues, complete: flights.length > 0 && issues.length === 0 };
}
