#!/usr/bin/env node
/*
 * Build the compact airport table used by the "Get me here" planner to find
 * the closest practical arrival airports for any dive site. Source: OurAirports
 * (public domain). Only large/medium airports with scheduled passenger service
 * and an IATA code are kept, so every suggestion is a real flight search target.
 * Connectivity (distinct connected airports) comes from OpenFlights routes
 * (ODbL 1.0). It is dated and only ranks gateways; it is never shown as a schedule.
 *
 *   node scripts/build-journey-airports.cjs [airports.csv] [countries.csv] [routes.dat]
 */
const fs = require('node:fs');
const path = require('node:path');

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const COUNTRIES_URL = 'https://davidmegginson.github.io/ourairports-data/countries.csv';
const ROUTES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';
const outputPath = path.resolve(__dirname, '../src/features/oceanAtlas/data/airports.json');
const MINIMUM_EXPECTED = 2000;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function load(argument, url) {
  if (argument) return fs.readFileSync(argument, 'utf8');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

(async () => {
  const [airportsText, countriesText, routesText] = await Promise.all([load(process.argv[2], AIRPORTS_URL), load(process.argv[3], COUNTRIES_URL), load(process.argv[4], ROUTES_URL)]);
  const links = new Map();
  const link = (a, b) => { if (!links.has(a)) links.set(a, new Set()); links.get(a).add(b); };
  for (const line of routesText.split('\n')) {
    const [, , from, , to] = line.split(',');
    if (/^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to)) { link(from, to); link(to, from); }
  }
  const countries = Object.fromEntries(parseCsv(countriesText).map(c => [c.code, c.name]));
  const airports = parseCsv(airportsText)
    .filter(a => a.scheduled_service === 'yes' && /^[A-Z]{3}$/.test(a.iata_code) && ['large_airport', 'medium_airport'].includes(a.type))
    .map(a => [a.iata_code, a.name.replace(/\s+/g, ' ').trim(), (a.municipality || '').trim(), a.iso_country,
      Math.round(Number(a.latitude_deg) * 1000) / 1000, Math.round(Number(a.longitude_deg) * 1000) / 1000, a.type === 'large_airport' ? 1 : 0, links.get(a.iata_code)?.size || 0])
    .filter(a => Number.isFinite(a[4]) && Number.isFinite(a[5]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (airports.length < MINIMUM_EXPECTED) throw new Error(`Only ${airports.length} airports; refusing to overwrite.`);
  const used = new Set(airports.map(a => a[3]));
  const output = { source: 'OurAirports', sourceUrl: 'https://ourairports.com/data/', license: 'Public domain',
    connectivitySource: 'OpenFlights routes', connectivitySourceUrl: 'https://openflights.org/data.php', connectivityLicense: 'ODbL 1.0', retrievedAt: new Date().toISOString(),
    fields: ['iata', 'name', 'city', 'country', 'latitude', 'longitude', 'large', 'connections'],
    countries: Object.fromEntries(Object.entries(countries).filter(([code]) => used.has(code))), airports };
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`Wrote ${airports.length} airports (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB) to ${path.relative(process.cwd(), outputPath)}`);
})().catch(error => { console.error(error.message); process.exit(1); });
