const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const P = loadSourceModule(path.join(root, 'features/planner/model.js'), root);
const SHARE = loadSourceModule(path.join(root, 'features/planner/sharePlanPdf.js'), root);

const now = new Date(2026, 8, 25, 9, 0); // Sep 25, 2026, 9am local
const keys = (alerts) => alerts.map((a) => a.key);
const find = (alerts, prefix) => alerts.find((a) => a.key.startsWith(prefix));

// Records normalise safely.
const empty = P.emptyPlan('day', now);
assert.equal(empty.kind, 'day');
assert.equal(empty.startDate, '2026-09-26', 'A new dive day defaults to tomorrow.');
assert.equal(P.normalizePlan({ kind: 'trip', startDate: '2026-10-10', endDate: '2026-10-01' }, now).endDate, '2026-10-10', 'A trip cannot end before it starts.');
assert.equal(P.normalizePlan({ kind: 'day', startDate: '2026-10-10', endDate: '2026-10-12' }, now).endDate, '2026-10-10', 'A dive day is one day.');
assert.equal(P.normalizePlan({ startTime: '25:00' }, now).startTime, '');
assert.deepEqual(P.normalizePlan({ requirements: { certs: ['nitrox', 'bogus', 'nitrox'] } }, now).requirements.certs, ['nitrox']);
assert.equal(P.normalizeSegment({ type: 'rocket' }).type, 'other');
assert.equal(P.normalizeSegment({ type: 'drive', from: 'Home', to: 'ORD' }).type, 'drive', 'A drive to the airport is a first-class itinerary item.');
assert.equal(P.normalizeSegment({ type: 'diving', endDate: '2026-10-11' }).endDate, '', 'A dive day leg has no end date.');
assert.equal(P.normalizePlannerState(null).plans.length, 0);

// Dates and phases.
assert.equal(P.formatRange('2026-10-10', '2026-10-17'), 'Oct 10–17, 2026');
assert.equal(P.formatRange('2026-12-28', '2027-01-04'), 'Dec 28, 2026 – Jan 4, 2027');
assert.equal(P.formatTime('07:30'), '7:30 AM');
assert.equal(P.formatTime('13:05'), '1:05 PM');
assert.equal(P.planPhase(P.normalizePlan({ startDate: '2026-09-26' }, now), now).label, 'Tomorrow');
assert.equal(P.planPhase(P.normalizePlan({ kind: 'trip', startDate: '2026-09-24', endDate: '2026-09-28' }, now), now).label, 'Day 2 of 5');
assert.equal(P.planPhase(P.normalizePlan({ startDate: '2026-09-01' }, now), now).key, 'past');
const sorted = P.sortPlans([
  P.normalizePlan({ id: 'b', startDate: '2026-11-01' }, now), P.normalizePlan({ id: 'a', startDate: '2026-10-01' }, now),
  P.normalizePlan({ id: 'old', startDate: '2026-08-01' }, now), P.normalizePlan({ id: 'x', startDate: '2026-10-05', status: 'cancelled' }, now),
], now);
assert.deepEqual(sorted.upcoming.map((p) => p.id), ['a', 'b']);
assert.deepEqual(sorted.past.map((p) => p.id), ['x', 'old']);

// Gear: a regulator due before the trip, an overdue BCD, and a computer due just after.
const gear = {
  items: [
    { id: 'reg', name: 'Apeks XTX50', category: 'Regulator', condition: 'Ready', nextServiceDate: '2026-10-20', components: [] },
    { id: 'bcd', name: 'Zeagle Ranger', category: 'BCD', condition: 'Ready', nextServiceDate: '2026-09-01', components: [] },
    { id: 'comp', name: 'Shearwater Peregrine', category: 'Dive computer', condition: 'Ready', nextServiceDate: '2026-11-25', components: [] },
    { id: 'fins', name: 'Fins', category: 'Fins', condition: 'Out of service', components: [] },
  ],
  setups: [{ id: 'travel', name: 'Travel kit', itemIds: ['reg', 'bcd', 'comp', 'fins'], checkedIds: ['reg'], accessoryChoices: {} }],
};
const trip = P.normalizePlan({
  kind: 'trip', title: 'Cozumel', startDate: '2026-11-07', endDate: '2026-11-14', setupId: 'travel', status: 'booked',
  requirements: { certs: ['advanced', 'nitrox'], minDives: 50, insurance: true },
  travel: { passportExpiry: '2027-03-01' },
  segments: [
    { type: 'flight', title: 'ORD → MIA', startDate: '2026-11-07', startTime: '06:00', endDate: '2026-11-07', endTime: '10:10', from: 'ORD', to: 'MIA' },
    { type: 'flight', title: 'MIA → CZM', startDate: '2026-11-07', startTime: '10:50', endDate: '2026-11-07', endTime: '12:00', from: 'MIA', to: 'CZM' },
    { type: 'stay', title: 'Casa del Mar', startDate: '2026-11-07', endDate: '2026-11-12' },
    { type: 'diving', title: 'Palancar', startDate: '2026-11-08', dives: 2 },
    { type: 'diving', title: 'Santa Rosa', startDate: '2026-11-13', endTime: '15:00', dives: 2 },
    { type: 'flight', title: 'CZM → ORD', startDate: '2026-11-14', startTime: '07:00', from: 'CZM', to: 'ORD' },
  ],
}, now);
const certs = [{ id: 'c1', agency: 'PADI', certificationName: 'Rescue Diver' }];
const dives = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, startTime: '2026-06-01T10:00:00Z' }));
const alerts = P.planAlerts(trip, { gear, certifications: certs, dives, now });

assert.equal(find(alerts, 'svc-bcd').tone, 'danger', 'Overdue service is a problem to fix.');
assert.equal(find(alerts, 'svc-reg').tone, 'warning', 'Service due before the trip is flagged.');
assert.match(find(alerts, 'svc-reg').detail, /Book it by Oct 17/, 'With a three-week lead time.');
assert.equal(find(alerts, 'svc-comp').tone, 'info', 'Due soon after the trip is a heads-up.');
assert.ok(keys(alerts).includes('gear-out-fins'), 'Out-of-service gear in the setup is flagged.');
assert.ok(!find(alerts, 'svc-fins'), 'No service nag for gear that is already out of service.');
assert.ok(!find(alerts, 'cert-advanced'), 'A Rescue card satisfies an Advanced requirement.');
assert.equal(find(alerts, 'cert-nitrox').tone, 'warning', 'A missing Nitrox card is flagged.');
assert.ok(find(alerts, 'min-dives'), '30 logged dives is short of 50.');
assert.equal(find(alerts, 'nofly-').tone, 'warning', '16 hours from 3pm to 7am is under 18.');
assert.match(find(alerts, 'nofly-').title, /~16 hours/);
assert.equal(find(alerts, 'connect-').tone, 'warning', 'A 40-minute connection is tight.');
assert.match(find(alerts, 'connect-').title, /40-minute connection in MIA/);
assert.ok(find(alerts, 'nights-2026-11-12'), 'The last two nights have no stay.');
assert.match(find(alerts, 'nights-2026-11-12').title, /Nov 12–14/);
assert.equal(find(alerts, 'passport-validity').tone, 'warning', 'Passport valid under six months after return.');
assert.ok(find(alerts, 'paper-insurance'), 'Insurance asked for and not confirmed.');
assert.ok(!find(alerts, 'refresher'), 'A dive in June is recent enough.');
assert.ok(alerts.every((a, i) => i === 0 || ({ danger: 3, warning: 2, info: 1, good: 0 })[alerts[i - 1].tone] >= ({ danger: 3, warning: 2, info: 1, good: 0 })[a.tone]), 'Most serious first.');
assert.equal(P.readinessSummary(alerts).tone, 'danger');

// Fixing things clears them.
const fixed = P.normalizePlan({ ...trip, confirmed: { insurance: true }, travel: { passportExpiry: '2030-01-01' },
  segments: [...trip.segments.filter((leg) => leg.title !== 'CZM → ORD' && leg.title !== 'Casa del Mar'),
    { type: 'stay', title: 'Casa del Mar', startDate: '2026-11-07', endDate: '2026-11-14' },
    { type: 'flight', title: 'CZM → ORD', startDate: '2026-11-14', startTime: '13:00', from: 'CZM', to: 'ORD' }] }, now);
const after = P.planAlerts(fixed, { gear, certifications: certs, dives, now });
for (const gone of ['nofly-', 'nights-', 'passport-', 'paper-insurance']) assert.ok(!find(after, gone), `${gone} resolved`);

// Signed out, no setup, long break, operator recency rule.
const day = P.normalizePlan({ kind: 'day', startDate: '2026-10-03', startTime: '07:30', requirements: { certs: ['open-water'], recentMonths: 6 } }, now);
const dayAlerts = P.planAlerts(day, { gear, certifications: null, dives: [{ startTime: '2025-01-10T10:00:00Z' }], now });
assert.ok(find(dayAlerts, 'setup'), 'Prompt to choose a setup when the locker has gear.');
assert.ok(find(dayAlerts, 'certs-signin'), 'Prompt to sign in to check cards.');
assert.ok(find(dayAlerts, 'recent'), 'Operator recency rule flagged.');
assert.ok(!find(dayAlerts, 'nofly-') && !find(dayAlerts, 'nights-'), 'Travel checks only apply to trips.');
assert.deepEqual(P.planAlerts({ ...day, status: 'cancelled' }, { gear, now }), []);
assert.deepEqual(P.planAlerts(P.normalizePlan({ startDate: '2026-09-01' }, now), { gear, now }), [], 'Past plans have no alerts.');

// Packing reminder the week of the trip.
const soon = P.normalizePlan({ ...fixed, startDate: '2026-09-29', endDate: '2026-10-03', segments: [] }, now);
assert.ok(find(P.planAlerts(soon, { gear, certifications: certs, dives, now }), 'packing'), 'Unpacked items flagged in the final week.');

// Cards: expiring required cards and higher levels.
assert.equal(P.cardsFor([{ certificationName: 'Master Scuba Diver Trainer / Instructor' }], 'open-water').length, 1);
const expiring = P.planAlerts(P.normalizePlan({ ...day, requirements: { certs: ['nitrox'] } }, now), { gear: { items: [], setups: [] }, certifications: [{ certificationName: 'Enriched Air Nitrox', expiresOn: '2026-10-01' }], dives: [], now });
assert.ok(find(expiring, 'cert-exp-nitrox'), 'A required card that expires before the dive is flagged.');

// Timeline groups legs by day, carrying overnight stays.
const timeline = P.planTimeline(trip);
assert.equal(timeline.days.length, 8);
assert.equal(timeline.days[0].starts.length, 3);
assert.ok(timeline.days[2].continuing.some((leg) => leg.type === 'stay'), 'A multi-night stay continues through the days.');
assert.ok(timeline.days[5].ends.some((leg) => leg.type === 'stay'), 'And shows checkout on its last day.');

// Day-of mode surfaces the live schedule instead of only the pre-trip summary.
const travelMorning = P.currentTripDay(trip, new Date(2026, 10, 7, 7, 0));
assert.equal(travelMorning.label, 'Travel day');
assert.equal(travelMorning.index, 1);
assert.equal(travelMorning.current.leg.title, 'ORD → MIA', 'A timed leg underway is identified.');
assert.equal(travelMorning.next.leg.title, 'MIA → CZM', 'The next departure is ready for the day-of card.');
const diveMorning = P.currentTripDay(trip, new Date(2026, 10, 8, 7, 0));
assert.equal(diveMorning.label, 'Dive day');
assert.equal(diveMorning.next.leg.title, 'Palancar', 'An untimed dive still appears as next up.');
assert.equal(P.currentTripDay(trip, new Date(2026, 10, 20, 7, 0)), null, 'Day-of mode appears only during the trip.');
assert.equal(P.suggestedSegmentType({ index: 1, date: '2026-11-07', starts: [] }, '2026-11-14'), 'other', 'An empty first day opens the general itinerary editor, not flights.');
assert.equal(P.suggestedSegmentType({ index: 8, date: '2026-11-14', starts: [] }, '2026-11-14'), 'flight');
assert.equal(P.suggestedSegmentType({ index: 3, date: '2026-11-09', starts: [] }, '2026-11-14'), 'diving');

// Shared PDFs are complete travel documents but omit private readiness data.
const sharedPlan = P.normalizePlan({ ...trip, setupId: 'PRIVATE-SETUP-491', title: 'Cozumel & Friends <2026>', notes: 'Meet by the dock & bring cash.',
  operator: { name: 'Blue Water <Dive>', phone: '+1 555 0100', email: 'crew@example.com', confirmation: 'SHOP-42' },
  tasks: [{ label: 'Confirm tanks', done: true }, { label: 'Pack reef-safe sunscreen', done: false }],
  segments: trip.segments.map((leg, index) => index === 0 ? { ...leg, reference: 'ABC<123>' } : leg),
}, now);
const sharedHtml = SHARE.buildPlanShareHtml(sharedPlan, { generatedAt: new Date(2026, 9, 13) });
assert.match(sharedHtml, /^<!DOCTYPE html>/);
assert.match(sharedHtml, /DIVE TRIP OPERATIONS BRIEF/, 'The PDF uses the branded operations-brief layout.');
assert.match(sharedHtml, /data:image\/png;base64,/, 'The DMZ logo is embedded so Expo Print can render it on iOS.');
assert.match(sharedHtml, /DIVE · TRAVEL · EXPLORE/, 'The cover uses the complete DMZ brand lockup.');
assert.match(sharedHtml, /-webkit-print-color-adjust: exact/, 'Expo Print is told to preserve the DMZ colors.');
assert.match(sharedHtml, /Cozumel &amp; Friends &lt;2026&gt;/, 'User text is HTML escaped.');
assert.match(sharedHtml, /ABC&lt;123&gt;/, 'Booking references are included safely.');
assert.match(sharedHtml, /DAY 1/);
assert.match(sharedHtml, /Shared checklist · 1\/2 complete/);
assert.ok(!sharedHtml.includes(sharedPlan.travel.passportExpiry), 'Passport details never enter a shared plan.');
assert.ok(!sharedHtml.includes(sharedPlan.setupId), 'Gear setup identity never enters a shared plan.');
assert.equal(SHARE.planPdfFileName(sharedPlan), 'dmz-scuba-cozumel-friends-2026.pdf');

// Itinerary rows carry an at-a-glance panel: confirmation, a callable phone, and when a stay ends.
assert.equal(P.normalizeSegment({ type: 'stay', phone: ' +1 561 842 3121 ' }).phone, '+1 561 842 3121', 'Itinerary items keep a phone number.');
const glanceHtml = SHARE.buildPlanShareHtml(P.normalizePlan({ kind: 'trip', title: 'Glance', startDate: '2026-09-30', endDate: '2026-10-03', operator: { name: 'Jupiter Dive Center', phone: '+1 (561) 745-7807' }, segments: [
  { type: 'stay', title: 'Super 8', startDate: '2026-09-30', startTime: '15:00', endDate: '2026-10-03', endTime: '11:00', reference: '3VD53943CGT3', phone: '+1 561 842 3121' },
  { type: 'car', title: 'Jetta', startDate: '2026-09-30', endDate: '2026-10-03', from: '2005 Belvedere Rd', to: '2005 Belvedere Rd' },
  { type: 'diving', title: 'Breakers Reef', startDate: '2026-10-01', provider: 'Jupiter Dive Center', dives: 2 },
] }, now));
assert.match(glanceHtml, /href="tel:\+15618423121"/, 'Item phone numbers are tappable in the shared PDF.');
assert.match(glanceHtml, /Night 2 of 3/, 'Ongoing stays show which night it is.');
assert.match(glanceHtml, /Sat, Oct 3 · 11:00 AM/, 'Check-in rows show when the stay ends.');
assert.match(glanceHtml, /href="tel:\+15617457807"/, "Dive days with the plan's operator borrow its phone.");
assert.match(glanceHtml, /Pick-up &amp; return 2005 Belvedere Rd/, 'A same-counter rental shows its address once.');

// The phone layout is its own screen-shaped PDF; long trips paginate instead of clipping.
const phonePlan = P.normalizePlan({ ...sharedPlan, segments: [...sharedPlan.segments, ...Array.from({ length: 14 }, (_, index) => ({ type: 'diving', title: `Reef ${index + 1}`, startDate: '2026-11-09', startTime: '08:00', reference: `R${index}`, phone: '+1 555 0100', notes: 'Long briefing notes that wrap over a couple of lines on a phone screen.' }))] }, now);
const phoneHtml = SHARE.buildPlanShareHtml(phonePlan, { generatedAt: new Date(2026, 9, 13), format: 'phone' });
assert.match(phoneHtml, /@page \{ size: 390pt 844pt/, 'The phone PDF uses phone-shaped pages.');
assert.match(phoneHtml, /\.pdf-page \{[^}]*height: 1125px/, 'Phone pages stay within the paper so no blank pages are added.');
assert.match(phoneHtml, /DAY \d+ · CONTINUED/, 'A busy day continues onto the next phone page.');
assert.match(phoneHtml, /<script>\(function \(\) \{/, 'Phone pages are laid out by measuring in the renderer, not by estimates.');
const stayPhone = SHARE.buildPlanShareHtml(P.normalizePlan({ kind: 'trip', title: 'Stay', startDate: '2026-09-30', endDate: '2026-10-03', segments: [
  { type: 'stay', title: 'Super 8', startDate: '2026-09-30', startTime: '15:00', endDate: '2026-10-03', endTime: '11:00', reference: 'STAY-REF-1' },
] }, now), { format: 'phone' });
const middleDay = stayPhone.split('DAY 2 · CONTINUED')[1].split('</section>')[0];
assert.match(middleDay, /class="ongoing-tag">Staying<\/span><span class="ongoing-name">Super 8<\/span><span class="ongoing-when">Night 2 of 3<\/span>/, 'A middle day shows the stay as one slim line.');
assert.ok(!middleDay.includes('STAY-REF-1'), 'Middle days do not repeat the confirmation; the check-in row and cover have it.');
assert.doesNotMatch(phoneHtml, /row-ongoing/, 'Days in the middle of a stay no longer repeat a full row.');
assert.match(phoneHtml, /Cozumel &amp; Friends &lt;2026&gt;/, 'Phone layout escapes user text too.');
assert.ok(!phoneHtml.includes(sharedPlan.setupId), 'The phone layout keeps gear setups private.');
assert.match(glanceHtml, /maps\.apple\.com\/\?daddr=2005%20Belvedere%20Rd/, 'Addresses link to Apple Maps directions.');
assert.match(glanceHtml, /google\.com\/maps\/dir\/\?api=1&amp;destination=2005%20Belvedere%20Rd/, 'Addresses link to Google Maps directions.');
const glancePhone = SHARE.buildPlanShareHtml(P.normalizePlan({ kind: 'trip', title: 'Glance', startDate: '2026-09-30', endDate: '2026-10-03', segments: [
  { type: 'flight', title: 'AA 1831', startDate: '2026-09-30', from: 'ORD', to: 'DJT', reference: 'QAUSMA' },
  { type: 'flight', title: 'AA 1029', startDate: '2026-10-03', from: 'DJT', to: 'ORD', reference: 'qausma' },
  { type: 'diving', title: 'Shore dive', startDate: '2026-10-01', from: 'Resort dive pier' },
] }, now), { format: 'phone', insurance: [{ type: 'dive', provider: 'DAN', emergencyPhone: '+1-919-684-9111' }] });
assert.match(glancePhone, /<strong>AA 1831 · AA 1029<\/strong>/, 'Flights on one booking share a line in the cover bookings list.');
assert.match(glancePhone, /daddr=ORD%20airport/, 'Flights link directions to the departure airport.');
assert.ok(!glancePhone.includes('Resort%20dive%20pier'), 'Vague places get no directions link.');
assert.match(glancePhone, /href="tel:\+19196849111"/, 'Insurance emergency numbers are tappable.');
assert.equal(SHARE.planPdfFileName(sharedPlan, 'phone'), 'dmz-scuba-cozumel-friends-2026-phone.pdf');
assert.deepEqual(SHARE.SHARE_FORMATS.document, { width: 612, height: 792 });
const sharedDayHtml = SHARE.buildPlanShareHtml(P.normalizePlan({ kind: 'day', title: 'Saturday charter', startDate: '2026-11-08', startTime: '07:30', segments: [
  { type: 'diving', title: 'Two-tank morning charter', startDate: '2026-11-08', startTime: '07:30', dives: 2 },
] }, now));
assert.match(sharedDayHtml, /DIVE DAY OPERATIONS BRIEF/, 'Dive-day shares use the same DMZ document system.');
assert.match(sharedDayHtml, /DAY 1/, 'A shared dive day includes its actual schedule, not only the cover.');
assert.match(sharedDayHtml, /Two-tank morning charter/, 'Dive-day itinerary details are present.');
const insuredHtml = SHARE.buildPlanShareHtml(sharedPlan, { generatedAt: new Date(2026, 9, 13), insurance: [{
  id: 'dan', type: 'dive', provider: 'DAN', memberNumber: 'DAN-42', startDate: '2025-01-01', endDate: '2025-12-31',
  autoRenews: true, renewalMonths: 12, emergencyPhone: '+1 919 684 9111', documents: [{ uri: 'file:///private/policy.pdf' }],
}] });
assert.match(insuredHtml, /Insurance for this trip/, 'The shared PDF identifies trip insurance.');
assert.match(insuredHtml, /DAN-42/, 'Useful policy identification is shared.');
assert.match(insuredHtml, /Yearly auto-renewal · effective through Dec 31, 2026/, 'The PDF prints the effective renewed term covering the trip, not the stale entered date.');
assert.match(insuredHtml, /Emergency assistance/, 'The insurer emergency number is easy to find.');
assert.ok(!insuredHtml.includes('file:///private/policy.pdf'), 'Private document locations never enter the shared PDF.');
const leanTrip = P.normalizePlan({ kind: 'trip', title: 'Four-day recon', startDate: '2026-09-30', endDate: '2026-10-03', segments: [
  ...Array.from({ length: 4 }, (_, i) => ({ type: 'activity', title: `Arrival item ${i + 1}`, startDate: '2026-09-30' })),
  ...Array.from({ length: 3 }, (_, i) => ({ type: 'activity', title: `Day two item ${i + 1}`, startDate: '2026-10-01' })),
  ...Array.from({ length: 2 }, (_, i) => ({ type: 'activity', title: `Day three item ${i + 1}`, startDate: '2026-10-02' })),
  ...Array.from({ length: 3 }, (_, i) => ({ type: 'activity', title: `Departure item ${i + 1}`, startDate: '2026-10-03' })),
] }, now);
const leanHtml = SHARE.buildPlanShareHtml(leanTrip, { insurance: [{ type: 'dive', provider: 'DAN', memberNumber: '42', endDate: '2026-12-31' }] });
// Pages are laid out in the renderer (see PAGINATE_SCRIPT); page counts are checked in previews.
assert.match(leanHtml, /<script>\(function \(\) \{/, 'The document is paged by measuring in the renderer, not by estimates.');
assert.ok(!leanHtml.includes('Ready when you need it'), 'Insurance alone does not open a sparse reference section.');
assert.match(leanHtml, /Insurance for this trip/, 'Cover insurance remains easy to find.');
const consolidatedTrip = P.normalizePlan({ kind: 'trip', title: 'Compact recon', startDate: '2026-09-30', endDate: '2026-10-03', operator: { name: 'Jupiter Dive Center', phone: '555-0100' }, segments: [
  { type: 'flight', title: 'Outbound', startDate: '2026-09-30', startTime: '09:00' },
  { type: 'car', title: 'Rental car', startDate: '2026-09-30', endDate: '2026-10-03' },
  { type: 'stay', title: 'Dive hotel', startDate: '2026-09-30', endDate: '2026-10-03' },
  { type: 'activity', title: 'Site visit', startDate: '2026-10-01', startTime: '10:00' },
  { type: 'flight', title: 'Return', startDate: '2026-10-03', startTime: '14:00' },
] }, now);
const consolidatedHtml = SHARE.buildPlanShareHtml(consolidatedTrip, { insurance: [{ type: 'dive', provider: 'DAN', memberNumber: '42', endDate: '2026-12-31', emergencyPhone: '555-0199' }] });
assert.match(consolidatedHtml, /<span class="ongoing-tag">Staying<\/span><span class="ongoing-name">Dive hotel<\/span><span class="ongoing-when">Night 2 of 3<\/span>/, 'Repeated hotel rows collapse into one ongoing strip in the document too.');
assert.match(consolidatedHtml, /<span class="ongoing-tag">Car<\/span><span class="ongoing-name">Rental car<\/span>/, 'Rental-car days in between join the same strip.');
assert.ok(!consolidatedHtml.includes('Staying · Dive hotel'), 'The document no longer repeats a full row for each night.');
const pastSharedHtml = SHARE.buildPlanShareHtml({ ...sharedPlan, startDate: '2025-11-07', endDate: '2025-11-14' }, { generatedAt: new Date(2026, 9, 13) });
assert.match(pastSharedHtml, /Nov 7–14, 2025/, 'Completed trips remain exportable; sharing is not limited by plan phase.');
assert.match(SHARE.buildPlanShareHtml(P.normalizePlan({ ...sharedPlan, title: 'Long stay test', segments: [
  { type: 'stay', title: 'Dive resort', startDate: '2026-11-07', startTime: '16:00', endDate: '2026-11-09' },
] }, now)), /<span class="ongoing-tag">Staying<\/span><span class="ongoing-name">Dive resort<\/span><span class="ongoing-when">Night 2 of 2<\/span>/, 'An ongoing stay reads as a strip instead of repeating its check-in row.');

// Linked sites keep their atlas id, position and area.
const linked = P.normalizePlan({ destination: { name: 'Palancar Gardens', siteId: 'x', latitude: 20.3, longitude: -87.03, area: 'Cozumel, Mexico', custom: false } }, now);
assert.equal(linked.destination.area, 'Cozumel, Mexico');
assert.equal(P.normalizePlan({ destination: { name: 'Quarry', latitude: 200, longitude: 0 } }, now).destination.latitude, undefined, 'Invalid coordinates are dropped.');

// Site type-ahead: atlas sites with their area, the diver's own pins first.
const S = loadSourceModule(path.join(root, 'features/planner/siteSearch.js'), root);
const pal = S.searchDiveSites('palancar h');
assert.equal(pal[0].name, 'Palancar Horseshoe');
assert.match(pal[0].area, /Cozumel/);
assert.ok(Number.isFinite(pal[0].latitude) && !pal[0].custom);
assert.deepEqual(S.searchDiveSites('p'), [], 'One letter is too short to search.');
const mine = S.searchDiveSites('backyard', [{ id: 'my-abc12', name: 'Backyard Quarry', latitude: 41, longitude: -88 }]);
assert.equal(mine[0].custom, true);
assert.equal(mine[0].area, 'My site');
assert.ok(S.searchDiveSites('spiegel grove').some((site) => /Spiegel Grove/.test(site.name)), 'Multi-word names match.');
assert.ok(S.searchDiveSites('devils den').some((site) => /Devil.s Den/.test(site.name)), 'Apostrophes are ignored.');

(async () => {
  // My sites storage: validated, de-duplicated by id, removable.
  const M = loadSourceModule(path.join(root, 'features/mySites/storage.js'), root);
  const memory = new Map();
  const store = { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => { memory.set(k, v); } };
  const added = await M.addMySite({ name: ' Haigh Quarry ', latitude: 41.2, longitude: -88.3 }, store);
  assert.equal(added.name, 'Haigh Quarry');
  assert.match(added.id, /^my-/);
  await assert.rejects(M.addMySite({ name: '', latitude: 1, longitude: 1 }, store));
  await assert.rejects(M.addMySite({ name: 'Nowhere', latitude: 91, longitude: 0 }, store));
  await M.addMySite({ ...added, name: 'Haigh Quarry (south)' }, store);
  assert.deepEqual((await M.loadMySites(store)).map((site) => site.name), ['Haigh Quarry (south)'], 'Saving the same id replaces it.');
  await M.removeMySite(added.id, store);
  assert.equal((await M.loadMySites(store)).length, 0);
  memory.set(M.MY_SITES_STORAGE_KEY, '{broken');
  assert.deepEqual(await M.loadMySites(store), [], 'Corrupt storage reads as empty.');
  console.log('Site search and My sites checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

// Rental cars show on every day they cover but are not somewhere to sleep; activities are one-offs.
{
  const car = P.normalizeSegment({ id: 'car', type: 'car', title: 'Compact SUV', startDate: '2026-11-07', endDate: '2026-11-10' });
  assert.equal(car.endDate, '2026-11-10', 'A rental car keeps its drop-off date.');
  const trip = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', endDate: '2026-11-10', segments: [car, { type: 'activity', title: 'Cenote tour', startDate: '2026-11-08' }] }, now);
  const days = P.planTimeline(trip).days;
  assert.deepEqual(days.map((day) => [day.starts.length, day.continuing.length, day.ends.length]), [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1]], 'Car picked up, carried through, returned.');
  assert.ok(find(P.planAlerts(trip, {}, now), 'nights-'), 'A rental car does not cover the nights.');
}

// Packing belongs to each plan: two trips on one setup pack separately, and nothing carries over.
{
  const G = loadSourceModule(path.join(root, 'features/gearChecklist/model.js'), root);
  const setup = { id: 'single', name: 'Single tank', itemIds: ['bcd', 'reg'], checkedIds: ['bcd', 'reg'], accessoryChoices: {} };
  const items = [{ id: 'bcd', name: 'BCD', category: 'BCD' }, { id: 'reg', name: 'Regulator', category: 'Regulators' }];
  const thailand = P.normalizePlan({ id: 'th', kind: 'trip', startDate: '2026-10-10', endDate: '2026-10-17', setupId: 'single', packedIds: ['bcd', 'bcd', ''] }, now);
  const cozumel = P.normalizePlan({ id: 'cz', kind: 'trip', startDate: '2026-11-07', endDate: '2026-11-14', setupId: 'single' }, now);
  assert.deepEqual(thailand.packedIds, ['bcd'], 'Packing ticks are tidied.');
  assert.deepEqual(cozumel.packedIds, [], 'A new trip starts with nothing packed.');
  const packed = P.packPlan(cozumel, ['reg'], true);
  assert.deepEqual([packed.packedIds, thailand.packedIds], [['reg'], ['bcd']], 'Packing for one trip leaves the other alone.');
  assert.deepEqual(P.packPlan(packed, ['reg'], false).packedIds, []);
  assert.equal(G.setupProgress(P.withPlanPacking(setup, cozumel), items).checked, 0, 'A trip’s progress uses its own ticks, not the setup’s leftovers.');
  assert.equal(P.nextPlanForSetup([cozumel, thailand], 'single', now).id, 'th', 'The Gear Locker packs for the soonest trip on the setup.');
  assert.equal(P.nextPlanForSetup([{ ...thailand, status: 'cancelled' }, cozumel], 'single', now).id, 'cz', 'Cancelled trips are skipped.');
  assert.equal(P.nextPlanForSetup([P.normalizePlan({ setupId: 'single', startDate: '2026-09-01' }, now)], 'single', now), null, 'Past plans are not packed for.');
  const soon = P.normalizePlan({ kind: 'day', startDate: '2026-09-26', setupId: 'single' }, now);
  const alerts = P.planAlerts(soon, { gear: { setups: [setup], items }, now }, now);
  assert.ok(find(alerts, 'packing'), 'Readiness counts the plan’s own packing: 0 of 2, despite the setup’s old ticks.');
  assert.ok(!find(P.planAlerts(P.packPlan(soon, ['bcd', 'reg'], true), { gear: { setups: [setup], items }, now }, now), 'packing'));
}

// Extra gear for one plan: packed and checked with it, the setup itself untouched.
{
  const G = loadSourceModule(path.join(root, 'features/gearChecklist/model.js'), root);
  const setup = { id: 'single', name: 'Single tank', itemIds: ['bcd'], checkedIds: [], accessoryChoices: {} };
  const items = [
    { id: 'bcd', name: 'BCD', category: 'BCD' },
    { id: 'tank2', name: 'AL80 #2', category: 'Cylinder / tank', nextServiceDate: '2026-10-01' },
    { id: 'proto', name: 'Ocean Comm test unit', category: 'Accessories' },
  ];
  const testing = P.normalizePlan({ id: 'oc', kind: 'trip', startDate: '2026-10-10', endDate: '2026-10-12', setupId: 'single', extraItemIds: ['tank2', 'proto', 'proto', ''] }, now);
  assert.deepEqual(testing.extraItemIds, ['tank2', 'proto'], 'Extras are tidied.');
  const packing = P.withPlanPacking(setup, testing);
  assert.deepEqual(packing.itemIds, ['bcd', 'tank2', 'proto'], 'The plan packs its setup plus its extras.');
  assert.deepEqual(setup.itemIds, ['bcd'], 'The setup itself is unchanged.');
  assert.equal(G.setupProgress(packing, items).total, 3);
  assert.equal(G.setupProgress(P.withPlanPacking(setup, P.packPlan(testing, ['proto'], true)), items).checked, 1, 'Extras are ticked like any other gear.');
  assert.equal(G.setupProgress(P.withPlanPacking(setup, P.normalizePlan({ setupId: 'single' }, now)), items).total, 1, 'Another plan on the setup doesn’t get them.');
  assert.equal(G.setupProgress(P.withPlanPacking(setup, { ...testing, extraItemIds: ['gone'] }), items).total, 1, 'An extra deleted from the Gear Locker is skipped.');
  const alerts = P.planAlerts(testing, { gear: { setups: [setup], items }, now }, now);
  assert.ok(alerts.some((alert) => alert.key.startsWith('svc-') && /AL80 #2/.test(alert.title)), 'An extra tank due for service before the trip is flagged.');
}

// A day reads in the order it happens: disembarking at 1 PM comes before a 2 PM hotel check-in.
{
  const trip = P.normalizePlan({ kind: 'trip', startDate: '2026-03-13', endDate: '2026-03-20', segments: [
    { id: 'boat', type: 'liveaboard', title: 'Sea Spirit', startDate: '2026-03-13', startTime: '16:00', endDate: '2026-03-18', endTime: '13:00' },
    { id: 'resort', type: 'stay', title: 'Kalima Resort', startDate: '2026-03-18', startTime: '14:00', endDate: '2026-03-20' },
    { id: 'car', type: 'car', title: 'SUV', startDate: '2026-03-17', endDate: '2026-03-19' },
    { id: 'dinner', type: 'other', title: 'Dinner', startDate: '2026-03-18', startTime: '19:30' },
    { id: 'tour', type: 'activity', title: 'Old town walk', startDate: '2026-03-18' },
  ] }, now);
  const day = P.planTimeline(trip).days.find((entry) => entry.date === '2026-03-18');
  assert.deepEqual(day.entries.map(({ leg, variant }) => `${leg.id}:${variant}`),
    ['car:continuing', 'boat:end', 'resort:start', 'dinner:start', 'tour:start'],
    'Underway first, then by time (1 PM disembark, 2 PM check-in, 7:30 PM dinner), untimed last.');
  const sameMinute = P.dayEntries(
    [P.normalizeSegment({ id: 'in', type: 'stay', startDate: '2026-03-18', startTime: '12:00' })],
    [P.normalizeSegment({ id: 'out', type: 'stay', startDate: '2026-03-15', endDate: '2026-03-18', endTime: '12:00' })], []);
  assert.deepEqual(sameMinute.map(({ leg }) => leg.id), ['out', 'in'], 'At the same time, checking out comes before checking in.');
  const untimed = P.dayEntries(
    [P.normalizeSegment({ id: 'in', type: 'stay', startDate: '2026-03-18' })],
    [P.normalizeSegment({ id: 'out', type: 'stay', startDate: '2026-03-15', endDate: '2026-03-18' })], []);
  assert.deepEqual(untimed.map(({ leg }) => leg.id), ['out', 'in'], 'Without times, endings still come before beginnings.');
}

// Flight bookings: connections, layovers, return flights and replacing a booking's legs.
{
  const out1 = P.normalizeSegment({ id: 'f1', type: 'flight', title: 'UA 1234', from: 'ORD', to: 'IAH', startDate: '2026-11-07', startTime: '06:00', endDate: '2026-11-07', endTime: '08:45', booking: 'b1', provider: 'United', reference: 'ABC123' });
  const out2 = P.normalizeSegment({ id: 'f2', type: 'flight', title: 'UA 1500', from: 'iah', to: 'CZM', startDate: '2026-11-07', startTime: '10:05', endDate: '2026-11-07', endTime: '12:40', booking: 'b1' });
  const home = P.normalizeSegment({ id: 'f3', type: 'flight', title: 'UA 1501', from: 'CZM', to: 'IAH', startDate: '2026-11-14', startTime: '13:30', endDate: '2026-11-14', endTime: '16:20', booking: 'b1' });
  const stay = P.normalizeSegment({ id: 's1', type: 'stay', startDate: '2026-11-07', endDate: '2026-11-14', booking: 'b1' });
  assert.equal(stay.booking, '', 'Only flights carry a booking id.');
  const trip = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', endDate: '2026-11-14', segments: [home, out2, stay, out1] }, now);
  const connections = P.flightConnections(trip);
  assert.deepEqual(connections.get('f1'), { minutes: 80, airport: 'iah', nextId: 'f2' }, 'ORD→IAH connects to IAH→CZM (airports match case-insensitively).');
  assert.ok(!connections.has('f2'), 'A week in Cozumel is not a layover.');
  assert.equal(P.formatDuration(80), '1h 20m');
  assert.equal(P.formatDuration(45), '45m');
  assert.equal(P.formatDuration(120), '2h');
  const elsewhere = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', segments: [out1, { ...out2, from: 'DFW' }] }, now);
  assert.equal(P.flightConnections(elsewhere).size, 0, 'Flights from a different airport are not a connection.');
  assert.deepEqual(P.bookingFlights(trip, out2).map((leg) => leg.id), ['f1', 'f2', 'f3'], 'Tapping any flight opens its whole booking.');
  const next = P.connectingFlight(out1);
  assert.equal(next.from, 'IAH'); assert.equal(next.startDate, '2026-11-07'); assert.equal(next.booking, 'b1'); assert.equal(next.reference, 'ABC123');
  const back = P.returnFlight([out1, out2], trip);
  assert.equal(back.from, 'CZM'); assert.equal(back.to, 'ORD'); assert.equal(back.startDate, '2026-11-14');
  const replaced = P.replaceFlights(trip.segments, ['f1', 'f2', 'f3'], [out1, home]);
  assert.deepEqual(replaced.map((leg) => leg.id), ['f1', 's1', 'f3'], 'Editing a booking swaps its legs and keeps the itinerary in order.');
  const tight = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', segments: [out1, { ...out2, startTime: '09:15' }] }, now);
  assert.ok(find(P.planAlerts(tight, {}, now), 'connect-'), 'A 30-minute connection is still flagged.');
}

console.log(`Planner checks passed: records, dates, phases, sorting, timeline, gear service lead times, out-of-service gear, packing, certification levels and expiry, experience and recency, paperwork, no-fly intervals, connections, uncovered nights and passport validity (${alerts.length} alerts on the sample trip).`);
