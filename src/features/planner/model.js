// Dive Planner: dive days (a morning shore dive, a charter) and dive trips (flights, transfers,
// stays, liveaboards, diving days). Plans are plain JSON; `planAlerts` checks one against the
// diver's Gear Locker, certification cards and logbook so problems surface while there is still
// time to fix them. Everything here is pure and date-only safe (no timezone day shifts).
import { packedItems, serviceEntriesForItem, serviceDueForItem, setupProgress } from '../gearChecklist/model';

export const PLAN_KINDS = Object.freeze(['day', 'trip']);
export const PLAN_STATUSES = Object.freeze(['idea', 'planned', 'booked', 'cancelled']);
export const STATUS_LABELS = Object.freeze({ idea: 'Idea', planned: 'Planning', booked: 'Booked', cancelled: 'Cancelled' });

export const SEGMENT_TYPES = Object.freeze({
  flight: { label: 'Flight', from: 'From (airport)', to: 'To (airport)', provider: 'Airline & flight', ends: true },
  transfer: { label: 'Transfer', from: 'Pick-up', to: 'Drop-off', provider: 'Company', ends: true },
  ferry: { label: 'Ferry', from: 'Departs', to: 'Arrives', provider: 'Operator', ends: true },
  stay: { label: 'Stay', from: 'Address', to: '', provider: 'Hotel or resort', ends: true, overnight: true },
  liveaboard: { label: 'Liveaboard', from: 'Embarks', to: 'Disembarks', provider: 'Vessel', ends: true, overnight: true, diving: true },
  diving: { label: 'Dive day', from: 'Meeting point', to: 'Dive sites', provider: 'Dive operator', ends: false, diving: true },
  other: { label: 'Other', from: 'Where', to: '', provider: 'Provider', ends: true },
});

// Certifications an operator may ask for, matched against the cards on the diver's profile.
// Higher levels include the ones below them (a Rescue Diver satisfies "Advanced").
export const CERT_REQUIREMENTS = Object.freeze([
  { key: 'open-water', label: 'Open Water', match: /open water|scuba diver|\bow\b|autonomous|1[- ]?star|\*\s*diver/i },
  { key: 'advanced', label: 'Advanced Open Water', match: /advanced|\baow\b|adventure diver|2[- ]?star/i, includes: ['open-water'] },
  { key: 'rescue', label: 'Rescue Diver', match: /rescue/i, includes: ['advanced', 'open-water'] },
  { key: 'divemaster', label: 'Divemaster or pro', match: /dive ?master|instructor|\bdm\b|assistant instructor/i, includes: ['rescue', 'advanced', 'open-water'] },
  { key: 'nitrox', label: 'Nitrox (EANx)', match: /nitrox|eanx|enriched air/i },
  { key: 'deep', label: 'Deep diver', match: /deep/i },
  { key: 'wreck', label: 'Wreck diver', match: /wreck/i },
  { key: 'drysuit', label: 'Drysuit', match: /dry ?suit/i },
  { key: 'night', label: 'Night diver', match: /night/i },
  { key: 'sidemount', label: 'Sidemount', match: /sidemount/i },
  { key: 'cavern', label: 'Cavern', match: /cavern/i },
  { key: 'cave', label: 'Full cave', match: /\bcave\b/i, includes: ['cavern'] },
  { key: 'rebreather', label: 'Rebreather', match: /rebreather|\bccr\b|\bscr\b/i },
]);

// How long a regulator or BCD service usually takes at a shop, plus shipping slack.
export const SERVICE_LEAD_DAYS = 21;
// DAN: a minimum 12-hour surface interval after a single no-stop dive, 18 hours after repetitive
// dives or multiple days of diving, and substantially longer after decompression dives.
export const NO_FLY_MIN_HOURS = 12;
export const NO_FLY_HOURS = 18;
export const MIN_CONNECTION_MINUTES = 60;
export const PASSPORT_VALIDITY_MONTHS = 6;
export const REFRESHER_MONTHS = 12;

const DAY = 86400000;
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const createPlanId = () => id('plan');
export const createSegmentId = () => id('leg');

// --- dates ------------------------------------------------------------------
export function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}
export const dayString = (date) => (date ? date.toISOString().slice(0, 10) : '');
export const addDays = (value, days) => { const date = parseDay(value); return date ? dayString(new Date(date.getTime() + days * DAY)) : ''; };
export const todayString = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const daysBetween = (from, to) => { const a = parseDay(from), b = parseDay(to); return a && b ? Math.round((b - a) / DAY) : null; };
const validTime = (value) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : '');
const minutesOf = (time) => { const t = validTime(time); return t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null; };
// Minutes since the epoch day of `date` + `time` — for ordering and gaps, never shown as a Date.
const moment = (date, time, fallback) => { const d = parseDay(date); if (!d) return null; const m = minutesOf(time) ?? fallback; return m == null ? null : Math.round((d.getTime() - 12 * 3600000) / 60000) + m; };

const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function formatDay(value, { weekday = false, year = false } = {}) {
  const date = parseDay(value);
  if (!date) return '';
  return `${weekday ? `${weekdays[date.getUTCDay()]}, ` : ''}${monthsShort[date.getUTCMonth()]} ${date.getUTCDate()}${year ? `, ${date.getUTCFullYear()}` : ''}`;
}
export function formatRange(start, end) {
  if (!start) return 'Dates not set';
  if (!end || end === start) return formatDay(start, { weekday: true, year: true });
  const a = parseDay(start), b = parseDay(end);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${formatDay(start, { year: true })} – ${formatDay(end, { year: true })}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${monthsShort[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}, ${a.getUTCFullYear()}`;
  return `${formatDay(start)} – ${formatDay(end)}, ${b.getUTCFullYear()}`;
}
// "Nov 12–14" within a month, "Nov 30–Dec 2" across one; no year (the plan shows it).
export function shortRange(start, end) {
  const a = parseDay(start), b = parseDay(end);
  if (!a || !b || start === end) return formatDay(start);
  return a.getUTCMonth() === b.getUTCMonth() ? `${formatDay(start)}–${b.getUTCDate()}` : `${formatDay(start)}–${formatDay(end)}`;
}
export function formatTime(value) {
  const minutes = minutesOf(value);
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// --- records ----------------------------------------------------------------
export function emptyPlan(kind = 'day', now = new Date()) {
  const today = todayString(now);
  return normalizePlan({ kind, title: '', status: kind === 'day' ? 'booked' : 'planned', startDate: kind === 'day' ? addDays(today, 1) : '', endDate: '' }, now);
}

export function normalizeSegment(value = {}) {
  const type = SEGMENT_TYPES[value.type] ? value.type : 'other';
  const startDate = parseDay(value.startDate) ? value.startDate : '';
  const endDate = SEGMENT_TYPES[type].ends && parseDay(value.endDate) ? value.endDate : '';
  return {
    id: clean(value.id, 80) || createSegmentId(), type, title: clean(value.title, 160),
    startDate, startTime: validTime(value.startTime), endDate, endTime: validTime(value.endTime),
    from: clean(value.from, 160), to: clean(value.to, 160), provider: clean(value.provider, 160), reference: clean(value.reference, 80),
    dives: Math.max(0, Math.min(12, Number.parseInt(value.dives, 10) || 0)), notes: clean(value.notes, 2000),
  };
}

export function normalizePlan(value = {}, now = new Date()) {
  const kind = PLAN_KINDS.includes(value.kind) ? value.kind : 'day';
  const startDate = parseDay(value.startDate) ? value.startDate : '';
  // A dive day is one day; a trip's end can't precede its start.
  const endDate = kind === 'day' ? startDate : (parseDay(value.endDate) && (!startDate || value.endDate >= startDate) ? value.endDate : startDate);
  const requirements = value.requirements || {};
  const operator = value.operator || {};
  const destination = value.destination || {};
  const lat = Number(destination.latitude), lon = Number(destination.longitude);
  return {
    id: clean(value.id, 80) || createPlanId(), kind, status: PLAN_STATUSES.includes(value.status) ? value.status : 'planned',
    title: clean(value.title, 120), startDate, endDate, startTime: kind === 'day' ? validTime(value.startTime) : '',
    // A linked site carries its Ocean Atlas id (or My sites id), position and broader area.
    destination: { name: clean(destination.name, 160), country: clean(destination.country, 80), siteId: clean(destination.siteId, 80),
      area: clean(destination.area, 160), custom: destination.custom === true,
      ...(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : {}) },
    operator: { name: clean(operator.name, 160), phone: clean(operator.phone, 60), email: clean(operator.email, 160), website: clean(operator.website, 300),
      meetingPoint: clean(operator.meetingPoint, 200), confirmation: clean(operator.confirmation, 80) },
    dives: Math.max(0, Math.min(12, Number.parseInt(value.dives, 10) || 0)),
    setupId: clean(value.setupId, 80),
    requirements: {
      certs: [...new Set((Array.isArray(requirements.certs) ? requirements.certs : []).filter((key) => CERT_REQUIREMENTS.some((c) => c.key === key)))],
      minDives: Math.max(0, Number.parseInt(requirements.minDives, 10) || 0),
      recentMonths: Math.max(0, Number.parseInt(requirements.recentMonths, 10) || 0),
      insurance: requirements.insurance === true, medical: requirements.medical === true, waiver: requirements.waiver === true,
    },
    confirmed: { insurance: value.confirmed?.insurance === true, medical: value.confirmed?.medical === true, waiver: value.confirmed?.waiver === true },
    travel: { passportExpiry: parseDay(value.travel?.passportExpiry) ? value.travel.passportExpiry : '' },
    segments: (Array.isArray(value.segments) ? value.segments : []).map(normalizeSegment).sort(bySegmentTime),
    tasks: (Array.isArray(value.tasks) ? value.tasks : []).map((task) => ({ id: clean(task?.id, 80) || id('task'), label: clean(task?.label, 200), done: task?.done === true })).filter((task) => task.label),
    notes: clean(value.notes, 4000),
    createdAt: clean(value.createdAt, 40) || now.toISOString(), updatedAt: now.toISOString(),
  };
}

export function normalizePlannerState(value) {
  const plans = (Array.isArray(value?.plans) ? value.plans : []).map((plan) => normalizePlan(plan, new Date(plan?.updatedAt || Date.now())));
  return { version: 1, plans };
}

function bySegmentTime(a, b) {
  return (a.startDate || '9999').localeCompare(b.startDate || '9999') || (minutesOf(a.startTime) ?? 1440) - (minutesOf(b.startTime) ?? 1440);
}

export const planTitle = (plan) => plan.title || plan.destination.name || (plan.kind === 'trip' ? 'Untitled trip' : 'Dive day');

// Where the plan sits in time: upcoming (with days to go), underway, or past.
export function planPhase(plan, now = new Date()) {
  const today = todayString(now);
  if (!plan.startDate) return { key: 'undated', label: 'Dates not set', days: null };
  const until = daysBetween(today, plan.startDate);
  const end = plan.endDate || plan.startDate;
  if (until > 0) return { key: 'upcoming', label: until === 1 ? 'Tomorrow' : until < 14 ? `In ${until} days` : until < 60 ? `In ${Math.round(until / 7)} weeks` : `In ${Math.round(until / 30.4)} months`, days: until };
  if (today <= end) return { key: 'now', label: plan.kind === 'trip' ? `Day ${1 - until} of ${daysBetween(plan.startDate, end) + 1}` : 'Today', days: 0 };
  return { key: 'past', label: 'Completed', days: until };
}

export function sortPlans(plans, now = new Date()) {
  const today = todayString(now);
  const upcoming = [], past = [];
  for (const plan of plans) {
    if (plan.status === 'cancelled' || (plan.startDate && (plan.endDate || plan.startDate) < today)) past.push(plan); else upcoming.push(plan);
  }
  upcoming.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999') || (minutesOf(a.startTime) ?? 1440) - (minutesOf(b.startTime) ?? 1440));
  past.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  return { upcoming, past };
}

// The itinerary as days: every date from start to end, with the legs on (or spanning) that day.
export function planTimeline(plan) {
  const legs = plan.segments;
  const start = plan.startDate || legs[0]?.startDate;
  const last = [plan.endDate, ...legs.map((leg) => leg.endDate || leg.startDate)].filter(Boolean).sort().at(-1) || start;
  const undated = legs.filter((leg) => !leg.startDate);
  if (!start) return { days: [], undated };
  const days = [];
  for (let date = start, index = 1; date && date <= last && index <= 120; date = addDays(date, 1), index++) {
    const starts = legs.filter((leg) => leg.startDate === date);
    const continuing = legs.filter((leg) => leg.startDate && leg.startDate < date && SEGMENT_TYPES[leg.type].overnight && (leg.endDate || leg.startDate) > date);
    const ends = legs.filter((leg) => leg.endDate === date && leg.startDate !== date && SEGMENT_TYPES[leg.type].overnight);
    days.push({ date, index, starts, continuing, ends });
  }
  return { days, undated };
}

// --- readiness --------------------------------------------------------------
const TONE_RANK = { danger: 3, warning: 2, info: 1, good: 0 };
const certSatisfies = (card, key, seen = new Set()) => {
  if (seen.has(key)) return false;
  seen.add(key);
  const text = `${card?.certificationName || ''} ${card?.certificationCode || ''}`;
  const requirement = CERT_REQUIREMENTS.find((c) => c.key === key);
  if (requirement?.match.test(text)) return true;
  // A higher card counts for the lower levels it includes.
  return CERT_REQUIREMENTS.some((c) => c.includes?.includes(key) && c.match.test(text));
};
export const certLabel = (key) => CERT_REQUIREMENTS.find((c) => c.key === key)?.label || key;
export function cardsFor(certifications, key) { return (certifications || []).filter((card) => certSatisfies(card, key)); }

function lastDiveMoment(plan) {
  if (plan.kind === 'day') return plan.startDate ? moment(plan.startDate, plan.startTime, 8 * 60) + 6 * 60 : null;
  const diving = plan.segments.filter((leg) => SEGMENT_TYPES[leg.type].diving && leg.startDate);
  // Unknown finish times assume diving ends mid-afternoon.
  const ends = diving.map((leg) => moment(leg.endDate || leg.startDate, leg.endTime, 16 * 60));
  return ends.length ? Math.max(...ends) : null;
}

function uncoveredNights(plan) {
  if (plan.kind !== 'trip' || !plan.startDate || !plan.endDate || plan.endDate <= plan.startDate) return [];
  const covered = new Set();
  for (const leg of plan.segments) {
    if (!leg.startDate) continue;
    const overnight = SEGMENT_TYPES[leg.type].overnight || (leg.type === 'flight' && leg.endDate && leg.endDate > leg.startDate);
    if (!overnight) continue;
    for (let night = leg.startDate; night < (leg.endDate || addDays(leg.startDate, 1)); night = addDays(night, 1)) covered.add(night);
  }
  // The last night away is only uncovered when the trip doesn't fly home overnight.
  const gaps = [];
  for (let night = plan.startDate; night < plan.endDate; night = addDays(night, 1)) if (!covered.has(night)) gaps.push(night);
  const ranges = [];
  for (const night of gaps) { const last = ranges.at(-1); if (last && addDays(last[1], 1) === night) last[1] = night; else ranges.push([night, night]); }
  return ranges;
}

const dateOf = (date) => dayString(date instanceof Date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)) : null);

// Everything worth knowing before this plan, most serious first. `context` is
// { gear: { items, setups }, certifications: array | null (signed out), dives: logbook rows, now }.
export function planAlerts(plan, context = {}) {
  const now = context.now || new Date();
  const today = todayString(now);
  const alerts = [];
  const add = (tone, key, title, detail, action = null) => alerts.push({ tone, key, title, detail, action });
  if (plan.status === 'cancelled') return [];
  const end = plan.endDate || plan.startDate;
  if (end && end < today) return [];
  const daysOut = plan.startDate ? daysBetween(today, plan.startDate) : null;
  const items = context.gear?.items || [];
  const setup = (context.gear?.setups || []).find((entry) => entry.id === plan.setupId) || null;

  // Gear: service falling due before or during the plan, or anything not fit to dive.
  if (!setup) {
    if (items.length) add('info', 'setup', 'Choose the gear you’re bringing', 'Pick a setup from your Gear Locker to check its service dates and build the packing list.', 'setup');
  } else {
    const gear = packedItems(setup, items);
    for (const item of gear) {
      if (item.condition === 'Out of service') add('danger', `gear-out-${item.id}`, `${item.name} is out of service`, 'It’s in the setup for this plan. Repair or replace it, or switch setups.', 'gear');
      else if (item.condition === 'Needs attention') add('warning', `gear-attn-${item.id}`, `${item.name} needs attention`, 'Marked as needing attention in your Gear Locker. Sort it out before you dive.', 'gear');
      if (['Out of service', 'Retired'].includes(item.condition)) continue;
      for (const entry of serviceEntriesForItem(item)) {
        const due = serviceDueForItem(entry.record);
        if (!due || !end) continue;
        const dueDay = dateOf(due.date);
        const name = entry.parentId ? `${item.name} · ${entry.name}` : item.name;
        const what = due.label === 'Service' ? 'service' : due.label.toLowerCase();
        if (dueDay < today) add('danger', `svc-${entry.id}`, `${name}: ${what} overdue`, `It was due ${formatDay(dueDay, { year: true })}. Get it serviced before ${plan.kind === 'trip' ? 'you travel' : 'this dive'}.`, 'gear');
        else if (dueDay <= end) {
          const bookBy = addDays(plan.startDate || dueDay, -SERVICE_LEAD_DAYS);
          add('warning', `svc-${entry.id}`, `${name}: ${what} due ${dueDay < plan.startDate ? 'before' : 'during'} this ${plan.kind === 'trip' ? 'trip' : 'dive'}`,
            `Due ${formatDay(dueDay, { year: true })}. ${bookBy > today ? `Book it by ${formatDay(bookBy)} to allow about ${Math.round(SERVICE_LEAD_DAYS / 7)} weeks at the shop.` : 'Book it now — shops often need a couple of weeks.'}`, 'gear');
        } else if (daysBetween(end, dueDay) <= 30) add('info', `svc-${entry.id}`, `${name}: ${what} due soon after`, `Due ${formatDay(dueDay, { year: true })}, shortly after you’re back. Servicing it beforehand saves a second trip to the shop.`, 'gear');
      }
    }
    const progress = setupProgress(setup, items);
    if (!gear.length) add('info', 'setup-empty', `${setup.name} has no gear yet`, 'Add equipment to this setup in your Gear Locker to track packing.', 'setup');
    else if (daysOut != null && daysOut <= (plan.kind === 'trip' ? 7 : 1) && progress.total && progress.checked < progress.total) {
      add(daysOut <= 1 ? 'warning' : 'info', 'packing', `${progress.checked} of ${progress.total} items packed`, `Work through the ${setup.name} checklist so nothing gets left behind.`, 'packing');
    }
  }

  // Certification cards the operator asked for.
  const required = plan.requirements.certs;
  if (required.length && context.certifications == null) add('info', 'certs-signin', 'Sign in to check your cards', `This operator asks for ${required.map(certLabel).join(', ')}. Sign in so the planner can match your certifications.`, 'account');
  else if (context.certifications) {
    for (const key of required) {
      const cards = cardsFor(context.certifications, key);
      if (!cards.length) add('warning', `cert-${key}`, `${certLabel(key)} card not on your profile`, 'The operator requires it. Add the card to your profile, or plan the course before you go.', 'account');
      else if (end && cards.every((card) => card.expiresOn && !card.doesNotExpire && card.expiresOn < end)) add('warning', `cert-exp-${key}`, `${certLabel(key)} card expires first`, `It expires ${formatDay(cards[0].expiresOn, { year: true })}, before this plan ends. Renew it before you go.`, 'account');
    }
    for (const card of context.certifications) {
      if (card.expiresOn && !card.doesNotExpire && end && card.expiresOn >= today && card.expiresOn <= end && !required.some((key) => certSatisfies(card, key))) {
        add('info', `card-exp-${card.id || card.certificationName}`, `${card.certificationName} expires ${formatDay(card.expiresOn)}`, 'Before this plan ends — worth renewing first.', 'account');
      }
    }
  }

  // Experience: operator minimums and time out of the water.
  const dives = (context.dives || []).filter((row) => row && !row.deletedAt);
  const lastLogged = dives.reduce((latest, row) => (row.startTime && (!latest || row.startTime > latest) ? row.startTime : latest), '');
  if (plan.requirements.minDives && dives.length < plan.requirements.minDives) {
    add('warning', 'min-dives', `Operator asks for ${plan.requirements.minDives} logged dives`, `Your logbook has ${dives.length}. Bring older logs as proof, or check with the operator.`, 'logbook');
  }
  if (plan.startDate && lastLogged) {
    const monthsOut = daysBetween(lastLogged.slice(0, 10), plan.startDate) / 30.4;
    if (plan.requirements.recentMonths && monthsOut > plan.requirements.recentMonths) add('warning', 'recent', `Operator wants a dive in the last ${plan.requirements.recentMonths} months`, `Your last logged dive was ${formatDay(lastLogged.slice(0, 10), { year: true })}. Ask about a check-out dive or book a refresher.`, 'logbook');
    else if (monthsOut > REFRESHER_MONTHS) add('warning', 'refresher', 'Consider a refresher first', `Your last logged dive was ${formatDay(lastLogged.slice(0, 10), { year: true })} — over a year before this plan. A scuba review rebuilds skills and confidence.`, 'logbook');
  }

  // Paperwork the operator asked for, until the diver confirms it.
  const papers = [['insurance', 'Dive accident insurance', 'Have your policy number and emergency line with you.'], ['medical', 'Medical statement', 'Some answers need a physician’s sign-off — allow time for an appointment.'], ['waiver', 'Operator forms and waiver', 'Many operators take these online before you arrive.']];
  for (const [key, label, detail] of papers) {
    if (plan.requirements[key] && !plan.confirmed[key]) add(daysOut != null && daysOut <= 14 ? 'warning' : 'info', `paper-${key}`, `${label} not confirmed`, detail, 'requirements');
  }

  if (plan.kind === 'trip') {
    const flights = plan.segments.filter((leg) => leg.type === 'flight' && leg.startDate);
    // Flying after diving.
    const lastDive = lastDiveMoment(plan);
    if (lastDive != null) {
      for (const flight of flights) {
        const departs = moment(flight.startDate, flight.startTime, 12 * 60);
        if (departs == null || departs < lastDive - 12 * 60) continue;
        const hours = (departs - lastDive) / 60;
        const approximate = !flight.startTime || plan.segments.some((leg) => SEGMENT_TYPES[leg.type].diving && !leg.endTime);
        if (hours < NO_FLY_HOURS) add(hours < NO_FLY_MIN_HOURS ? 'danger' : 'warning', `nofly-${flight.id}`, `Only ~${Math.max(0, Math.round(hours))} hours between diving and your flight`,
          `DAN recommends at least ${NO_FLY_HOURS} hours after multiple dives or days of diving (${NO_FLY_MIN_HOURS} after a single no-stop dive). ${approximate ? 'Add dive and flight times for an exact figure. ' : ''}Plan a dive-free last day.`, 'timeline');
        break;
      }
    }
    // Connections that are too tight or overlap.
    for (let i = 1; i < flights.length; i++) {
      const previous = flights[i - 1], next = flights[i];
      const arrives = moment(previous.endDate || previous.startDate, previous.endTime, null);
      const departs = moment(next.startDate, next.startTime, null);
      if (arrives == null || departs == null || departs - arrives > 24 * 60) continue;
      const gap = departs - arrives;
      if (gap < 0) add('danger', `overlap-${next.id}`, 'Flights overlap', `${previous.title || previous.provider || 'A flight'} lands after ${next.title || next.provider || 'the next flight'} departs. Check the times.`, 'timeline');
      else if (gap < MIN_CONNECTION_MINUTES) add('warning', `connect-${next.id}`, `Tight ${gap}-minute connection${next.from ? ` in ${next.from}` : ''}`, 'Less than an hour to change planes — dive bags are often the casualty. Consider a longer layover.', 'timeline');
    }
    // Legs that end before they start.
    for (const leg of plan.segments) {
      const a = moment(leg.startDate, leg.startTime, 0), b = moment(leg.endDate, leg.endTime, 23 * 60);
      if (a != null && b != null && leg.endDate && b < a) add('warning', `order-${leg.id}`, `${leg.title || SEGMENT_TYPES[leg.type].label} ends before it starts`, 'Check its dates and times.', 'timeline');
    }
    // Nights with nowhere to sleep.
    for (const [first, last] of uncoveredNights(plan)) {
      add(daysOut != null && daysOut <= 21 ? 'warning' : 'info', `nights-${first}`, `No stay booked for ${first === last ? `the night of ${formatDay(first)}` : shortRange(first, addDays(last, 1))}`, 'Add a hotel or liveaboard, or an overnight flight, to cover it.', 'timeline');
    }
    // Passport validity: many countries require six months beyond the date you leave.
    if (flights.length) {
      if (!plan.travel.passportExpiry) add('info', 'passport-missing', 'Add your passport expiry', `Many countries require it to be valid ${PASSPORT_VALIDITY_MONTHS} months beyond your return.`, 'travel');
      else if (end && plan.travel.passportExpiry < end) add('danger', 'passport-expired', 'Passport expires before you’re home', `It expires ${formatDay(plan.travel.passportExpiry, { year: true })}. Renew it before booking anything else.`, 'travel');
      else if (end && plan.travel.passportExpiry < addDays(end, Math.round(PASSPORT_VALIDITY_MONTHS * 30.4))) add('warning', 'passport-validity', `Passport valid less than ${PASSPORT_VALIDITY_MONTHS} months after the trip`, `It expires ${formatDay(plan.travel.passportExpiry, { year: true })}. Some countries will refuse boarding — check the entry rules or renew.`, 'travel');
    }
    if (!plan.segments.some((leg) => SEGMENT_TYPES[leg.type].diving)) add('info', 'no-diving', 'No diving on the itinerary yet', 'Add dive days or a liveaboard so the planner can check surface intervals before your flight home.', 'timeline');
  }

  const open = plan.tasks.filter((task) => !task.done);
  if (open.length && daysOut != null && daysOut <= 7) add('info', 'tasks', `${open.length} to-do${open.length === 1 ? '' : 's'} left`, open.slice(0, 3).map((task) => task.label).join(' · '), 'tasks');

  return alerts.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
}

export function readinessSummary(alerts) {
  const danger = alerts.filter((a) => a.tone === 'danger').length, warning = alerts.filter((a) => a.tone === 'warning').length;
  if (danger) return { tone: 'danger', label: `${danger} to fix`, headline: alerts[0].title };
  if (warning) return { tone: 'warning', label: `${warning} to check`, headline: alerts[0].title };
  if (alerts.length) return { tone: 'info', label: 'On track', headline: alerts[0].title };
  return { tone: 'good', label: 'Ready', headline: 'Everything checks out.' };
}
