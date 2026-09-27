// Reads non-flight bookings — hotels, rental cars, liveaboards, tours and dive bookings, ferries and
// transfers — out of a confirmation email on the device. Emails for these vary far more than airline
// ones, so this only claims a booking when the email clearly is one (a hotel needs both check-in and
// check-out, a car both pick-up and drop-off) and reads the dates printed beside those labels.
// Anything it can't pin down goes in `issues` and the caller offers smart import instead.
import { addDay, findConfirmation, findDates, findTimes, normalizeEmailText } from './parseFlightText';

const RENTAL_COMPANIES = ['Hertz', 'Avis', 'Enterprise', 'Budget', 'National', 'Alamo', 'Sixt', 'Thrifty', 'Dollar', 'Europcar', 'Fox Rent A Car', 'Payless', 'Turo', 'Mex Rent a Car', 'America Car Rental'];
const ACTIVITY_PLATFORMS = ['Viator', 'Tripadvisor', 'GetYourGuide', 'Klook', 'Airbnb Experiences'];
const STAY_PLATFORMS = ['Booking.com', 'Airbnb', 'Expedia', 'Hotels.com', 'Vrbo', 'Agoda', 'Marriott', 'Hilton', 'Hyatt', 'IHG'];
const LIVEABOARD_PLATFORMS = ['LiveAboard.com', 'Aggressor', 'Dancer Fleet', 'Blue O Two', 'Master Liveaboards', 'PADI Travel', 'Scuba Travel', 'Dive Worldwide'];

const has = (text, pattern) => pattern.test(text);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstNamed = (text, names) => names.find((name) => new RegExp(`\\b${escape(name)}\\b`, 'i').test(text)) || '';

// The first date (and time) printed within a short stretch after a label like "Check-in". A list
// of labels is tried in order and the first one followed by a date wins, so "Return date" beats
// a "Return to" line that happens to sit above the departure date.
function labelled(text, label, tokens, reach = 160) {
  for (const option of Array.isArray(label) ? label : [label]) {
    const match = option.exec(text);
    if (!match) continue;
    const start = match.index, end = match.index + match[0].length + reach;
    const date = tokens.dates.find((entry) => entry.index >= start && entry.index < end);
    if (!date) continue;
    // The time belongs to this date: on its line, not the next label's.
    const lineEnd = text.indexOf('\n', date.index);
    const time = tokens.times.find((entry) => entry.index >= start && entry.index < (lineEnd < 0 ? end : Math.min(end, lineEnd)));
    return { date: date.value, time: time?.value || '' };
  }
  return null;
}

// A value printed after its label — on the same line ("Vessel: Manta Queen 3") or, as text copied
// from a PDF comes out, on the line below ("Vessel" / "Manta Queen 3"). A list of labels is tried in
// order, so "Pick-up location" wins over a bare "Pick-up" line that holds the time.
function field(text, label, max = 120) {
  for (const option of Array.isArray(label) ? label : [label]) {
    const match = new RegExp(`(?:^|\\n)[ \\t]*(?:${option})[ \\t]*(?:[:#-][ \\t]*|\\n[ \\t]*)([^\\n]{2,${max}})`, 'i').exec(text);
    if (match) return match[1].trim().replace(/\s{2,}/g, ' ');
  }
  return '';
}

// "Your reservation at Casa Mexicana" / "Booking confirmed: Snorkel tour" in the subject line.
function subjectName(text) {
  const subject = /(?:^|\n)Subject:\s*([^\n]+)/i.exec(text)?.[1] || '';
  const match = /(?:reservation|booking|stay|trip|order)\s+(?:at|for|to|with)\s+(.+?)(?:\s+(?:is|has been)\s+confirmed|[,!|]|\s+-\s+|$)/i.exec(subject)
    || /(?:confirmed|confirmation|booked)\s*[:!-]\s*(.+?)(?:[,!|]|\s+-\s+|$)/i.exec(subject);
  return match ? match[1].trim().replace(/[.:]$/, '') : '';
}

// Booking numbers hotels and tour sites use: "Booking ID: 4012.559.873", "Itinerary # 7291038847".
export function findReference(text) {
  const airline = findConfirmation(text);
  if (airline) return airline;
  const match = /\b(?:booking|reservation|confirmation|itinerary|order|voucher|trip)\s*(?:id|number|no\.?|code|ref(?:erence)?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9.-]{3,20}[A-Z0-9])\b/i.exec(text);
  return match && /\d/.test(match[1]) ? match[1].toUpperCase() : '';
}

// Kinds of booking the email clearly contains, strongest evidence first. Hotels, cars and
// liveaboards need their paired labels; the rest are weaker and only count when nothing else does
// (`strongOnly` — an airline email mentions tickets and dates, which doesn't make it a tour).
export function bookingKinds(text, { strongOnly = false } = {}) {
  const kinds = [];
  if (has(text, /\blive-?aboard\b|\bdive (?:cruise|safari)\b/i) || (has(text, /\bembark(?:ation)?\b/i) && has(text, /\bdisembark(?:ation)?\b/i))) kinds.push('liveaboard');
  if (has(text, /\b(?:rental car|car rental|rent a car|vehicle|car class|car type)\b/i) && has(text, /\bpick[- ]?up\b/i) && has(text, /\b(?:drop[- ]?off|return)\b/i)) kinds.push('car');
  // A liveaboard's cabin check-in, "5 nights" and "hotel transfer" are not a hotel booking; with a
  // liveaboard, a stay needs a hotel actually named under its own label.
  if (has(text, /\bcheck[- ]?in\b/i) && has(text, /\bcheck[- ]?out\b/i) && has(text, /\b(?:hotel|resort|room|nights?|guests?|property|villa|apartment|condo|suite)\b/i)
    && !(kinds.includes('liveaboard') && !field(text, ['Hotel', 'Hotel name', 'Property', 'Accommodation', 'Resort']))) kinds.push('stay');
  if (kinds.length || strongOnly) return kinds;
  const kind = weakKind(text);
  return kind ? [kind] : [];
}

function weakKind(text) {
  const diving = has(text, /\b(?:\d\s?-?\s?tank|two[- ]tank|boat dives?|shore dives?|dive trip|guided dives?|dives?\s+(?:at|to|with))\b/i);
  const activity = has(text, /\b(?:tour|activity|excursion|experience|tickets?|admission)\b/i) || Boolean(firstNamed(text, ACTIVITY_PLATFORMS));
  if (diving) return 'diving';
  // A tour that meets at the ferry pier is still a tour: tour sites and "tour" wording come first.
  const tour = Boolean(firstNamed(text, ACTIVITY_PLATFORMS)) || has(text, /\b(?:tour|excursion|experience)\b/i);
  const dated = has(text, /\b(?:date|when|meeting point|pick-?up|starts?|departs?)\b/i);
  if (tour && dated) return 'activity';
  if (has(text, /\bferry\b/i) && has(text, /\b(?:ticket|crossing|sailing|departs?|departure|boarding)\b/i)) return 'ferry';
  if (has(text, /\b(?:airport transfer|shuttle|private transfer|transfer service|driver will meet)\b/i)) return 'transfer';
  if (activity && dated) return 'activity';
  return '';
}

export function parseBookingText(input, { today, strongOnly = false } = {}) {
  const text = normalizeEmailText(input);
  const kinds = bookingKinds(text, { strongOnly });
  const kind = kinds[0];
  if (!kind) return { items: [], reference: '', issues: [], kind: '', complete: false };
  const tokens = { dates: findDates(text, today), times: findTimes(text) };
  const reference = findReference(text);
  const sender = /(?:^|\n)From:\s*([^\n]+)/i.exec(text)?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
  const firstDate = tokens.dates.find((entry) => !/(?:^|\n)(?:Date|Sent):/i.test(text.slice(Math.max(0, entry.index - 12), entry.index)))?.value || '';
  let item;

  if (kind === 'stay') {
    const checkIn = labelled(text, /\bcheck[- ]?in\b/i, tokens), checkOut = labelled(text, /\bcheck[- ]?out\b/i, tokens);
    const title = field(text, 'Hotel|Property|Accommodation|Hotel name|Resort') || subjectName(text);
    item = { type: 'stay', title, provider: firstNamed(text, STAY_PLATFORMS), from: field(text, 'Address|Location', 160),
      startDate: checkIn?.date || '', startTime: checkIn?.time || '', endDate: checkOut?.date || '', endTime: checkOut?.time || '',
      notes: field(text, 'Room(?: type)?|Room details', 80) };
  } else if (kind === 'car') {
    const pickUp = labelled(text, /\bpick[- ]?up\b(?!\s+location)/i, tokens), dropOff = labelled(text, /\b(?:drop[- ]?off|return)\b(?!\s+location)/i, tokens);
    item = { type: 'car', title: field(text, 'Car(?: class| type)?|Vehicle(?: class| type)?', 60), provider: firstNamed(text, RENTAL_COMPANIES) || sender,
      from: field(text, ['Pick[- ]?up location', 'Pick[- ]?up at', 'Pick[- ]?up'], 120), to: field(text, ['(?:Drop[- ]?off|Return) location', '(?:Drop[- ]?off|Return) at'], 120),
      startDate: pickUp?.date || '', startTime: pickUp?.time || '', endDate: dropOff?.date || '', endTime: dropOff?.time || '' };
    if (!item.to) item.to = item.from;
    if (/\d{1,2}:\d{2}/.test(item.from)) item.from = ''; // the label line held the time, not a place
  } else if (kind === 'liveaboard') {
    // Operators say embark/disembark; booking sites (LiveAboard.com) say departure/return date.
    const on = labelled(text, [/\bembark(?:ation)? date\b/i, /\bembark(?:ation)?\b/i, /\bdeparture date\b/i, /\bstart date\b/i, /\bdeparts?\b(?! from)/i], tokens, 200);
    const off = labelled(text, [/\bdisembark(?:ation)? date\b/i, /\bdisembark(?:ation)?\b/i, /\breturn date\b/i, /\bend date\b/i, /\breturns?\b(?! to)/i], tokens, 200);
    const dives = Number(/\b(?:up to\s+)?(\d{1,2})\s+dives\b/i.exec(text)?.[1]) || 0;
    const startDate = on?.date || firstDate;
    // "6 Days / 5 Nights" gives the return when no return date is printed.
    const nights = Number(/\b(\d{1,2})\s*nights?\b/i.exec(text)?.[1]) || 0;
    item = { type: 'liveaboard', title: field(text, ['Vessel', 'Yacht', 'Boat', 'Ship']) || subjectName(text),
      provider: field(text, ['Name of the Organizer', 'Organizer', 'Operator'], 80) || firstNamed(text, LIVEABOARD_PLATFORMS) || sender,
      from: field(text, ['(?:Embarkation|Departure) port', 'Port of embarkation', 'Embark(?:ation)? at', 'Departure from', 'Departs from'], 120),
      to: field(text, ['(?:Disembarkation|Arrival) port', 'Port of disembarkation', 'Disembark(?:ation)? at', 'Return to', 'Returns to'], 120),
      startDate, startTime: on?.time || '', endDate: off?.date || (startDate && nights ? addDay(startDate, nights) : ''), endTime: off?.time || '', dives,
      notes: [field(text, ['Itinerary', 'Route'], 200), field(text, ['Cabin type', 'Cabin'], 80)].filter(Boolean).join(' · ') };
  } else {
    // Dive bookings, tours, ferries and transfers: one date, a start time, a meeting place.
    const when = labelled(text, /\b(?:date|when|departs?|departure|pick-?up time|start(?:s| time)?|tour date|activity date)\b/i, tokens) || { date: firstDate, time: '' };
    const title = field(text, 'Tour|Activity|Experience|Product|Excursion|Trip') || subjectName(text);
    const dives = kind === 'diving' ? Number(/\b(\d)\s?-?\s?tank\b/i.exec(text)?.[1] || /\b(\d{1,2})\s+dives\b/i.exec(text)?.[1]) || 0 : 0;
    item = { type: kind, title, provider: firstNamed(text, ACTIVITY_PLATFORMS) || sender,
      from: field(text, 'Meeting point|Meeting location|Pick-?up location|Pick-?up point|Departs from|Departure point|Location', 160),
      startDate: when.date || firstDate, startTime: when.time || tokens.times[0]?.value || '', endDate: '', endTime: '', dives };
  }
  item.reference = reference;

  const issues = [];
  // A bundle (hotel + car, say) is read one booking at a time here; let smart import take it whole.
  if (kinds.length > 1) issues.push('This email holds more than one booking.');
  const label = { stay: 'hotel', car: 'rental car', liveaboard: 'liveaboard', diving: 'dive booking', activity: 'activity', ferry: 'ferry', transfer: 'transfer' }[kind];
  if (!item.title && !item.provider) issues.push(`The ${label}’s name wasn’t found.`);
  if (!item.startDate) issues.push(`The ${label}’s date wasn’t found.`);
  if (['stay', 'car', 'liveaboard'].includes(kind) && !item.endDate) issues.push(`The ${label}’s ${kind === 'stay' ? 'check-out' : kind === 'car' ? 'drop-off' : 'disembarkation'} date wasn’t found.`);
  return { items: [item], reference, issues, kind, complete: issues.length === 0 };
}
