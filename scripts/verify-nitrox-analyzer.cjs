const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.join(__dirname, '..');
const m = loadSourceModule(path.join(root, 'src/features/nitroxAnalyzer/model.js'), path.join(root, 'src'));
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} expected ${b}, got ${a}`);

// Base64 round trip against the real packet captured in nRF Connect (DNA 004017, in air).
const AIR_BYTES = [0x04, 0x01, 0x48, 0x03, 0x49, 0x03, 0xBF, 0x27];
const AIR_B64 = Buffer.from(AIR_BYTES).toString('base64');
assert.deepEqual(m.base64ToBytes(AIR_B64), AIR_BYTES);
assert.equal(m.bytesToHex(AIR_BYTES), '04 01 48 03 49 03 BF 27');

// Packet decode: LE words 840 / 841 signal, 10175 = 1017.5 mbar.
const air = m.parseMeasurementBase64(AIR_B64);
assert.equal(air.signalA, 840);
assert.equal(air.signalB, 841);
near(air.signal, 840.5);
near(air.millivolts, 8.405);
near(air.pressureMbar, 1017.5);
assert.deepEqual(air.header, [4, 1]);

// Anything not 8 bytes is rejected rather than misread.
assert.equal(m.parseMeasurement([1, 2, 3]), null);
assert.equal(m.parseMeasurement(null), null);
assert.equal(m.parseMeasurementBase64(''), null);

// Calibration: air reads back as 20.9 %.
const cal = m.makeCalibration(air, { at: '2026-11-10T12:00:00Z' });
near(m.oxygenPercent(air, cal), 20.9, 1e-9, 'air after calibration');
assert.equal(m.makeCalibration({ signal: 0 }), null);

// Linear scaling: 32 % nitrox gives 32/20.9 × the air signal.
const ean32Signal = 840.5 * (32 / 20.9);
near(m.oxygenPercent({ signal: ean32Signal, pressureMbar: 1017.5 }, cal), 32, 1e-9, 'EAN32');
near(m.oxygenPercent({ signal: 840.5 * (100 / 20.9), pressureMbar: 1017.5 }, cal), 100, 1e-9, 'pure O2');

// Pressure compensation: same gas, lower ambient pressure → lower cell signal, same %.
const lowP = { signal: 840.5 * (990 / 1017.5), pressureMbar: 990 };
near(m.oxygenPercent(lowP, cal), 20.9, 1e-9, 'pressure compensated');
// Implausible pressure is ignored rather than trusted.
near(m.oxygenPercent({ signal: 840.5, pressureMbar: 0 }, cal), 20.9, 1e-9, 'bad pressure ignored');
assert.equal(m.oxygenPercent(air, null), null);

// Cell health thresholds.
assert.equal(m.cellHealth(cal).tone, 'good');
assert.equal(m.cellHealth({ millivolts: 7.5 }).tone, 'warning');
assert.equal(m.cellHealth({ millivolts: 6.2 }).tone, 'danger');
assert.equal(m.cellHealth(null).tone, 'info');

// Stability: needs a full window, and a tight band.
const t0 = 1_000_000;
const steady = Array.from({ length: 8 }, (_, i) => ({ t: t0 + i * 500, value: 32 + (i % 2) * 0.05 }));
assert.equal(m.isStable(steady, t0 + 3500), true);
assert.equal(m.isStable(steady.slice(0, 3), t0 + 1000), false, 'too short a window');
const drifting = steady.map((s, i) => ({ ...s, value: 30 + i * 0.3 }));
assert.equal(m.isStable(drifting, t0 + 3500), false);
assert.ok(m.trimSamples(steady, t0 + 100000).length === 0);

// Smoothing: replay the field case — a cell bouncing between 10.15 and 10.20 mV
// at random, ~5 packets/s — through the same tick logic the hook runs.
function simulate(packetSignal, { calibration = null, durationMs = 8000, packetMs = 200, tickMs = 250, seed = 7 } = {}) {
  let rand = seed;
  const next = () => { rand = (rand * 1103515245 + 12345) % 2147483648; return rand / 2147483648; };
  let raw = [];
  let history = [];
  let nextPacket = 0;
  const ticks = [];
  for (let now = 0; now <= durationMs; now += tickMs) {
    while (nextPacket <= now) {
      raw = raw.filter((s) => nextPacket - s.t <= m.SMOOTHING_WINDOW_MS * 2);
      raw.push({ t: nextPacket, m: { signal: packetSignal(nextPacket, next), pressureMbar: 1017.5 } });
      nextPacket += packetMs;
    }
    const smoothed = m.averageMeasurement(raw, now);
    history = m.trimSamples([...history, { t: now, signal: smoothed.signal, pressureMbar: smoothed.pressureMbar }], now);
    const values = history.map((h) => ({ t: h.t, value: calibration ? m.oxygenPercent(h, calibration) : m.AIR_O2_PERCENT * (h.signal / smoothed.signal) }));
    ticks.push({ now, smoothed, stable: m.isStable(values, now) });
  }
  return ticks;
}
const jitter = (t, rnd) => (rnd() < 0.5 ? 1015 : 1020);
// Unsmoothed, that jitter is ±0.1 % O2 — right at the band, which is why calibration never unlocked.
assert.ok(m.AIR_O2_PERCENT * (1020 / 1015) - m.AIR_O2_PERCENT > m.STABLE_BAND_PERCENT, 'raw jitter exceeds the stability band');
const jitterTicks = simulate(jitter);
const firstStable = jitterTicks.find((tk) => tk.stable);
assert.ok(firstStable && firstStable.now <= 4000, `jittery air signal stabilizes within ~4 s (got ${firstStable?.now})`);
assert.ok(jitterTicks.filter((tk) => tk.now >= 4000).every((tk) => tk.stable), 'and stays stable');
const jitterCal = m.makeCalibration(firstStable.smoothed);
assert.ok(jitterCal.millivolts > 10.15 && jitterCal.millivolts < 10.2, 'calibration uses the averaged signal');
// No packets for a while (notify-on-change analyzer): last packet carries forward.
assert.equal(m.averageMeasurement([{ t: 0, m: { signal: 1000, pressureMbar: 1000 } }], 60000).signal, 1000);
assert.equal(m.averageMeasurement([], 0), null);
// A real gas change (air → EAN32 at 4 s) must drop "stable", then settle on ~32 %.
const step = (t, rnd) => (t < 4000 ? 1017.5 : 1017.5 * (32 / 20.9)) + (rnd() < 0.5 ? -2.5 : 2.5);
const stepTicks = simulate(step, { calibration: { signal: 1017.5, pressureMbar: 1017.5, referencePercent: 20.9 }, durationMs: 12000 });
assert.ok(stepTicks.some((tk) => tk.now > 4000 && tk.now < 6000 && !tk.stable), 'gas change is not reported as stable');
const settled = stepTicks[stepTicks.length - 1];
assert.ok(settled.stable, 'new gas settles');
near(m.oxygenPercent(settled.smoothed, { signal: 1017.5, pressureMbar: 1017.5, referencePercent: 20.9 }), 32, 0.1, 'settled EAN32');

// MOD: EAN32 at 1.4 ≈ 33.75 m / 110 ft; air at 1.4 ≈ 57 m.
near(m.modMeters(32, 1.4), 33.75, 1e-9);
assert.equal(m.formatDepth(m.modMeters(32, 1.4), 'm'), '33 m');
assert.equal(m.formatDepth(m.modMeters(32, 1.4), 'ft'), '110 ft');
assert.equal(m.formatDepth(m.modMeters(32, 1.6), 'ft'), '131 ft');
assert.equal(m.modMeters(0), null);

// Catalog: the analyzer is a Tools feature.
const catalog = loadSourceModule(path.join(root, 'src/features/catalog/featureCatalog.js'), path.join(root, 'src'));
const feature = catalog.getFeature('nitrox-analyzer');
assert.ok(feature, 'nitrox-analyzer is in the catalog');
assert.equal(feature.area, 'tools');
assert.equal(feature.routeType, 'nitrox-analyzer');

// ---- Analysis capture: detect tank gas, lock on stable, hold after the tank is gone.
const a = loadSourceModule(path.join(root, 'src/features/nitroxAnalyzer/analysis.js'), path.join(root, 'src'));
let s = a.startAnalysis(20.9, 0);
assert.equal(s.phase, a.PHASE.waiting);
s = a.stepAnalysis(s, { o2: 21.0, stable: true, now: 100 });
assert.equal(s.phase, a.PHASE.waiting, 'ambient air (even stable) does not lock');
s = a.stepAnalysis(s, { o2: 27.4, stable: false, now: 1000 });
assert.equal(s.phase, a.PHASE.settling, 'leaving ambient starts settling');
s = a.stepAnalysis(s, { o2: 31.8, stable: false, now: 2000 });
assert.equal(s.phase, a.PHASE.settling, 'still rising — no lock');
s = a.stepAnalysis(s, { o2: 32.04, stable: true, now: 5000 });
assert.equal(s.phase, a.PHASE.done);
assert.deepEqual(s.result, { o2: 32, at: 5000, method: 'auto' });
// Tank closed: sensor drifts back to air, the locked result must not move.
for (const [o2, now] of [[29, 6000], [24, 7000], [20.9, 9000]]) s = a.stepAnalysis(s, { o2, stable: o2 === 20.9, now });
assert.equal(s.result.o2, 32, 'result held while sensor returns to ambient');
assert.equal(s.backOnAmbient, true);
// Flow stopped before it settled → back to waiting, nothing locked.
let s2 = a.stepAnalysis(a.startAnalysis(20.9, 0), { o2: 25, stable: false, now: 1 });
s2 = a.stepAnalysis(s2, { o2: 21, stable: false, now: 2 });
assert.equal(s2.phase, a.PHASE.waiting);
assert.equal(s2.result, null);
// Air tank: never departs, so the diver holds the reading by hand.
assert.deepEqual(a.holdReading(a.startAnalysis(), 20.93, 50).result, { o2: 20.9, at: 50, method: 'held' });
assert.equal(a.manualResult('31.96', 9).result.o2, 32);
assert.equal(a.manualResult('abc'), null);
assert.equal(a.manualResult('140'), null);

// ---- Nitrox log model.
const log = loadSourceModule(path.join(root, 'src/features/nitroxAnalyzer/nitroxLog.js'), path.join(root, 'src'));
assert.equal(log.tankKey({ gearItemId: 'g1' }), 'gear:g1');
assert.equal(log.tankKey({ serial: ' ab 123 ' }), 'sn:AB123');
assert.equal(log.tankKey({}), '');

const result = { o2: 32, at: 5000, method: 'auto' };
const p1 = log.buildPersonalEntry({ result, tank: { gearItemId: 'g1', label: 'My AL80', serial: 'X1', size: 'AL80' }, labeledO2: '32', pressure: '3000', pressureUnit: 'psi', setOnComputer: true, at: '2026-11-01T10:00:00Z' });
assert.equal(p1.kind, 'personal');
assert.equal(p1.tank.key, 'gear:g1');
assert.equal(p1.tank.source, 'locker');
assert.deepEqual(p1.pressure, { value: 3000, unit: 'psi' });
near(p1.mod14, 33.75);
assert.equal(log.mixDiscrepancy(p1), null, 'within ±1 % of label');
const p2 = log.buildPersonalEntry({ result: { ...result, o2: 30.5 }, tank: { gearItemId: 'g1' }, labeledO2: '32', at: '2026-11-05T10:00:00Z' });
assert.deepEqual(log.mixDiscrepancy(p2), { expected: 32, diff: -1.5 });
const rental = log.buildPersonalEntry({ result, tank: { serial: 'rent 9', size: 'AL80' }, at: '2026-11-03T10:00:00Z' });
assert.equal(rental.tank.source, 'rental');
assert.equal(rental.tank.key, 'sn:RENT9');
assert.equal(rental.tank.label, 'Tank rent 9');
const latest = log.latestByTank([p1, p2, rental]);
assert.equal(latest.get('gear:g1').o2, 30.5, 'latest analysis wins');
assert.deepEqual(log.recentRentalTanks([p1, rental, { ...rental, id: 'dup', at: '2026-10-01T00:00:00Z' }]).map((t) => t.key), ['sn:RENT9']);

const normalized = log.normalizeLogState({ entries: [p1, rental, { id: 'bad' }], facility: { name: ' Dock ' } });
assert.deepEqual(normalized.entries.map((e) => e.id), [rental.id, p1.id], 'newest first, invalid dropped');
assert.equal(normalized.facility.name, 'Dock');

// Locker tanks: manifolded doubles = one tank; independent pair = each cylinder; retired hidden.
const gear = { items: [
  { id: 'c1', category: 'Cylinder / tank', name: 'Doubles L', serialNumber: 'L1', capacity: 'HP100' },
  { id: 'c2', category: 'Cylinder / tank', name: 'Doubles R', serialNumber: 'R1', capacity: 'HP100' },
  { id: 'set', category: 'Cylinder / tank', name: 'Double HP100s', configuration: 'Manifolded doubles', accessoryItemIds: ['c1', 'c2'] },
  { id: 's1', category: 'Cylinder / tank', name: 'Sidemount L', serialNumber: 'S1' },
  { id: 's2', category: 'Cylinder / tank', name: 'Sidemount R', serialNumber: 'S2' },
  { id: 'sm', category: 'Cylinder / tank', name: 'SM pair', configuration: 'Sidemount pair', accessoryItemIds: ['s1', 's2'] },
  { id: 'old', category: 'Cylinder / tank', name: 'Old steel', condition: 'Retired' },
  { id: 'reg', category: 'Regulator', name: 'Reg' },
  { id: 'ov', category: 'Cylinder / tank', name: 'AL80', visualInspectionDue: '2020-01-01' },
] };
const tanks = log.lockerTanks(gear, new Date('2026-11-10T12:00:00Z'));
assert.deepEqual(tanks.map((t) => t.label), ['AL80', 'Double HP100s', 'Sidemount L', 'Sidemount R']);
assert.equal(tanks.find((t) => t.label === 'Double HP100s').serial, 'L1 / R1');
assert.match(tanks.find((t) => t.label === 'AL80').service.label, /VISUAL INSPECTION OVERDUE/);

// Facility entries, validation and exports.
assert.deepEqual(Object.keys(log.validateFacilityDraft({})).sort(), ['certNumber', 'diverName', 'initials', 'pressure', 'serial']);
const draft = { serial: 'FS-1', size: 'AL80', pressure: '3000', requestedO2: '36', diverName: 'Sam Diver', agency: 'PADI', certNumber: 'N-77, "x"', initials: 'sd' };
assert.deepEqual(log.validateFacilityDraft(draft), {});
const f1 = log.buildFacilityEntry({ result, draft, pressureUnit: 'psi', signature: { width: 300, height: 150, paths: ['M1 1 L5 5'] }, at: '2026-11-10T09:00:00Z' });
assert.equal(f1.initials, 'SD');
assert.deepEqual(log.mixDiscrepancy(f1), { expected: 36, diff: -4 });
const csv = log.facilityCsv([f1, p1]);
assert.equal(csv.split('\n').length, 2, 'CSV has header + facility rows only');
assert.match(csv, /"N-77, ""x"""/, 'CSV escapes commas and quotes');
const html = log.facilityHtml([f1], { facilityName: 'Dock <B>' });
assert.match(html, /Dock &lt;B&gt;/, 'HTML escapes facility name');
assert.match(html, /<path d="M1 1 L5 5"/, 'signature embedded');
assert.match(html, /32\.0%/);
assert.equal(log.mixName(20.9), 'Air');
assert.equal(log.mixName(32.2), 'EAN32');

// ---- Send gas to computer (pre-dive setup).
const pd = loadSourceModule(path.join(root, 'src/features/diveComputerDownload/predive.js'), path.join(root, 'src'));
assert.equal(pd.gasPercent(32.4), 32);
assert.equal(pd.gasPercent(32.5), 33);
const ostc = pd.predivePlan({ gasSyncSupported: true, timeSyncSupported: true }, 32.1);
assert.equal(ostc.canSend, true);
assert.equal(ostc.label, 'Send 32% + set clock');
const shearwater = pd.predivePlan({ gasSyncSupported: false, timeSyncSupported: true }, 32.1);
assert.equal(shearwater.label, 'Set computer clock');
assert.match(shearwater.note, /set 32% on the computer itself/);
const pelagic = pd.predivePlan({ gasSyncSupported: false, timeSyncSupported: false }, 32.1);
assert.equal(pelagic.canSend, false, 'nothing to send — by-hand confirmation only');

const sent = pd.describePredive({ gas: { status: 'set', slot: 1, previous: { o2: 21, he: 0 } }, clock: { status: 'set' } }, 32);
assert.equal(sent.gasSet, true);
assert.equal(sent.clockSet, true);
assert.match(sent.lines[0].text, /Gas 1 set to 32% O₂ \(was 21%\) and verified/);
const clockOnly = pd.describePredive({ gas: { status: 'unsupported' }, clock: { status: 'set' } }, 36);
assert.equal(clockOnly.gasSet, false);
assert.equal(clockOnly.lines[0].tone, 'warning');
assert.match(clockOnly.lines[0].text, /Set 36% on the computer by hand/);
const trimix = pd.describePredive({ gas: { status: 'error', message: 'Gas 1 is a trimix (21/35).' }, clock: { status: 'skipped' } }, 32);
assert.equal(trimix.gasSet, false);
assert.equal(trimix.lines.length, 1, 'skipped clock adds no line');
assert.equal(trimix.lines[0].tone, 'danger');

assert.deepEqual(log.computerSetupRecord({ gasSet: true, clockSet: true, computer: 'OSTC 4' }, 'T'), { at: 'T', computer: 'OSTC 4', method: 'sent', clockSet: true });
assert.equal(log.computerSetupRecord({ gasSet: false, confirmedByHand: true, computer: 'Perdix' }, 'T').method, 'by-hand');
assert.equal(log.computerSetupRecord(null), null);
const withSetup = log.buildPersonalEntry({ result, tank: { gearItemId: 'g1' }, setOnComputer: true, computerSetup: { gasSet: true, computer: 'OSTC 4' } });
assert.equal(withSetup.computerSetup.method, 'sent');

// The OSTC services are the only ones flagged for gas writes (source check:
// diveComputerBle.js imports react-native, so it can't be loaded in Node).
const bleSource = require('node:fs').readFileSync(path.join(root, 'src/features/diveComputerDownload/diveComputerBle.js'), 'utf8');
const gasLines = bleSource.split('\n').filter((line) => line.includes('gasSync: true'));
assert.equal(gasLines.length, 3);
assert.equal(gasLines.filter((line) => line.includes('Heinrichs-Weikamp')).length, 2);
assert.equal(gasLines.filter((line) => line.includes('Suunto EON Steel / EON Core / D5')).length, 1);

// Suunto: written but only confirmed after the computer's restart.
const pending = pd.describePredive({ gas: { status: 'pending', message: 'Sent 32%. Check it.' }, clock: { status: 'set' }, restarting: true }, 32);
assert.equal(pending.gasSet, false);
assert.equal(pending.gasPending, true);
assert.equal(pending.restarting, true);
assert.equal(pending.lines[0].tone, 'warning');
assert.match(pending.lines[2].text, /restarting to apply/);
const suuntoSet = pd.describePredive({ gas: { status: 'set', slot: 1, previous: { o2: 36, he: 0 } }, clock: { status: 'set' }, restarting: true }, 32);
assert.equal(suuntoSet.gasSet, true);
assert.match(suuntoSet.lines[0].text, /set to 32% O₂ \(was 36%\) and verified/);

// Same-value write (Peregrine first test / Suunto already set): reported as already set, verified.
const same = pd.describePredive({ gas: { status: 'set', unchanged: true, previous: { o2: 36, he: 0 } }, clock: { status: 'set' } }, 36);
assert.equal(same.gasSet, true);
assert.match(same.lines[0].text, /set to 36% O₂ \(checked by reading it back\)/);

console.log('Nitrox analyzer protocol and O2 math verified.');
console.log('Nitrox analysis capture and log model verified.');
