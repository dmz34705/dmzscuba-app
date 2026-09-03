// Dive logbook data model (schemaVersion 2).
//
// Framework-independent. Canonical storage units are SI: metres, seconds, °C,
// bar, litres, kg. Every conversion happens at the presentation edge in
// ./format.js.
//
// v2 splits the old flat record into two types:
//   Dive        - the canonical, user-facing, *counted* unit. One per real dive.
//   ComputerLog - one download from one physical computer, attached to a Dive.
// A Dive with several logs (e.g. two computers, or one computer that split a
// dive another saw as one) is still a single dive. See docs/LOGBOOK_PLAN.md
// "Part B continued".
//
// The v1 shape (`normalizeDiveRecord`) is retained for the one-time migration.

export const SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;

export const DIVE_TYPES = Object.freeze([
  'training', 'fun', 'night', 'wreck', 'drift', 'deep', 'deco', 'boat', 'shore', 'cave', 'ice', 'altitude', 'photo',
]);

export const WATER_TYPES = Object.freeze(['salt', 'fresh']);

export const DIVE_MODES = Object.freeze(['oc', 'ccr', 'scr', 'gauge', 'freedive']);

export const DECO_MODEL_TYPES = Object.freeze(['buhlmann', 'vpm', 'rgbm', 'dciem']);

export const DIVE_SOURCES = Object.freeze(['manual', 'import', 'computer', 'mixed']);

export const SYNC_STATUSES = Object.freeze(['local', 'pending', 'synced', 'conflict']);

export const DECO_SAMPLE_TYPES = Object.freeze(['ndl', 'safetystop', 'decostop', 'deepstop']);

export const DEFAULT_GAS_MIX = Object.freeze({ o2: 0.21, he: 0, label: 'Air' });

const MAX_DEPTH_METERS = 350;
const MAX_DURATION_SECONDS = 24 * 60 * 60;

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNum(value, min, max, fallback = null) {
  const parsed = num(value, null);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function intOrNull(value, min, max) {
  const parsed = num(value, null);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = str(item, '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

// v4-style id. Math.random is acceptable here: ids only need to be unique on one
// device, and the server assigns its own id on first sync.
export function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function defaultGasLabel(o2, he) {
  const oxygen = clampNum(o2, 0, 1, 0.21);
  const helium = clampNum(he, 0, 1, 0);
  if (helium > 0.005) return `TX ${Math.round(oxygen * 100)}/${Math.round(helium * 100)}`;
  if (Math.abs(oxygen - 0.21) < 0.005) return 'Air';
  if (Math.abs(oxygen - 1) < 0.005) return 'O₂';
  return `EAN${Math.round(oxygen * 100)}`;
}

function normalizeGasMix(raw) {
  const source = isObject(raw) ? raw : {};
  const o2 = clampNum(source.o2, 0, 1, 0.21);
  const he = clampNum(source.he, 0, 1, 0);
  const label = str(source.label, '').trim() || defaultGasLabel(o2, he);
  return { o2, he, label };
}

function normalizeTank(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    volumeLiters: clampNum(source.volumeLiters, 0, 100, null),
    workPressureBar: clampNum(source.workPressureBar, 0, 500, null),
    startBar: clampNum(source.startBar, 0, 500, null),
    endBar: clampNum(source.endBar, 0, 500, null),
    mixIndex: intOrNull(source.mixIndex, 0, 32) ?? 0,
  };
}

function normalizeDecoSample(raw) {
  if (!isObject(raw)) return undefined;
  const type = DECO_SAMPLE_TYPES.includes(raw.type) ? raw.type : 'ndl';
  return {
    type,
    depth: clampNum(raw.depth, 0, MAX_DEPTH_METERS, 0),
    seconds: clampNum(raw.seconds, 0, MAX_DURATION_SECONDS, 0),
  };
}

function normalizeSample(raw) {
  const source = isObject(raw) ? raw : {};
  const sample = {
    t: clampNum(source.t, 0, MAX_DURATION_SECONDS, 0),
    depth: clampNum(source.depth, 0, MAX_DEPTH_METERS, 0),
  };
  const tempC = num(source.tempC, null);
  if (tempC !== null) sample.tempC = tempC;
  const pressureBar = clampNum(source.pressureBar, 0, 500, null);
  if (pressureBar !== null) sample.pressureBar = pressureBar;
  if (isObject(source.pressuresByTank)) {
    const byTank = {};
    for (const [k, v] of Object.entries(source.pressuresByTank)) {
      const bar = clampNum(v, 0, 500, null);
      if (bar !== null) byTank[k] = bar;
    }
    if (Object.keys(byTank).length) sample.pressuresByTank = byTank;
  }
  const setpoint = clampNum(source.setpoint, 0, 5, null);
  if (setpoint !== null) sample.setpoint = setpoint;
  const rbt = clampNum(source.rbt, 0, MAX_DURATION_SECONDS, null);
  if (rbt !== null) sample.rbt = rbt;
  const ppo2 = clampNum(source.ppo2, 0, 5, null);
  if (ppo2 !== null) sample.ppo2 = ppo2;
  const cns = clampNum(source.cns, 0, 1000, null);
  if (cns !== null) sample.cns = cns;
  const ndl = clampNum(source.ndl, 0, MAX_DURATION_SECONDS, null);
  if (ndl !== null) sample.ndl = ndl;
  const deco = normalizeDecoSample(source.deco);
  if (deco) sample.deco = deco;
  return sample;
}

function normalizeEvent(raw) {
  const source = isObject(raw) ? raw : {};
  const event = {
    t: clampNum(source.t, 0, MAX_DURATION_SECONDS, 0),
    type: str(source.type, '').trim() || 'bookmark',
  };
  const note = str(source.note, '').trim();
  if (note) event.note = note;
  return event;
}

function normalizeProfile(raw) {
  const source = isObject(raw) ? raw : {};
  const samples = Array.isArray(source.samples)
    ? source.samples.map(normalizeSample).sort((a, b) => a.t - b.t)
    : [];
  const events = Array.isArray(source.events)
    ? source.events.map(normalizeEvent).sort((a, b) => a.t - b.t)
    : [];
  return {
    sampleIntervalSeconds: clampNum(source.sampleIntervalSeconds, 0, 600, null),
    samples,
    events,
  };
}

function normalizeSync(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    status: SYNC_STATUSES.includes(source.status) ? source.status : 'local',
    remoteId: str(source.remoteId, '') || null,
    syncedAt: str(source.syncedAt, '') || null,
  };
}

function normalizeDevice(raw) {
  if (!isObject(raw)) return null;
  return {
    vendor: str(raw.vendor, '').trim(),
    product: str(raw.product, '').trim(),
    serial: str(raw.serial, '').trim() || null,
    fingerprint: str(raw.fingerprint, '').trim() || null,
  };
}

function normalizeSite(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    name: str(source.name, '').trim(),
    location: str(source.location, '').trim(),
    country: str(source.country, '').trim(),
    latitude: clampNum(source.latitude, -90, 90, null),
    longitude: clampNum(source.longitude, -180, 180, null),
  };
}

function normalizeWater(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    type: WATER_TYPES.includes(source.type) ? source.type : null,
    maxDepthMeters: clampNum(source.maxDepthMeters, 0, MAX_DEPTH_METERS, 0) ?? 0,
    avgDepthMeters: clampNum(source.avgDepthMeters, 0, MAX_DEPTH_METERS, null),
    tempSurfaceC: num(source.tempSurfaceC, null),
    tempMinC: num(source.tempMinC, null),
    tempMaxC: num(source.tempMaxC, null),
    visibilityMeters: clampNum(source.visibilityMeters, 0, 200, null),
  };
}

function normalizeGas(raw) {
  const source = isObject(raw) ? raw : {};
  const mixes = Array.isArray(source.mixes) && source.mixes.length
    ? source.mixes.map(normalizeGasMix)
    : [{ ...DEFAULT_GAS_MIX }];
  const tanks = Array.isArray(source.tanks) ? source.tanks.map(normalizeTank) : [];
  return { mixes, tanks };
}

function normalizeDecoModel(raw) {
  if (!isObject(raw)) return null;
  if (!DECO_MODEL_TYPES.includes(raw.type)) return null;
  return {
    type: raw.type,
    gfLow: intOrNull(raw.gfLow, 0, 200),
    gfHigh: intOrNull(raw.gfHigh, 0, 200),
  };
}

function normalizeGear(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    weightKg: clampNum(source.weightKg, 0, 60, null),
    exposureSuit: str(source.exposureSuit, '').trim(),
    notes: str(source.notes, '').trim(),
  };
}

/**
 * Defensive normalizer. Clamps or defaults every field, drops unknown keys, and
 * returns a record that always matches the schemaVersion 1 shape.
 */
export function normalizeDiveRecord(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    id: str(source.id, '').trim() || createId(),
    createdAt: str(source.createdAt, '') || nowIso(),
    updatedAt: str(source.updatedAt, '') || nowIso(),
    deletedAt: str(source.deletedAt, '') || null,

    sync: normalizeSync(source.sync),

    source: DIVE_SOURCES.includes(source.source) ? source.source : 'manual',
    device: normalizeDevice(source.device),

    number: intOrNull(source.number, 0, 100000),
    startTime: str(source.startTime, ''),
    timezoneOffsetMinutes: intOrNull(source.timezoneOffsetMinutes, -840, 840),
    durationSeconds: clampNum(source.durationSeconds, 0, MAX_DURATION_SECONDS, 0) ?? 0,
    surfaceIntervalSeconds: clampNum(source.surfaceIntervalSeconds, 0, 7 * 24 * 60 * 60, null),

    site: normalizeSite(source.site),
    operator: str(source.operator, '').trim(),
    buddies: stringList(source.buddies),

    water: normalizeWater(source.water),
    atmosphericBar: clampNum(source.atmosphericBar, 0, 2, null),

    gas: normalizeGas(source.gas),

    diveMode: DIVE_MODES.includes(source.diveMode) ? source.diveMode : null,
    types: Array.isArray(source.types) ? DIVE_TYPES.filter((type) => source.types.includes(type)) : [],
    decoModel: normalizeDecoModel(source.decoModel),

    gear: normalizeGear(source.gear),

    rating: intOrNull(source.rating, 1, 5),
    notes: str(source.notes, '').trim(),
    tags: stringList(source.tags),

    profile: normalizeProfile(source.profile),
  };
}

/**
 * Builds a fresh record from a (possibly sparse) partial. Generates the id and
 * timestamps; everything else is normalized/defaulted.
 */
export function createDiveRecord(partial = {}) {
  const timestamp = nowIso();
  return normalizeDiveRecord({
    ...partial,
    id: partial.id || createId(),
    createdAt: partial.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: partial.deletedAt || null,
  });
}

/** Returns a copy with `updatedAt` bumped to now. */
export function touchRecord(record) {
  return { ...record, updatedAt: nowIso() };
}

// ---------------------------------------------------------------------------
// v2: ComputerLog — one download from one physical computer
// ---------------------------------------------------------------------------

const MAX_CORRECTION_MINUTES = 72 * 60; // a computer's clock can be a few days out

/** Shift an ISO timestamp by whole minutes; '' stays ''. */
export function shiftIso(iso, minutes) {
  const base = Date.parse(iso);
  if (Number.isNaN(base) || !minutes) return iso || '';
  return new Date(base + minutes * 60000).toISOString();
}

/** vendor|product|serial — identifies the physical unit (not the dive). */
export function deviceKeyOf(device) {
  const d = isObject(device) ? device : {};
  const vendor = str(d.vendor, '').trim();
  const product = str(d.product, '').trim();
  const serial = str(d.serial, '').trim();
  if (!vendor && !product) return null;
  return `${vendor}|${product}|${serial}`;
}

/** vendor|product|fingerprint — identifies one dive on one model (same-device de-dup). */
export function computerDiveKeyOf(device, fingerprint) {
  const fp = str(fingerprint, '').trim();
  if (!fp) return null;
  const d = isObject(device) ? device : {};
  return `${str(d.vendor, '').trim()}|${str(d.product, '').trim()}|${fp}`;
}

function normalizeLogDevice(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    vendor: str(source.vendor, '').trim(),
    product: str(source.product, '').trim(),
    serial: str(source.serial, '').trim(),
  };
}

function normalizeAnalytics(raw) {
  const s = isObject(raw) ? raw : {};
  return {
    gfLow: intOrNull(s.gfLow, 0, 200),
    gfHigh: intOrNull(s.gfHigh, 0, 200),
    decoModelType: DECO_MODEL_TYPES.includes(s.decoModelType) ? s.decoModelType : null,
    conservatism: intOrNull(s.conservatism, -5, 5),
    ceilingMaxMeters: clampNum(s.ceilingMaxMeters, 0, MAX_DEPTH_METERS, null),
    firstStopMeters: clampNum(s.firstStopMeters, 0, MAX_DEPTH_METERS, null),
    ndlMinAtStartSec: clampNum(s.ndlMinAtStartSec, 0, MAX_DURATION_SECONDS, null),
    cnsStartPct: clampNum(s.cnsStartPct, 0, 1000, null),
    cnsEndPct: clampNum(s.cnsEndPct, 0, 1000, null),
    otu: clampNum(s.otu, 0, 100000, null),
    ascentRateMaxMPerMin: clampNum(s.ascentRateMaxMPerMin, 0, 200, null),
    ascentRateViolations: intOrNull(s.ascentRateViolations, 0, 100000) ?? 0,
    sawtoothIndex: clampNum(s.sawtoothIndex, 0, 100000, null),
    sacBarPerMin: clampNum(s.sacBarPerMin, 0, 200, null),
    rmvLitersPerMin: clampNum(s.rmvLitersPerMin, 0, 200, null),
    safetyScore: intOrNull(s.safetyScore, 0, 100),
    safetyFlags: Array.isArray(s.safetyFlags) ? s.safetyFlags.filter((f) => typeof f === 'string').slice(0, 12) : [],
  };
}

function normalizeDeviceMeta(raw) {
  const s = isObject(raw) ? raw : {};
  return {
    firmware: str(s.firmware, '').trim(),
    serialRaw: str(s.serialRaw, '').trim(),
    hardwareModel: str(s.hardwareModel, '').trim(),
    batteryPct: clampNum(s.batteryPct, 0, 100, null),
  };
}

/**
 * Normalizer for a ComputerLog. Every field clamped/defaulted; the record always
 * matches the v2 shape. `startTime` is derived: reportedStartTime + correction.
 */
export function normalizeComputerLog(raw) {
  const source = isObject(raw) ? raw : {};
  const device = normalizeLogDevice(source.device);
  const reportedStartTime = str(source.reportedStartTime, '') || str(source.startTime, '');
  const timeCorrectionMinutes = intOrNull(source.timeCorrectionMinutes, -MAX_CORRECTION_MINUTES, MAX_CORRECTION_MINUTES) ?? 0;
  const water = normalizeWater(source.water);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(source.id, '').trim() || createId(),
    diveId: str(source.diveId, '').trim() || null,
    createdAt: str(source.createdAt, '') || nowIso(),
    updatedAt: str(source.updatedAt, '') || nowIso(),

    device,
    deviceKey: deviceKeyOf(device),
    fingerprint: str(source.fingerprint, '').trim() || null,
    downloadedAt: str(source.downloadedAt, '') || nowIso(),

    reportedStartTime,
    timeCorrectionMinutes,
    startTime: shiftIso(reportedStartTime, timeCorrectionMinutes),
    timezoneOffsetMinutes: intOrNull(source.timezoneOffsetMinutes, -840, 840),

    durationSeconds: clampNum(source.durationSeconds, 0, MAX_DURATION_SECONDS, 0) ?? 0,
    surfaceIntervalSeconds: clampNum(source.surfaceIntervalSeconds, 0, 7 * 24 * 60 * 60, null),
    water,
    atmosphericBar: clampNum(source.atmosphericBar, 0, 2, null),
    gas: normalizeGas(source.gas),
    diveMode: DIVE_MODES.includes(source.diveMode) ? source.diveMode : null,
    decoModel: normalizeDecoModel(source.decoModel),

    profile: normalizeProfile(source.profile),
    analytics: normalizeAnalytics(source.analytics),
    deviceMeta: normalizeDeviceMeta(source.deviceMeta),

    splitOf: str(source.splitOf, '').trim() || null,
  };
}

export function createComputerLog(partial = {}) {
  const timestamp = nowIso();
  return normalizeComputerLog({
    ...partial,
    id: partial.id || createId(),
    createdAt: partial.createdAt || timestamp,
    updatedAt: timestamp,
    downloadedAt: partial.downloadedAt || timestamp,
  });
}

/** Re-derives `startTime` after a `timeCorrectionMinutes` change. */
export function withTimeCorrection(log, minutes) {
  const timeCorrectionMinutes = clampNum(minutes, -MAX_CORRECTION_MINUTES, MAX_CORRECTION_MINUTES, 0) ?? 0;
  return normalizeComputerLog({ ...log, timeCorrectionMinutes, updatedAt: nowIso() });
}

// ---------------------------------------------------------------------------
// v2: Dive — the canonical, counted record
// ---------------------------------------------------------------------------

/**
 * Normalizer for a Dive. Shares the field normalizers with v1 (site/water/gas/
 * gear/…) but drops `profile`/`device` (those live on the logs) and adds
 * `primaryLogId` / `logIds`.
 */
export function normalizeDive(raw) {
  const source = isObject(raw) ? raw : {};
  const logIds = Array.isArray(source.logIds)
    ? [...new Set(source.logIds.map((id) => str(id, '').trim()).filter(Boolean))]
    : [];
  const primaryLogId = str(source.primaryLogId, '').trim() || null;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(source.id, '').trim() || createId(),
    createdAt: str(source.createdAt, '') || nowIso(),
    updatedAt: str(source.updatedAt, '') || nowIso(),
    deletedAt: str(source.deletedAt, '') || null,

    sync: normalizeSync(source.sync),

    source: DIVE_SOURCES.includes(source.source) ? source.source : 'manual',
    primaryLogId: logIds.includes(primaryLogId) ? primaryLogId : (logIds[0] || null),
    logIds,

    number: intOrNull(source.number, 0, 100000),
    startTime: str(source.startTime, ''),
    timezoneOffsetMinutes: intOrNull(source.timezoneOffsetMinutes, -840, 840),
    durationSeconds: clampNum(source.durationSeconds, 0, MAX_DURATION_SECONDS, 0) ?? 0,
    surfaceIntervalSeconds: clampNum(source.surfaceIntervalSeconds, 0, 7 * 24 * 60 * 60, null),

    site: normalizeSite(source.site),
    operator: str(source.operator, '').trim(),
    buddies: stringList(source.buddies),

    water: normalizeWater(source.water),
    atmosphericBar: clampNum(source.atmosphericBar, 0, 2, null),
    gas: normalizeGas(source.gas),

    diveMode: DIVE_MODES.includes(source.diveMode) ? source.diveMode : null,
    types: Array.isArray(source.types) ? DIVE_TYPES.filter((type) => source.types.includes(type)) : [],
    decoModel: normalizeDecoModel(source.decoModel),

    gear: normalizeGear(source.gear),

    rating: intOrNull(source.rating, 1, 5),
    notes: str(source.notes, '').trim(),
    tags: stringList(source.tags),
  };
}

export function createDive(partial = {}) {
  const timestamp = nowIso();
  return normalizeDive({
    ...partial,
    id: partial.id || createId(),
    createdAt: partial.createdAt || timestamp,
    updatedAt: timestamp,
    deletedAt: partial.deletedAt || null,
  });
}

const LOG_SUMMARY_FIELDS = ['durationSeconds', 'surfaceIntervalSeconds', 'atmosphericBar', 'diveMode', 'decoModel', 'timezoneOffsetMinutes'];

/**
 * Fold a ComputerLog's field values onto a Dive as the surfaced summary. User-
 * owned fields (site, buddies, notes, rating, tags, types, gear) are never
 * touched. Called when a log becomes the Dive's primary.
 */
export function surfaceLogOntoDive(dive, log) {
  if (!log) return normalizeDive(dive);
  const merged = { ...dive };
  for (const key of LOG_SUMMARY_FIELDS) merged[key] = log[key];
  merged.startTime = log.startTime;
  merged.water = { ...dive.water, ...log.water };
  merged.gas = log.gas && (log.gas.mixes?.length || log.gas.tanks?.length) ? log.gas : dive.gas;
  merged.updatedAt = nowIso();
  return normalizeDive(merged);
}
