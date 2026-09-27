// Fits imported bookings into a trip: flights on one confirmation become one booking; anything the
// trip already has (same confirmation, or the same thing on the same day) is updated rather than
// duplicated; dive days inside an imported liveaboard fold into it; and when bookings fall outside
// the trip's dates the trip can be stretched to cover them. Pure — the review sheet renders `rows`.
import { createBookingId, normalizeSegment } from '../model';

const same = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
const similar = (a, b) => {
  const x = String(a || '').trim().toLowerCase(), y = String(b || '').trim().toLowerCase();
  return Boolean(x) && Boolean(y) && (x === y || x.includes(y) || y.includes(x));
};

function existingMatches(plan, leg) {
  return plan.segments.filter((current) => current.type === leg.type && (
    same(current.reference, leg.reference)
    || (current.startDate === leg.startDate && (similar(current.title, leg.title) || similar(current.provider, leg.provider)))
  ));
}

export function planImport(plan, items) {
  let legs = items.map((item) => normalizeSegment({ ...item, id: undefined }));

  // A liveaboard's itinerary lists its dive days; they belong to the liveaboard, not beside it.
  for (const boat of legs.filter((leg) => leg.type === 'liveaboard' && leg.startDate)) {
    const inside = legs.filter((leg) => leg.type === 'diving' && leg.startDate >= boat.startDate && leg.startDate <= (boat.endDate || boat.startDate));
    if (!boat.dives) boat.dives = Math.min(12, inside.reduce((sum, leg) => sum + (leg.dives || 0), 0));
    legs = legs.filter((leg) => !inside.includes(leg));
  }

  const rows = [];
  // Flights: one row per confirmation, so connections and the return stay together.
  const flightGroups = new Map();
  for (const leg of legs.filter((entry) => entry.type === 'flight')) {
    const key = leg.reference.toUpperCase() || 'flights';
    flightGroups.set(key, [...(flightGroups.get(key) || []), leg]);
  }
  for (const [key, flights] of flightGroups) {
    const planFlights = plan.segments.filter((leg) => leg.type === 'flight');
    const byReference = planFlights.filter((leg) => flights.some((flight) => same(leg.reference, flight.reference)));
    const replaces = byReference.length ? byReference : planFlights.filter((leg) => flights.some((flight) => flight.title === leg.title && flight.startDate === leg.startDate));
    const booking = replaces.find((leg) => leg.booking)?.booking || createBookingId();
    rows.push({ key: `flights-${key}`, kind: 'flights', legs: flights.map((flight) => ({ ...flight, booking })), replaces: replaces.map((leg) => leg.id) });
  }
  legs.filter((leg) => leg.type !== 'flight').forEach((leg, index) => {
    rows.push({ key: `leg-${index}`, kind: 'leg', legs: [leg], replaces: existingMatches(plan, leg).map((match) => match.id) });
  });
  rows.sort((a, b) => (a.legs[0].startDate || '9999').localeCompare(b.legs[0].startDate || '9999'));
  return { rows, extend: tripExtension(plan, rows) };
}

// The trip dates that would cover these rows, when they don't already.
export function tripExtension(plan, rows) {
  const legs = rows.flatMap((row) => row.legs);
  const starts = legs.map((leg) => leg.startDate).filter(Boolean).sort();
  const ends = legs.map((leg) => leg.endDate || leg.startDate).filter(Boolean).sort();
  if (!starts.length) return null;
  const startDate = !plan.startDate || starts[0] < plan.startDate ? starts[0] : plan.startDate;
  const endDate = !plan.endDate || ends.at(-1) > plan.endDate ? ends.at(-1) : plan.endDate;
  return startDate === plan.startDate && endDate === plan.endDate ? null : { startDate, endDate };
}

// The trip after adding the chosen rows: replaced legs removed, new ones in, dates stretched if asked.
export function applyImport(plan, rows, extend = null) {
  const drop = new Set(rows.flatMap((row) => row.replaces));
  const segments = [...plan.segments.filter((leg) => !drop.has(leg.id)), ...rows.flatMap((row) => row.legs)];
  return { ...plan, segments, ...(extend ? { startDate: extend.startDate, endDate: extend.endDate } : {}) };
}
