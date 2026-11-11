// Nitrox log model: personal + facility entries, tank lookup, exports.
// Pure JS (no React Native) — verified by scripts/verify-nitrox-analyzer.cjs.

import { isCylinderSet, serviceStatusForItem } from '../gearChecklist/model';
import { modMeters } from './model';

export const NITROX_LOG_VERSION = 1;
// A labeled mix more than this far from the analysis is a fill problem worth flagging.
export const LABEL_TOLERANCE = 1;
// Facility logs commonly accept ±1 % of the requested mix; anything else is re-filled.

export function createNitroxId(prefix = 'nx') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const normSerial = (s) => text(s).toUpperCase().replace(/\s+/g, '');

/** Stable identity for "the same tank" across analyses. */
export function tankKey(tank) {
  if (tank?.gearItemId) return `gear:${tank.gearItemId}`;
  const sn = normSerial(tank?.serial);
  return sn ? `sn:${sn}` : '';
}

export function emptyLogState() {
  return { version: NITROX_LOG_VERSION, entries: [], facility: { name: '' } };
}

export function normalizeLogState(raw) {
  const base = emptyLogState();
  if (!raw || typeof raw !== 'object') return base;
  const entries = Array.isArray(raw.entries) ? raw.entries.filter((e) => e && e.id && Number.isFinite(e.o2)) : [];
  return {
    version: NITROX_LOG_VERSION,
    entries: entries.sort((a, b) => String(b.at).localeCompare(String(a.at))),
    facility: { name: text(raw.facility?.name) },
  };
}

function analyzerSnapshot(analyzer) {
  if (!analyzer) return null;
  return {
    serial: text(analyzer.serial) || null,
    calibrationMv: Number.isFinite(analyzer.calibrationMv) ? analyzer.calibrationMv : null,
    calibratedAt: analyzer.calibratedAt || null,
  };
}

function common(result, { pressure, pressureUnit, analyzer, at }) {
  return {
    id: createNitroxId(),
    at: at || new Date().toISOString(),
    o2: result.o2,
    method: result.method || 'auto',
    analyzedAt: result.at ? new Date(result.at).toISOString() : null,
    mod14: modMeters(result.o2, 1.4),
    mod16: modMeters(result.o2, 1.6),
    pressure: num(pressure) != null ? { value: num(pressure), unit: pressureUnit === 'bar' ? 'bar' : 'psi' } : null,
    analyzer: analyzerSnapshot(analyzer),
  };
}

export function buildPersonalEntry({ result, tank, labeledO2, pressure, pressureUnit, fillStation, notes, setOnComputer, computerSetup, analyzer, at }) {
  const t = {
    source: tank?.gearItemId ? 'locker' : 'rental',
    gearItemId: tank?.gearItemId || null,
    label: text(tank?.label) || (tank?.serial ? `Tank ${text(tank.serial)}` : 'Tank'),
    serial: text(tank?.serial),
    size: text(tank?.size),
  };
  return {
    ...common(result, { pressure, pressureUnit, analyzer, at }),
    kind: 'personal',
    tank: { ...t, key: tankKey(t) },
    labeledO2: num(labeledO2),
    fillStation: text(fillStation),
    notes: text(notes),
    setOnComputer: Boolean(setOnComputer),
    computerSetup: computerSetupRecord(computerSetup),
    usedAt: null,
  };
}

/** How the gas got onto the dive computer: sent by the app, or set by hand. */
export function computerSetupRecord(outcome, at = new Date().toISOString()) {
  if (!outcome) return null;
  return {
    at: outcome.at || at,
    computer: text(outcome.computer) || null,
    method: outcome.gasSet ? 'sent' : 'by-hand',
    clockSet: Boolean(outcome.clockSet),
  };
}

export function validateFacilityDraft(draft) {
  const errors = {};
  if (!text(draft?.serial)) errors.serial = 'Tank serial number is required.';
  if (!text(draft?.diverName)) errors.diverName = 'Diver name is required.';
  if (!text(draft?.certNumber)) errors.certNumber = 'Nitrox certification number is required.';
  if (num(draft?.pressure) == null) errors.pressure = 'Fill pressure is required.';
  if (!text(draft?.initials)) errors.initials = 'Initials are required.';
  return errors;
}

export function buildFacilityEntry({ result, draft, pressureUnit, analyzer, signature, at }) {
  return {
    ...common(result, { pressure: draft.pressure, pressureUnit, analyzer, at }),
    kind: 'facility',
    tank: { serial: text(draft.serial), size: text(draft.size), key: tankKey({ serial: draft.serial }) },
    requestedO2: num(draft.requestedO2),
    diver: { name: text(draft.diverName), agency: text(draft.agency), certNumber: text(draft.certNumber) },
    initials: text(draft.initials).toUpperCase(),
    signature: signature?.paths?.length ? signature : null, // { width, height, paths: [svg path d] }
  };
}

/** The mix label or requested mix, if the analysis is outside tolerance of it. */
export function mixDiscrepancy(entry) {
  const expected = entry?.kind === 'facility' ? entry.requestedO2 : entry?.labeledO2;
  if (!Number.isFinite(expected) || !Number.isFinite(entry?.o2)) return null;
  const diff = Math.round((entry.o2 - expected) * 10) / 10;
  return Math.abs(diff) > LABEL_TOLERANCE ? { expected, diff } : null;
}

/** Latest personal analysis per tank key. */
export function latestByTank(entries) {
  const latest = new Map();
  for (const e of entries || []) {
    if (e.kind !== 'personal' || !e.tank?.key) continue;
    const prev = latest.get(e.tank.key);
    if (!prev || String(e.at) > String(prev.at)) latest.set(e.tank.key, e);
  }
  return latest;
}

/** Rental / non-locker tanks the diver has analyzed before, most recent first. */
export function recentRentalTanks(entries, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const e of [...(entries || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)))) {
    if (e.kind !== 'personal' || e.tank?.source !== 'rental' || !e.tank.key || seen.has(e.tank.key)) continue;
    seen.add(e.tank.key);
    out.push({ key: e.tank.key, label: e.tank.label, serial: e.tank.serial, size: e.tank.size });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The cylinders in the gear locker you can analyze. A manifolded doubles set
 * shares one fill, so it is one tank; independent doubles and sidemount pairs
 * are analyzed per cylinder (labelled with their set).
 */
export function lockerTanks(gearState, now = new Date()) {
  const items = Array.isArray(gearState?.items) ? gearState.items : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const cylinders = items.filter((i) => i.category === 'Cylinder / tank' && i.condition !== 'Retired');
  const sets = cylinders.filter(isCylinderSet);
  const hidden = new Set();
  const setOf = new Map();
  for (const set of sets) {
    for (const id of set.accessoryItemIds || []) {
      if (set.configuration === 'Manifolded doubles') hidden.add(id);
      setOf.set(id, set);
    }
  }
  const toTank = (item, label) => {
    const status = serviceStatusForItem(item, now);
    return {
      gearItemId: item.id,
      key: `gear:${item.id}`,
      label,
      serial: text(item.serialNumber),
      size: text(item.capacity) || text(item.model),
      service: ['overdue', 'blocked', 'attention'].includes(status.key) ? status : null,
    };
  };
  const out = [];
  for (const item of cylinders) {
    if (hidden.has(item.id)) continue;
    if (isCylinderSet(item)) {
      if (item.configuration !== 'Manifolded doubles') continue; // members listed individually
      const members = (item.accessoryItemIds || []).map((id) => byId.get(id)).filter(Boolean);
      const tank = toTank(item, item.name || 'Doubles');
      tank.serial = tank.serial || members.map((m) => text(m.serialNumber)).filter(Boolean).join(' / ');
      tank.size = tank.size || text(members[0]?.capacity);
      tank.service = tank.service || members.map((m) => toTank(m, '').service).find(Boolean) || null;
      out.push(tank);
      continue;
    }
    const set = setOf.get(item.id);
    out.push(toTank(item, item.name || (set ? `${set.name} cylinder` : 'Cylinder')));
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function ageLabel(iso, now = Date.now()) {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function mixName(o2) {
  if (!Number.isFinite(o2)) return '—';
  if (Math.abs(o2 - 20.9) < 0.6) return 'Air';
  return `EAN${Math.round(o2)}`;
}

// ---- Facility exports -------------------------------------------------------

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function facilityCsv(entries) {
  const header = ['Date', 'Time', 'Tank serial', 'Size', 'Pressure', 'Unit', 'Requested O2 %', 'Analyzed O2 %', 'MOD 1.4 (m)', 'Diver', 'Agency', 'Nitrox cert #', 'Initials', 'Signed', 'Analyzer'];
  const rows = (entries || []).filter((e) => e.kind === 'facility').map((e) => {
    const d = new Date(e.at);
    return [
      d.toLocaleDateString(), d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      e.tank.serial, e.tank.size, e.pressure?.value ?? '', e.pressure?.unit ?? '',
      e.requestedO2 ?? '', e.o2.toFixed(1), Number.isFinite(e.mod14) ? Math.floor(e.mod14) : '',
      e.diver.name, e.diver.agency, e.diver.certNumber, e.initials, e.signature ? 'yes' : 'no', e.analyzer?.serial || '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function signatureSvg(sig) {
  if (!sig?.paths?.length) return '';
  const paths = sig.paths.map((d) => `<path d="${esc(d)}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 ${sig.width} ${sig.height}" width="120" height="${Math.round((120 * sig.height) / sig.width)}">${paths}</svg>`;
}

export function facilityHtml(entries, { facilityName = '', depthUnit = 'ft', title = 'Nitrox Fill Log' } = {}) {
  const rows = (entries || []).filter((e) => e.kind === 'facility');
  const depth = (m) => (Number.isFinite(m) ? (depthUnit === 'm' ? `${Math.floor(m)} m` : `${Math.floor(m * 3.28084)} ft`) : '');
  const body = rows.map((e) => {
    const d = new Date(e.at);
    const off = mixDiscrepancy(e);
    return `<tr>
      <td>${esc(d.toLocaleDateString())}<br/><span class="sub">${esc(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></td>
      <td>${esc(e.tank.serial)}<br/><span class="sub">${esc(e.tank.size)}</span></td>
      <td>${e.pressure ? `${esc(e.pressure.value)} ${esc(e.pressure.unit)}` : ''}</td>
      <td class="num${off ? ' off' : ''}"><b>${e.o2.toFixed(1)}%</b>${Number.isFinite(e.requestedO2) ? `<br/><span class="sub">req ${esc(e.requestedO2)}%</span>` : ''}</td>
      <td>${depth(e.mod14)}</td>
      <td>${esc(e.diver.name)}<br/><span class="sub">${esc([e.diver.agency, e.diver.certNumber].filter(Boolean).join(' #'))}</span></td>
      <td class="sig"><b>${esc(e.initials)}</b>${signatureSvg(e.signature)}</td>
    </tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;margin:24px}
    h1{font-size:20px;margin:0} .meta{color:#555;font-size:12px;margin:4px 0 16px}
    table{border-collapse:collapse;width:100%;font-size:11px} th,td{border:1px solid #bbb;padding:6px;vertical-align:top;text-align:left}
    th{background:#eee;font-size:10px;text-transform:uppercase;letter-spacing:.04em} .sub{color:#666;font-size:10px}
    .num{white-space:nowrap} .off{background:#ffe9e0} .sig svg{display:block;margin-top:4px}
  </style></head><body>
    <h1>${esc(facilityName || 'Nitrox')} — ${esc(title)}</h1>
    <div class="meta">${rows.length} analys${rows.length === 1 ? 'is' : 'es'} · generated ${esc(new Date().toLocaleString())} · MOD at PO₂ 1.4</div>
    <table><thead><tr><th>Date</th><th>Tank</th><th>Pressure</th><th>O₂</th><th>MOD</th><th>Diver / cert</th><th>Initials / signature</th></tr></thead>
    <tbody>${body || '<tr><td colspan="7">No analyses logged.</td></tr>'}</tbody></table>
  </body></html>`;
}
