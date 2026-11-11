// Divesoft DNA nitrox analyzer: BLE protocol decoding and O2 math.
//
// Everything here is pure JS (no React Native imports) so it can be verified in
// Node by scripts/verify-nitrox-analyzer.cjs.
//
// Protocol notes (reverse engineered with nRF Connect, Nov 2026, DNA serial 004017):
//   Advertised service:  0xFCEF (shared with Divesoft dive computers)
//   Measurement service: 0BCB0001-0BE0-4C5A-8F2B-CCB9E8CDBB1F
//   Measurement char:    0BCB0002-…  Read + Notify, 8 bytes, e.g. 04 01 48 03 49 03 BF 27
//   Battery:             standard 0x180F / 0x2A19
// Decoded as little-endian uint16 words:
//   [0] header (04 01) — meaning unknown, kept raw
//   [1] 840  — O2 sensor signal, believed to be 0.01 mV units (8.40 mV in air)
//   [2] 841  — second O2 signal (raw vs. filtered?), averaged with [1]
//   [3] 10175 — ambient pressure in 0.1 mbar (1017.5 mbar)
// The O2 % math is a ratio against the air calibration, so it is correct even if
// the 0.01 mV scale guess turns out wrong — only the displayed mV would change.

export const DNA_ADVERTISED_SERVICE = '0000fcef-0000-1000-8000-00805f9b34fb';
export const DNA_MEASUREMENT_SERVICE = '0bcb0001-0be0-4c5a-8f2b-ccb9e8cdbb1f';
export const DNA_MEASUREMENT_CHAR = '0bcb0002-0be0-4c5a-8f2b-ccb9e8cdbb1f';
export const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_CHAR = '00002a19-0000-1000-8000-00805f9b34fb';
export const DEVICE_INFO_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
export const SERIAL_NUMBER_CHAR = '00002a25-0000-1000-8000-00805f9b34fb';

export const AIR_O2_PERCENT = 20.9;
export const SIGNAL_SCALE_MV = 0.01; // unconfirmed: one raw unit = 0.01 mV
export const PRESSURE_SCALE_MBAR = 0.1;

// A galvanic cell below ~7 mV in air is near end of life; ~9–13 mV is typical new.
export const CELL_WEAK_MV = 7;
export const CELL_LOW_MV = 8;

// A reading is "stable" when the smoothed O2 % holds within this band for this long.
export const STABLE_WINDOW_MS = 3000;
export const STABLE_BAND_PERCENT = 0.1;

// The cell signal jitters by a few raw units (e.g. 10.15 ↔ 10.20 mV) packet to
// packet. Averaging over this window removes that noise before display,
// stability and calibration, while still following a real gas change within ~2 s.
export const SMOOTHING_WINDOW_MS = 2000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes a base64 string (what react-native-ble-plx hands back) to bytes. */
export function base64ToBytes(input) {
  const clean = String(input || '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes || [], (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const u16 = (bytes, i) => bytes[i] | (bytes[i + 1] << 8);

/**
 * Parses one 0BCB0002 measurement packet. Returns null for anything that is not
 * the 8-byte shape we have seen, so an unexpected firmware format fails loudly
 * in the UI instead of producing a plausible-looking wrong O2 number.
 */
export function parseMeasurement(bytes) {
  if (!bytes || bytes.length !== 8) return null;
  const signalA = u16(bytes, 2);
  const signalB = u16(bytes, 4);
  const pressureRaw = u16(bytes, 6);
  const signal = (signalA + signalB) / 2;
  return {
    hex: bytesToHex(bytes),
    header: [bytes[0], bytes[1]],
    signalA,
    signalB,
    signal,
    millivolts: signal * SIGNAL_SCALE_MV,
    pressureMbar: pressureRaw * PRESSURE_SCALE_MBAR,
  };
}

export function parseMeasurementBase64(value) {
  return parseMeasurement(base64ToBytes(value));
}

const plausiblePressure = (mbar) => Number.isFinite(mbar) && mbar >= 700 && mbar <= 1200;

/**
 * Averages raw packets [{ t, m }] (oldest first, m = parseMeasurement output)
 * over the last `windowMs`. If no packet arrived in the window (an analyzer
 * that only notifies on change), the latest packet carries forward. Returns a
 * measurement-shaped object, or null with no packets at all.
 */
export function averageMeasurement(samples, now = Date.now(), windowMs = SMOOTHING_WINDOW_MS) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  let recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length === 0) recent = [samples[samples.length - 1]];
  const mean = (pick) => recent.reduce((sum, s) => sum + pick(s.m), 0) / recent.length;
  const signal = mean((m) => m.signal);
  return {
    signal,
    millivolts: signal * SIGNAL_SCALE_MV,
    pressureMbar: mean((m) => m.pressureMbar),
    sampleCount: recent.length,
  };
}

/** Builds an air calibration from a (stable) measurement. */
export function makeCalibration(measurement, { referencePercent = AIR_O2_PERCENT, at = new Date().toISOString() } = {}) {
  if (!measurement || !(measurement.signal > 0)) return null;
  return {
    signal: measurement.signal,
    millivolts: measurement.millivolts,
    pressureMbar: plausiblePressure(measurement.pressureMbar) ? measurement.pressureMbar : null,
    referencePercent,
    at,
  };
}

/**
 * O2 % = ref% × (signal / signal_cal) × (P_cal / P_now).
 * The cell measures O2 partial pressure, so a pressure change since calibration
 * is corrected for when both pressures are plausible.
 */
export function oxygenPercent(measurement, calibration) {
  if (!measurement || !calibration || !(calibration.signal > 0)) return null;
  let percent = calibration.referencePercent * (measurement.signal / calibration.signal);
  if (plausiblePressure(calibration.pressureMbar) && plausiblePressure(measurement.pressureMbar)) {
    percent *= calibration.pressureMbar / measurement.pressureMbar;
  }
  return percent;
}

/** Cell health judged from the air-calibration millivolts. */
export function cellHealth(calibration) {
  const mv = calibration?.millivolts;
  if (!Number.isFinite(mv)) return { tone: 'info', label: 'Not calibrated' };
  if (mv < CELL_WEAK_MV) return { tone: 'danger', label: 'Cell weak — replace sensor' };
  if (mv < CELL_LOW_MV) return { tone: 'warning', label: 'Cell getting low' };
  return { tone: 'good', label: 'Cell healthy' };
}

/**
 * Given recent samples [{ t, value }] (oldest first), returns whether the value
 * has held within STABLE_BAND_PERCENT for the last STABLE_WINDOW_MS.
 */
export function isStable(samples, now = Date.now(), { windowMs = STABLE_WINDOW_MS, band = STABLE_BAND_PERCENT } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return false;
  const oldest = samples[0].t;
  if (now - oldest < windowMs) return false;
  const recent = samples.filter((s) => now - s.t <= windowMs && Number.isFinite(s.value));
  if (recent.length < 2) return false;
  const values = recent.map((s) => s.value);
  return Math.max(...values) - Math.min(...values) <= band;
}

/** Keeps only the samples needed for the stability window (plus a little slack). */
export function trimSamples(samples, now = Date.now(), windowMs = STABLE_WINDOW_MS) {
  const cutoff = now - windowMs * 2;
  return samples.filter((s) => s.t >= cutoff);
}

/** Maximum operating depth for an O2 fraction at a PO2 limit, in metres of seawater. */
export function modMeters(o2Percent, maxPpo2 = 1.4) {
  if (!(o2Percent > 0)) return null;
  return (maxPpo2 / (o2Percent / 100) - 1) * 10;
}

export function formatDepth(meters, unit = 'ft') {
  if (!Number.isFinite(meters)) return '—';
  if (unit === 'm') return `${Math.floor(meters)} m`;
  return `${Math.floor(meters * 3.28084)} ft`;
}
