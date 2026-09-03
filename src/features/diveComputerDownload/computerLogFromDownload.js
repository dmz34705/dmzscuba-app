// Pure mapping from libdivecomputer's parsed dive (the native bridge's
// `onDownloadDive` event) to a ComputerLog partial for the logbook store.
// No React, no native — unit-tested in Node.
//
// A ComputerLog is one download from one physical computer; the logbook attaches
// it to a Dive (creating one if the cross-computer matcher finds no match).

import { computerDiveKeyOf, defaultGasLabel } from '../../lib/diveLog/schema';
import { computeLogAnalytics } from '../../lib/diveLog/logAnalytics';

// SAMPLE_EVENT_* (parser.h) -> our profile event types.
const SAMPLE_EVENT_TYPES = {
  1: 'decostop',
  3: 'ascent',
  4: 'ceiling',
  7: 'violation',
  8: 'bookmark',
  9: 'surface',
  10: 'safetystop',
  12: 'safetystop',
  13: 'safetystop',
  14: 'deepstop',
  20: 'po2',
};

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function computerDatetimeToIso(datetime) {
  if (!datetime) return '';
  const { year, month, day, hour, minute, second, timezone } = datetime;
  if (!year || !month || !day) return '';
  const tz = num(timezone);
  if (tz === null) {
    const local = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
    return Number.isNaN(local.getTime()) ? '' : local.toISOString();
  }
  const utcMs = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0) - tz * 1000;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function medianSampleInterval(samples) {
  if (samples.length < 2) return null;
  const deltas = [];
  for (let i = 1; i < samples.length; i += 1) {
    const d = samples[i].t - samples[i - 1].t;
    if (d > 0) deltas.push(d);
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return Math.round(deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2);
}

function mapMix(mix) {
  const o2 = num(mix?.oxygen) ?? 0.21;
  const he = num(mix?.helium) ?? 0;
  return { o2, he, label: defaultGasLabel(o2, he) };
}

function mapSample(raw) {
  const sample = { t: num(raw?.t) ?? 0 };
  if (num(raw?.depth) !== null) sample.depth = raw.depth;
  if (num(raw?.tempC) !== null) sample.tempC = raw.tempC;
  if (num(raw?.pressureBar) !== null) sample.pressureBar = raw.pressureBar;
  if (num(raw?.ppo2) !== null) sample.ppo2 = raw.ppo2;
  if (num(raw?.cns) !== null) sample.cns = raw.cns;
  if (num(raw?.ndl) !== null) sample.ndl = raw.ndl;
  if (raw?.deco && typeof raw.deco === 'object') {
    sample.deco = {
      type: raw.deco.type || 'ndl',
      depth: num(raw.deco.depth) ?? 0,
      seconds: num(raw.deco.seconds) ?? 0,
    };
  }
  return sample;
}

function mapEvents(rawEvents, mixes) {
  const out = [];
  for (const event of Array.isArray(rawEvents) ? rawEvents : []) {
    const t = num(event?.t) ?? 0;
    if (event?.type === 'gaschange') {
      const mix = mixes[event.gasmix];
      out.push({ t, type: 'gaschange', note: mix ? mix.label : '' });
      continue;
    }
    const mapped = SAMPLE_EVENT_TYPES[event?.eventType];
    if (mapped) out.push({ t, type: mapped });
  }
  return out;
}

// Only keep tank data that came from a real transmitter/POD: libdivecomputer
// reports begin/end pressure of 0 when nothing was paired. Volume alone (from the
// tank config on the computer) is kept so a user can confirm the size.
function mapTanks(rawTanks) {
  return (Array.isArray(rawTanks) ? rawTanks : [])
    .map((tank) => ({
      volumeLiters: num(tank?.volumeLiters) || null,
      workPressureBar: num(tank?.workPressureBar) || null,
      startBar: num(tank?.beginPressureBar) || null,
      endBar: num(tank?.endPressureBar) || null,
      mixIndex: num(tank?.gasmix) ?? 0,
    }))
    .filter((t) => t.startBar || t.endBar || t.volumeLiters || t.workPressureBar);
}

/**
 * @param {object} raw   native onDownloadDive payload
 * @returns {object}      ComputerLog partial for schema.createComputerLog
 */
export function computerLogFromDownload(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const vendor = source.vendor || '';
  const product = source.product || '';

  const rawSamples = Array.isArray(source.samples) ? source.samples : [];
  const samples = rawSamples.map(mapSample).sort((a, b) => a.t - b.t);
  const mixesRaw = Array.isArray(source.gasmixes) && source.gasmixes.length
    ? source.gasmixes
    : [{ oxygen: 0.21, helium: 0 }];
  const mixes = mixesRaw.map(mapMix);
  const events = mapEvents(source.events, mixes);
  const tanks = mapTanks(source.tanks);

  const deepestSample = samples.reduce((max, s) => Math.max(max, num(s.depth) ?? 0), 0);
  const spanSeconds = samples.length >= 2 ? samples[samples.length - 1].t - samples[0].t : 0;
  const durationSeconds = num(source.divetimeSeconds) || spanSeconds || 0;
  const maxDepthMeters = num(source.maxDepthMeters) ?? deepestSample ?? 0;
  const avgDepthMeters = num(source.avgDepthMeters);

  const reportedStartTime = computerDatetimeToIso(source.datetime);
  const tz = num(source.datetime?.timezone);

  const decoModel = source.decoModel && typeof source.decoModel === 'object'
    ? {
      type: source.decoModel.type,
      gfLow: num(source.decoModel.gfLow),
      gfHigh: num(source.decoModel.gfHigh),
      conservatism: num(source.decoModel.conservatism),
    }
    : null;

  const analytics = computeLogAnalytics({
    samples,
    decoModel,
    durationSeconds,
    avgDepthMeters,
    tank: tanks[0] || null,
  });

  return {
    device: {
      vendor,
      product,
      serial: source.serial ? String(source.serial) : '',
    },
    fingerprint: typeof source.fingerprint === 'string' ? source.fingerprint : null,
    reportedStartTime,
    timezoneOffsetMinutes: tz === null ? null : Math.round(tz / 60),
    durationSeconds,
    surfaceIntervalSeconds: null,
    water: {
      type: source.salinity === 'salt' || source.salinity === 'fresh' ? source.salinity : null,
      maxDepthMeters,
      avgDepthMeters,
      tempSurfaceC: num(source.tempSurfaceC),
      tempMinC: num(source.tempMinC),
      tempMaxC: num(source.tempMaxC),
      visibilityMeters: null,
    },
    atmosphericBar: num(source.atmosphericBar),
    gas: { mixes, tanks },
    diveMode: ['oc', 'ccr', 'scr', 'gauge', 'freedive'].includes(source.diveMode) ? source.diveMode : null,
    decoModel: decoModel && ['buhlmann', 'vpm', 'rgbm', 'dciem'].includes(decoModel.type) ? decoModel : null,
    profile: {
      sampleIntervalSeconds: medianSampleInterval(samples),
      samples,
      events,
    },
    analytics,
    deviceMeta: {
      firmware: source.firmware ? String(source.firmware) : '',
      hardwareModel: source.hardwareModel ? String(source.hardwareModel) : '',
      serialRaw: source.serial ? String(source.serial) : '',
      batteryPct: num(source.batteryPct),
    },
  };
}

/** Stable de-dup key for one downloaded dive on one model. */
export function computerDiveKey(vendor, product, fingerprint) {
  return computerDiveKeyOf({ vendor, product }, fingerprint);
}
