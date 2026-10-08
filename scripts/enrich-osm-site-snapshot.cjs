#!/usr/bin/env node
/*
 * Add structured facts to the existing OSM site snapshot without changing its
 * membership, names, or positions. Input is standard OSM JSON produced by
 * fetch-osm-site-source.cjs. Exact object IDs make every match deterministic.
 *
 *   node scripts/enrich-osm-site-snapshot.cjs /tmp/dmz-osm-site-source.json
 */
const fs = require('node:fs');
const path = require('node:path');

const sourceFile = process.argv[2];
if (!sourceFile || !fs.existsSync(sourceFile)) throw new Error('Pass the exact-ID OSM source JSON.');
const outputFile = path.resolve(__dirname, '../src/features/oceanAtlas/data/osmSites.json');
const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const byId = new Map((source.elements || []).map(element => [`${element.type[0]}${element.id}`, element.tags || {}]));

const NAME_TOPOLOGIES = [
  ['wreck', /\b(wreck|shipwreck|wrak|wrack|épave|epave|relitto|pecio|naufragio|vrak|hylky|ss |mv |hms |uss )\b/i],
  ['reef', /\b(reef|riffe?|riff|arrecife|recif|récif|barriera|coral gardens?)\b/i],
  ['wall', /\b(wall|drop[ -]?off|pared|falaise)\b/i],
  ['pinnacle', /\b(pinnacle|needle|seamount|bommie|rocks?|rocher)\b/i],
  ['cave', /\b(cave|cavern|cenote|grotto|grotte|grotta|cueva|h[oö]hle|sistema)\b/i],
  ['muck', /\b(muck|mud)\b/i], ['drift', /\bdrift\b/i],
];
const CURRENT = { '0': 1, no: 1, '1': 2, '2': 3, '3': 4 };
const ACCESS = { permit: 1, private: 2, customers: 3, permissive: 4 };
const HAZARDS = ['current', 'depth', 'net', 'obstacles', 'ship', 'dangerous_species', 'explosives', 'harpooning', 'stones', 'surfers'];
const ENTRY_DETAILS = ['stair', 'ladder', 'stone', 'steep'];

let typed = 0, detailed = 0;
data.sites = data.sites.map(row => {
  const [id, name] = row, tags = byId.get(id) || {};
  let mask = row[6];
  for (const [type, pattern] of NAME_TOPOLOGIES) if (pattern.test(name)) {
    const bit = 1 << data.topologyCodes.indexOf(type);
    if (!(mask & bit)) { mask |= bit; typed++; }
  }
  const dangerText = String(tags['scuba_diving:dangers'] || '').toLowerCase().replace(/[,;]/g, ' ');
  const hazardMask = HAZARDS.reduce((out, hazard, index) => {
    const explicit = tags[`scuba_diving:dangers:${hazard}`] === 'yes';
    return out | (explicit || new RegExp(`\\b${hazard}\\b`).test(dangerText) ? 1 << index : 0);
  }, 0);
  const descent = tags['scuba_diving:descent_line'] === 'yes';
  const buoy = tags['seamark:mooring:category'] === 'buoy';
  const entryText = String(tags['scuba_diving:entry'] || '').toLowerCase();
  const entryDetailMask = ENTRY_DETAILS.reduce((out, detail, index) => {
    const aliases = detail === 'stair' ? /\b(stair|steps)\b/ : new RegExp(`\\b${detail}\\b`);
    const explicit = tags[`scuba_diving:entry:${detail}`] === 'yes' || (detail === 'stair' && tags['scuba_diving:entry:steps'] === 'yes');
    return out | (explicit || aliases.test(entryText) ? 1 << index : 0);
  }, 0);
  const accessEase = Number(tags['scuba_diving:access_easyness']);
  const details = [CURRENT[String(tags['scuba_diving:current']).toLowerCase()] || 0,
    ACCESS[String(tags.access).toLowerCase()] || 0, hazardMask, descent ? (buoy ? 3 : 1) : buoy ? 2 : 0, tags.fee === 'yes' ? 1 : 0,
    Number.isInteger(accessEase) && accessEase >= 1 && accessEase <= 3 ? accessEase : 0, entryDetailMask];
  if (details.some(Boolean)) detailed++;
  return [...row.slice(0, 6), mask, ...row.slice(7, 9), ...details];
});
data.fields = ['osmId', 'name', 'latitude', 'longitude', 'maxDepthMeters', 'entry', 'topologyMask', 'fresh', 'difficulty',
  'current (0 unknown/1 none/2 light/3 moderate/4 strong)', 'access (0 unknown/1 permit/2 private/3 customers/4 permissive)',
  'hazardMask (current/depth/net/obstacles/boat traffic/dangerous species/explosives/harpooning/rockfall/surfers)',
  'mooring (0 unknown/1 descent line/2 buoy/3 both)', 'fee', 'site finding (0 unknown/1 easy/2 moderate/3 difficult)',
  'entry detail mask (steps/ladder/rocks/steep)'];
data.stats = { ...data.stats, nameDerivedTopologies: typed, structuredDetails: detailed };
data.enrichedAt = new Date().toISOString();
fs.writeFileSync(outputFile, JSON.stringify(data));
console.log(`${typed} additional name-derived types; ${detailed} sites with structured OSM details.`);
