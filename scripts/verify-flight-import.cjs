const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const F = loadSourceModule(path.join(root, 'features/planner/flightImport/parseFlightText.js'), root);
const E = loadSourceModule(path.join(root, 'features/planner/flightImport/emailText.js'), root);

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
const R = loadSourceModule(path.join(root, 'features/planner/flightImport/readConfirmation.js'), root);
(async () => {
  const good = 'Confirmation: KX7Q2M\nUA 1234 Sat, Nov 07, 2026 06:00 AM (ORD) → 08:45 AM (IAH)';
  const partial = 'Your flight UA 88 on Nov 7 from Houston (IAH) to Bonaire (BON) is confirmed. Confirmation ABC12D.';
  let calls = [];
  const smartImport = async (request) => { calls.push(request); return { flights: [{ type: 'flight', title: 'UA 88', from: 'IAH', to: 'BON' }], reference: 'ABC12D', issues: [] }; };

  const onDevice = await R.readConfirmation({ raw: good, signedIn: true, today, smartImport });
  assert.equal(onDevice.source, 'device'); assert.equal(calls.length, 0, 'A fully read email never leaves the phone.');
  assert.equal(onDevice.flights[0].reference, 'KX7Q2M');

  const smart = await R.readConfirmation({ raw: partial, signedIn: true, today, smartImport });
  assert.equal(smart.source, 'ai'); assert.equal(calls.length, 1); assert.equal(calls[0].referenceDate, today);

  calls = [];
  const signedOut = await R.readConfirmation({ raw: partial, signedIn: false, today, smartImport });
  assert.equal(signedOut.source, 'device'); assert.equal(calls.length, 0, 'Signed out, nothing is sent.');
  assert.ok(signedOut.issues.some((issue) => /Sign in/.test(issue)));

  const failing = async () => { throw Object.assign(new Error('offline'), { code: 'NETWORK' }); };
  assert.equal((await R.readConfirmation({ raw: partial, signedIn: true, today, smartImport: failing })).source, 'device', 'If smart import fails, the partial read is still offered.');
  await assert.rejects(R.readConfirmation({ raw: 'hello', signedIn: false, today, smartImport }), /Sign in/);
  await assert.rejects(R.readConfirmation({ raw: 'hello', signedIn: true, today, smartImport: failing }), /offline/);
  await assert.rejects(R.readConfirmation({ pdfBase64: 'JVBERi0', signedIn: false, today, smartImport }), /PDF/);
  assert.equal((await R.readConfirmation({ pdfBase64: 'JVBERi0', signedIn: true, today, smartImport })).source, 'ai');

  console.log('Flight import checks passed: United, American HTML, Delta before-number layout with +1 arrival, Southwest .eml (quoted-printable), base64 day-first dates, honest failure on partial text, and on-device-first routing with smart-import fallback.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
