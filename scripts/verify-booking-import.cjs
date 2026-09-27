const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const F = loadSourceModule(path.join(root, 'features/planner/bookingImport/parseFlightText.js'), root);
const E = loadSourceModule(path.join(root, 'features/planner/bookingImport/emailText.js'), root);

const today = '2026-09-26';
const pick = (flight) => [flight.title, flight.from, flight.to, flight.startDate, flight.startTime, flight.endDate, flight.endTime].join(' ');

// 1. Pasted United-style email: city names with codes in parentheses, a connection out and one home.
{
  const email = `Thanks for choosing United. A receipt of your purchase is shown below.
Confirmation Number: KX7Q2M
Flight 1 of 3  UA 1234
Sat, Nov 07, 2026
06:00 AM  Chicago, IL, US (ORD)   →   08:45 AM  Houston, TX, US (IAH)
Economy (K)  Seat: 23C
Flight 2 of 3  UA 1500
Sat, Nov 07, 2026
10:05 AM  Houston, TX, US (IAH)   →   12:40 PM  Cozumel, MX (CZM)
Economy (K)  Seat: 18A
Flight 3 of 3  UA 1501
Sat, Nov 14, 2026
01:30 PM  Cozumel, MX (CZM)   →   04:20 PM  Houston, TX, US (IAH)
Total: USD 842.60   Taxes and fees 12.50`;
  const result = F.parseFlightText(email, { today });
  assert.equal(result.reference, 'KX7Q2M');
  assert.deepEqual(result.flights.map(pick), [
    'UA 1234 ORD IAH 2026-11-07 06:00 2026-11-07 08:45',
    'UA 1500 IAH CZM 2026-11-07 10:05 2026-11-07 12:40',
    'UA 1501 CZM IAH 2026-11-14 13:30 2026-11-14 16:20',
  ]);
  assert.equal(result.flights[0].provider, 'United');
  assert.equal(result.flights[0].notes, 'Seat 23C');
  assert.ok(result.complete, result.issues.join(' '));
}

// 2. American-style HTML email: a table per flight, airline name + number, dates without a year.
{
  const html = `<html><body><table>
  <tr><td>Record locator:</td><td><b>QWERTY</b></td></tr>
  <tr><td>American Airlines 2211</td><td>Thursday, March 4</td></tr>
  <tr><td>MIA</td><td>7:15 AM</td><td>&rarr;</td><td>BON</td><td>11:05 AM</td></tr>
  <tr><td>American Airlines 2212</td><td>Thursday, March 11</td></tr>
  <tr><td>BON</td><td>12:10 PM</td><td>&rarr;</td><td>MIA</td><td>3:55 PM</td></tr>
  </table><p>Questions? Visit aa.com &amp; our FAQ.</p></body></html>`;
  const { text } = E.emailToText(html);
  assert.ok(!/<td>/.test(text) && /→/.test(text), 'HTML is flattened and entities decoded.');
  const result = F.parseFlightText(text, { today });
  assert.equal(result.reference, 'QWERTY');
  assert.deepEqual(result.flights.map(pick), [
    'AA 2211 MIA BON 2027-03-04 07:15 2027-03-04 11:05',
    'AA 2212 BON MIA 2027-03-11 12:10 2027-03-11 15:55',
  ], 'Dates without a year fall on the next occurrence.');
}

// 3. Delta-style: details before the flight number, 24-hour codes, overnight arrival marked +1.
{
  const email = `Your trip confirmation #: HG5TR2
DEPART  LAX 11:40pm  ARRIVE  SIN 6:55am +1
Wed 12 May 2027
DL 7  Main Cabin
DEPART  SIN 9:30am  ARRIVE  MNL 1:20pm
Fri 14 May 2027
DL 7811 operated by Philippine Airlines`;
  const result = F.parseFlightText(email, { today });
  assert.equal(result.reference, 'HG5TR2');
  assert.deepEqual(result.flights.map(pick), [
    'DL 7 LAX SIN 2027-05-12 23:40 2027-05-13 06:55',
    'DL 7811 SIN MNL 2027-05-14 09:30 2027-05-14 13:20',
  ], 'Details printed before the number are matched, and +1 moves the arrival a day.');
}

// 4. A saved .eml: multipart/alternative, quoted-printable HTML with a UTF-8 arrow.
{
  const eml = [
    'From: "Southwest Airlines" <SouthwestAirlines@ifly.southwest.com>',
    'Subject: Your trip is booked! Confirmation #: 4ZWPLB',
    'Date: Mon, 21 Sep 2026 14:03:11 -0500',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'View this email in a browser.',
    '--b1',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<div>Confirmation # 4ZWPLB</div><div>Flight # 1834 =E2=86=92 Sat, Oct 24, 2026</div>=',
    '<div>DEN 6:10 AM &nbsp; Departs &nbsp; KOA 10:35 AM Arrives</div>',
    '--b1--',
    '',
  ].join('\r\n');
  const { text, sentDate } = E.emailToText(eml);
  assert.equal(sentDate, '2026-09-21');
  assert.ok(text.includes('→'), 'Quoted-printable UTF-8 decodes.');
  const result = F.parseFlightText(text, { today: sentDate });
  assert.equal(result.reference, '4ZWPLB');
  assert.deepEqual(result.flights.map(pick), ['WN 1834 DEN KOA 2026-10-24 06:10 2026-10-24 10:35'], 'A bare "Flight #" takes the email’s airline.');
}

// 5. Day-first dates (UK style) and base64 bodies.
{
  const body = Buffer.from('Booking reference: ZX81QP\nBA 2155  London Gatwick (LGW) to Grand Cayman (GCM)\n14 Feb 2027  Depart 11:25  Arrive 16:05\n').toString('base64');
  const eml = `Subject: Your booking\nContent-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${body}`;
  const result = F.parseFlightText(E.emailToText(eml).text, { today });
  assert.equal(result.reference, 'ZX81QP');
  assert.deepEqual(result.flights.map(pick), ['BA 2155 LGW GCM 2027-02-14 11:25 2027-02-14 16:05']);
}

// 6. Incomplete or unrelated text is reported, not guessed.
{
  const partial = F.parseFlightText('Your flight UA 88 to Bonaire is confirmed. Confirmation ABC12D.', { today });
  assert.equal(partial.complete, false);
  assert.ok(partial.issues.length);
  const none = F.parseFlightText('Hi Mom, the dive shop called about Saturday. Price was 12.50 each.', { today });
  assert.equal(none.flights.length, 0);
  assert.equal(none.complete, false);
  assert.deepEqual(none.issues, ['No flights found.']);
}

// 7. Choosing between the phone's parser and smart import.
const R = loadSourceModule(path.join(root, 'features/planner/bookingImport/readBooking.js'), root);
(async () => {
  const good = 'Confirmation: KX7Q2M\nUA 1234 Sat, Nov 07, 2026 06:00 AM (ORD) → 08:45 AM (IAH)';
  const partial = 'Your flight UA 88 on Nov 7 from Houston (IAH) to Bonaire (BON) is confirmed. Confirmation ABC12D.';
  let calls = [];
  const smartImport = async (request) => { calls.push(request); return { items: [{ type: 'flight', title: 'UA 88', from: 'IAH', to: 'BON', reference: 'ABC12D' }], issues: [] }; };

  const onDevice = await R.readBooking({ raw: good, signedIn: true, today, smartImport });
  assert.equal(onDevice.source, 'device'); assert.equal(calls.length, 0, 'A fully read email never leaves the phone.');
  assert.equal(onDevice.items[0].reference, 'KX7Q2M');

  const smart = await R.readBooking({ raw: partial, signedIn: true, today, smartImport });
  assert.equal(smart.source, 'ai'); assert.equal(calls.length, 1); assert.equal(calls[0].referenceDate, today);

  calls = [];
  const signedOut = await R.readBooking({ raw: partial, signedIn: false, today, smartImport });
  assert.equal(signedOut.source, 'device'); assert.equal(calls.length, 0, 'Signed out, nothing is sent.');
  assert.ok(signedOut.issues.some((issue) => /Sign in/.test(issue)));

  const failing = async () => { throw Object.assign(new Error('offline'), { code: 'NETWORK' }); };
  assert.equal((await R.readBooking({ raw: partial, signedIn: true, today, smartImport: failing })).source, 'device', 'If smart import fails, the partial read is still offered.');
  await assert.rejects(R.readBooking({ raw: 'hello', signedIn: false, today, smartImport }), /Sign in/);
  await assert.rejects(R.readBooking({ raw: 'hello', signedIn: true, today, smartImport: failing }), /offline/);
  await assert.rejects(R.readBooking({ pdfBase64: 'JVBERi0', signedIn: false, today, smartImport }), /PDF/);
  assert.equal((await R.readBooking({ pdfBase64: 'JVBERi0', signedIn: true, today, smartImport })).source, 'ai');

  console.log('Flight import checks passed: United, American HTML, Delta before-number layout with +1 arrival, Southwest .eml (quoted-printable), base64 day-first dates, honest failure on partial text, and on-device-first routing with smart-import fallback.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

// 8. Hotels, rental cars, liveaboards, tours and dive bookings read on the phone.
const B = loadSourceModule(path.join(root, 'features/planner/bookingImport/parseBookingText.js'), root);
const pickLeg = (leg) => [leg.type, leg.title, leg.provider, leg.startDate, leg.startTime, leg.endDate, leg.endTime, leg.from, leg.to, leg.reference].join('|');
{
  const hotel = B.parseBookingText(`From: Booking.com <noreply@booking.com>
Subject: Your reservation at Casa Mexicana Cozumel is confirmed
Booking number: 4012.559.873
Hotel: Casa Mexicana Cozumel
Address: Av. Rafael E. Melgar 457, Cozumel, Mexico
Check-in: Sat, Nov 7, 2026 (from 15:00)
Check-out: Sat, Nov 14, 2026 (until 12:00)
Room: Deluxe Ocean View, 2 guests`, { today });
  assert.ok(hotel.complete, hotel.issues.join(' '));
  assert.equal(pickLeg(hotel.items[0]), 'stay|Casa Mexicana Cozumel|Booking.com|2026-11-07|15:00|2026-11-14|12:00|Av. Rafael E. Melgar 457, Cozumel, Mexico||4012.559.873');

  const car = B.parseBookingText(`Thanks for renting with Hertz. Your rental car reservation is confirmed.
Confirmation number: H7734521906
Vehicle: Compact SUV (Jeep Compass or similar)
Pick-up: Nov 7, 2026 1:30 PM
Pick-up location: Cozumel Airport (CZM)
Return: Nov 14, 2026 9:00 AM
Return location: Cozumel Airport (CZM)`, { today });
  assert.ok(car.complete, car.issues.join(' '));
  assert.equal(pickLeg(car.items[0]), 'car|Compact SUV (Jeep Compass or similar)|Hertz|2026-11-07|13:30|2026-11-14|09:00|Cozumel Airport (CZM)|Cozumel Airport (CZM)|H7734521906');

  const boat = B.parseBookingText(`From: Aggressor Adventures
Subject: Booking confirmation for Galapagos Aggressor III
Liveaboard itinerary · Reservation #: GA-88213
Vessel: Galapagos Aggressor III
Embarkation: Thursday, May 13, 2027 at 3:00 PM, Baltra Island
Disembarkation: Thursday, May 20, 2027 at 8:00 AM
Up to 20 dives including Darwin & Wolf. Cabin check-in on board.`, { today });
  assert.ok(boat.complete, boat.issues.join(' '));
  assert.equal(boat.kind, 'liveaboard', 'A liveaboard cabin check-in is not a hotel.');
  assert.deepEqual([boat.items[0].title, boat.items[0].startDate, boat.items[0].startTime, boat.items[0].endDate, boat.items[0].dives, boat.items[0].reference], ['Galapagos Aggressor III', '2027-05-13', '15:00', '2027-05-20', 20, 'GA-88213']);

  const tour = B.parseBookingText(`From: Viator
Subject: Booking confirmed: Cenote Snorkel & Tulum Ruins Tour
Booking reference: BR-1149203377
Date: Tue, Nov 10, 2026
Start time: 8:00 AM
Meeting point: Playa del Carmen ferry pier, Calle 1 Sur`, { today });
  assert.ok(tour.complete, tour.issues.join(' '));
  assert.equal(pickLeg(tour.items[0]), 'activity|Cenote Snorkel & Tulum Ruins Tour|Viator|2026-11-10|08:00|||Playa del Carmen ferry pier, Calle 1 Sur||BR-1149203377');

  const dives = B.parseBookingText(`From: Scuba Tony Cozumel
Subject: Your booking for Palancar Reef 2-tank boat dive
Order #: 55120
Date: Mon, Nov 9, 2026  Departs: 8:30 AM
Meeting point: Hotel dock pick-up`, { today });
  assert.equal(dives.items[0].type, 'diving', 'A two-tank boat dive is a dive day, not a generic tour.');
  assert.deepEqual([dives.items[0].title, dives.items[0].startDate, dives.items[0].startTime, dives.items[0].dives], ['Palancar Reef 2-tank boat dive', '2026-11-09', '08:30', 2]);

  const bundle = B.parseBookingText('Your Expedia trip: Hotel check-in Nov 7, check-out Nov 14, 2 guests. Rental car pick-up Nov 7, return Nov 14.', { today });
  assert.equal(bundle.complete, false, 'A hotel + car bundle goes to smart import whole.');

  // An airline email mentions online check-in, tickets and dates: not a hotel or a tour.
  const airline = B.parseBookingText('Check in online 24 hours before. E-ticket number 0162334. Date: Nov 7, 2026. Check out our deals on hotels!', { today, strongOnly: true });
  assert.equal(airline.items.length, 0);
}

// 9. Fitting an import into a trip.
const I = loadSourceModule(path.join(root, 'features/planner/bookingImport/planImport.js'), root);
const P = loadSourceModule(path.join(root, 'features/planner/model.js'), root);
{
  const now = new Date(2026, 8, 26);
  const plan = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', endDate: '2026-11-14', segments: [
    { id: 'old-out', type: 'flight', title: 'UA 1234', startDate: '2026-11-07', reference: 'KX7Q2M', booking: 'b-old' },
    { id: 'old-hotel', type: 'stay', title: 'Casa Mexicana', startDate: '2026-11-07', endDate: '2026-11-14' },
    { id: 'dive', type: 'diving', title: 'Palancar', startDate: '2026-11-09' },
  ] }, now);
  const { rows, extend } = I.planImport(plan, [
    { type: 'flight', title: 'UA 1234', from: 'ORD', to: 'IAH', startDate: '2026-11-07', reference: 'kx7q2m' },
    { type: 'flight', title: 'UA 1500', from: 'IAH', to: 'CZM', startDate: '2026-11-07', reference: 'KX7Q2M' },
    { type: 'flight', title: 'UA 1501', from: 'CZM', to: 'IAH', startDate: '2026-11-15', reference: 'KX7Q2M' },
    { type: 'stay', title: 'Casa Mexicana Cozumel', startDate: '2026-11-07', endDate: '2026-11-15' },
    { type: 'car', title: 'Compact SUV', provider: 'Hertz', startDate: '2026-11-07', endDate: '2026-11-14' },
  ]);
  const flights = rows.find((row) => row.kind === 'flights');
  assert.equal(flights.legs.length, 3, 'One confirmation, one booking row.');
  assert.deepEqual(flights.replaces, ['old-out'], 'A matching confirmation updates the flights already on the trip.');
  assert.ok(flights.legs.every((leg) => leg.booking === 'b-old'), 'Updated flights keep their booking.');
  assert.deepEqual(rows.find((row) => row.legs[0].type === 'stay').replaces, ['old-hotel'], 'The same hotel on the same day is updated, not doubled.');
  assert.deepEqual(rows.find((row) => row.legs[0].type === 'car').replaces, []);
  assert.deepEqual(extend, { startDate: '2026-11-07', endDate: '2026-11-15' }, 'A later flight home offers to stretch the trip.');
  const after = I.applyImport(plan, rows, extend);
  assert.equal(after.endDate, '2026-11-15');
  assert.deepEqual(after.segments.map((leg) => leg.type).sort(), ['car', 'diving', 'flight', 'flight', 'flight', 'stay']);
  assert.ok(!after.segments.some((leg) => ['old-out', 'old-hotel'].includes(leg.id)));

  const boat = I.planImport(plan, [
    { type: 'liveaboard', title: 'Galapagos Aggressor III', startDate: '2026-11-08', endDate: '2026-11-13' },
    { type: 'diving', title: 'Wolf Island', startDate: '2026-11-09', dives: 4 },
    { type: 'diving', title: 'Darwin Arch', startDate: '2026-11-10', dives: 3 },
  ]);
  assert.equal(boat.rows.length, 1, 'Dive days inside a liveaboard fold into it.');
  assert.equal(boat.rows[0].legs[0].dives, 7);
  assert.equal(boat.extend, null, 'Bookings inside the trip leave its dates alone.');
}

console.log('Booking import checks passed: hotel, rental car, liveaboard, Viator tour and dive booking read on the phone; bundles and airline emails handled; imports update matching bookings, fold dive days into liveaboards and stretch the trip.');
