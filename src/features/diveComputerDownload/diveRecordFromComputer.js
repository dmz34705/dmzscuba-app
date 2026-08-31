// Pure mapping from libdivecomputer's parsed dive (as delivered by the native
// bridge's `onDownloadDive` event) to a dive-record partial for
// `useDiveLog.addDive`. No React, no native — unit-tested in Node.
//
// libdivecomputer field/sample reference: docs/LOGBOOK_PLAN.md "libdivecomputer
// -> schema mapping".

import { defaultGasLabel } from '../../lib/diveLog/schema';

// SAMPLE_EVENT_* (parser.h) -> our profile event types. Unlisted events (and
// SAMPLE_EVENT_NONE / the deprecated gaschange entries) are dropped.
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
    // No timezone from the device: interpret the wall clock in the phone's zone.
    const local = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
    return Number.isNaN(local.getTime()) ? '' : local.toISOString();
  }
  // Wall clock is at offset `tz` seconds; convert to the real UTC instant.
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
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return Math.round(median);
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

export function diveRecordFromComputer(raw, device = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawSamples = Array.isArray(source.samples) ? source.samples : [];
  const samples = rawSamples.map(mapSample).sort((a, b) => a.t - b.t);
  const mixesRaw = Array.isArray(source.gasmixes) && source.gasmixes.length
    ? source.gasmixes
    : [{ oxygen: 0.21, helium: 0 }];
  const mixes = mixesRaw.map(mapMix);

  const deepestSample = samples.reduce((max, s) => Math.max(max, num(s.depth) ?? 0), 0);
  const spanSeconds = samples.length >= 2 ? samples[samples.length - 1].t - samples[0].t : 0;

  const startTime = computerDatetimeToIso(source.datetime);
  const tz = num(source.datetime?.timezone);

  return {
    source: 'computer',
    device: {
      vendor: device.vendor || '',
      product: device.product || '',
      serial: device.serial || null,
      fingerprint: typeof source.fingerprint === 'string' ? source.fingerprint : null,
    },
    startTime,
    timezoneOffsetMinutes: tz === null ? null : Math.round(tz / 60),
    durationSeconds: num(source.divetimeSeconds) || spanSeconds || 0,
    surfaceIntervalSeconds: null,
    site: {
      name: '',
      location: '',
      country: '',
      latitude: num(source.location?.latitude),
      longitude: num(source.location?.longitude),
    },
    water: {
      type: source.salinity === 'salt' || source.salinity === 'fresh' ? source.salinity : null,
      maxDepthMeters: num(source.maxDepthMeters) ?? deepestSample ?? 0,
      avgDepthMeters: num(source.avgDepthMeters),
      tempSurfaceC: num(source.tempSurfaceC),
      tempMinC: num(source.tempMinC),
      tempMaxC: num(source.tempMaxC),
      visibilityMeters: null,
    },
    atmosphericBar: num(source.atmosphericBar),
    gas: {
      mixes,
      tanks: (Array.isArray(source.tanks) ? source.tanks : []).map((tank) => ({
        volumeLiters: num(tank?.volumeLiters) || null,
        workPressureBar: num(tank?.workPressureBar) || null,
        startBar: num(tank?.beginPressureBar) || null,
        endBar: num(tank?.endPressureBar) || null,
        mixIndex: num(tank?.gasmix) ?? 0,
      })),
    },
    diveMode: ['oc', 'ccr', 'scr', 'gauge', 'freedive'].includes(source.diveMode) ? source.diveMode : null,
    decoModel: source.decoModel && typeof source.decoModel === 'object'
      ? { type: source.decoModel.type, gfLow: num(source.decoModel.gfLow), gfHigh: num(source.decoModel.gfHigh) }
      : null,
    profile: {
      sampleIntervalSeconds: medianSampleInterval(samples),
      samples,
      events: mapEvents(source.events, mixes),
    },
  };
}

/** Stable key for de-duplicating downloaded dives across sessions. */
export function computerDiveKey(vendor, product, fingerprint) {
  if (!fingerprint) return null;
  return `${vendor || ''}|${product || ''}|${fingerprint}`;
}
