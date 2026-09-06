// Device-independent logbook interchange/export formats.

import { normalizeComputerLog, normalizeDive, SCHEMA_VERSION } from './schema';

export const JSON_BACKUP_FORMAT = 'dmz-scuba-dive-log';
export const JSON_BACKUP_VERSION = 2;

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function text(tag, value) {
  return value == null || value === '' ? '' : `<${tag}>${xml(value)}</${tag}>`;
}

function asBundles(input) {
  if (Array.isArray(input)) return input.map((item) => item?.dive ? item : { dive: item, logs: [] });
  return Array.isArray(input?.bundles) ? input.bundles : [];
}

function logsFor(bundle, logsByDive) {
  if (Array.isArray(bundle.logs)) return bundle.logs;
  if (logsByDive instanceof Map) return logsByDive.get(bundle.dive?.id) || [];
  return logsByDive?.[bundle.dive?.id] || [];
}

export function createJsonBackup({ dives = [], logs = [], exportedAt = new Date().toISOString() } = {}) {
  return {
    format: JSON_BACKUP_FORMAT,
    version: JSON_BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    dives: dives.map(normalizeDive),
    computerLogs: logs.map(normalizeComputerLog),
  };
}

export function stringifyJsonBackup(input) {
  return JSON.stringify(createJsonBackup(input), null, 2);
}

export function createJsonExport({ dives = [], logs = [], detail = 'full', exportedAt = new Date().toISOString() } = {}) {
  const normalizedLogs = logs.map(normalizeComputerLog);
  return {
    format: JSON_BACKUP_FORMAT,
    version: JSON_BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportType: 'dive-export',
    detail: detail === 'full' ? 'full' : 'summary',
    exportedAt,
    dives: dives.map(normalizeDive),
    computerLogs: detail === 'full' ? normalizedLogs : normalizedLogs.map((log) => ({
      ...log,
      profile: { ...log.profile, samples: [], events: [] },
    })),
  };
}

export function stringifyJsonExport(input) {
  return JSON.stringify(createJsonExport(input), null, 2);
}

export function parseJsonBackup(raw) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error('The backup file is not valid JSON.'); }
  if (!parsed || parsed.format !== JSON_BACKUP_FORMAT || parsed.version !== JSON_BACKUP_VERSION) {
    throw new Error('Unsupported DMZ Scuba backup format.');
  }
  const dives = Array.isArray(parsed.dives) ? parsed.dives.map(normalizeDive) : [];
  const computerLogs = Array.isArray(parsed.computerLogs) ? parsed.computerLogs.map(normalizeComputerLog) : [];
  return { ...parsed, dives, computerLogs };
}

export function csvCell(value) {
  const textValue = value == null ? '' : String(value);
  return /[",\n\r]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

export const CSV_COLUMNS = Object.freeze([
  'id', 'number', 'date', 'site', 'location', 'country', 'mode', 'types', 'duration_seconds',
  'max_depth_m', 'avg_depth_m', 'water', 'min_temp_c', 'visibility_m', 'gas', 'cylinders',
  'rating', 'buddies', 'operator', 'tags', 'notes', 'source', 'computer_logs',
]);

export function exportDivesToCsv(input, { detail = 'summary' } = {}) {
  const full = detail === 'full';
  const columns = full
    ? [...CSV_COLUMNS, 'computer_log_id', 'sample_t_seconds', 'sample_depth_m', 'sample_temp_c', 'sample_pressure_bar', 'sample_setpoint', 'sample_ppo2', 'sample_cns', 'sample_ndl_seconds', 'sample_deco_type', 'sample_deco_depth_m', 'sample_deco_seconds']
    : CSV_COLUMNS;
  const rows = [columns.join(',')];
  for (const bundle of asBundles(input)) {
    const dive = normalizeDive(bundle.dive);
    const logs = logsFor(bundle, input?.logsByDive);
    const mix = dive.gas.mixes[0];
    const values = [
      dive.id, dive.number, dive.startTime, dive.site.name, dive.site.location, dive.site.country,
      dive.diveMode, dive.types.join(';'), dive.durationSeconds, dive.water.maxDepthMeters,
      dive.water.avgDepthMeters, dive.water.type, dive.water.tempMinC, dive.water.visibilityMeters,
      mix?.label, dive.gas.tanks.length, dive.rating, dive.buddies.join(';'), dive.operator,
      dive.tags.join(';'), dive.notes, dive.source, logs.length,
    ];
    if (!full) rows.push(values.map(csvCell).join(','));
    else {
      const samples = logs.flatMap((rawLog) => {
        const log = normalizeComputerLog(rawLog);
        return (log.profile.samples.length ? log.profile.samples : [null]).map((sample) => ({ log, sample }));
      });
      for (const { log, sample } of samples.length ? samples : [{ log: null, sample: null }]) {
        const extra = [log?.id, sample?.t, sample?.depth, sample?.tempC, sample?.pressureBar, sample?.setpoint, sample?.ppo2, sample?.cns, sample?.ndl, sample?.deco?.type, sample?.deco?.depth, sample?.deco?.seconds];
        rows.push([...values, ...extra].map(csvCell).join(','));
      }
    }
  }
  return `${rows.join('\n')}\n`;
}

export function exportDivesToUddf(input, { detail = 'full', exportedAt = new Date().toISOString() } = {}) {
  const full = detail === 'full';
  const bundles = asBundles(input);
  const mixMap = new Map();
  for (const bundle of bundles) {
    const dive = normalizeDive(bundle.dive);
    for (const mix of dive.gas.mixes) {
      const id = `mix-${Math.round(mix.o2 * 100)}-${Math.round(mix.he * 100)}`;
      if (!mixMap.has(id)) mixMap.set(id, { ...mix, id });
    }
  }
  const gasDefinitions = [...mixMap.values()].map((mix) => [
    `<mix id="${xml(mix.id)}">`, text('name', mix.label), text('o2', mix.o2.toFixed(3)),
    text('n2', Math.max(0, 1 - mix.o2 - mix.he).toFixed(3)), text('he', mix.he.toFixed(3)),
    text('ar', '0.000'), text('h2', '0.000'), '</mix>',
  ].join('')).join('');
  const dives = bundles.map((bundle) => {
    const dive = normalizeDive(bundle.dive);
    const logs = logsFor(bundle, input?.logsByDive).map(normalizeComputerLog);
    const log = logs[0];
    const samples = log?.profile?.samples || [];
    const cylinders = dive.gas.tanks.map((tank, index) => {
      const mix = dive.gas.mixes[tank.mixIndex] || dive.gas.mixes[0];
      return `<tankdata>${text('volume', tank.volumeLiters)}${text('workingpressure', tank.workPressureBar)}${text('beginpressure', tank.startBar)}${text('endpressure', tank.endBar)}${text('link', `mix-${Math.round(mix.o2 * 100)}-${Math.round(mix.he * 100)}`)}</tankdata>`;
    }).join('');
    const waypoints = full ? samples.map((sample) => `<waypoint>${text('divetime', sample.t)}${text('depth', sample.depth)}${text('temperature', sample.tempC)}${text('pressure', sample.pressureBar)}${text('setpoint', sample.setpoint)}${text('ppo2', sample.ppo2)}${text('rbt', sample.rbt)}${text('cns', sample.cns)}${sample.deco ? `<deco>${text('type', sample.deco.type)}${text('depth', sample.deco.depth)}${text('seconds', sample.deco.seconds)}</deco>` : ''}</waypoint>`).join('') : '';
    const events = full ? (log?.profile?.events || []).map((event) => `<event>${text('divetime', event.t)}${text('type', event.type)}${text('note', event.note)}</event>`).join('') : '';
    const water = dive.water;
    return `<dive id="${xml(dive.id)}"><informationbeforedive>${text('datetime', dive.startTime)}${text('divenumber', dive.number)}${text('duration', dive.durationSeconds)}${text('surfaceinterval', dive.surfaceIntervalSeconds)}${text('atmosphericpressure', dive.atmosphericBar)}${text('divemode', dive.diveMode)}${text('watertype', water.type)}${text('tempsurface', water.tempSurfaceC)}${text('tempmin', water.tempMinC)}${text('tempmax', water.tempMaxC)}${text('visibility', water.visibilityMeters)}${text('decomodel', dive.decoModel?.type)}${text('rating', dive.rating)}${text('notes', dive.notes)}<divesite>${text('name', dive.site.name)}${text('location', dive.site.location)}${text('country', dive.site.country)}${text('latitude', dive.site.latitude)}${text('longitude', dive.site.longitude)}</divesite><buddies>${dive.buddies.map((b) => text('buddy', b)).join('')}</buddies><operator>${xml(dive.operator)}</operator></informationbeforedive><gasdefinitions>${cylinders}</gasdefinitions><samples>${waypoints}</samples>${events}<tags>${dive.tags.map((tag) => text('tag', tag)).join('')}</tags></dive>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<uddf version="3.2.3"><generator>${text('name', 'DMZ Scuba')}<datetime>${xml(exportedAt)}</datetime></generator><gasdefinitions>${gasDefinitions}</gasdefinitions><profiledata><repetitiongroup id="dmz-scuba-export">${dives}</repetitiongroup></profiledata></uddf>`;
}
