const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const weather = loadSourceModule(path.resolve(__dirname, '../src/features/oceanAtlas/weather.js'), path.resolve(__dirname, '../src'));
const { buildDiveDayAdvice } = loadSourceModule(path.resolve(__dirname, '../src/features/oceanAtlas/diveDayAdvice.js'), path.resolve(__dirname, '../src'));
const sample = {
  ok: true,
  updatedAt: '2026-10-08T12:00:00Z',
  fetchedAt: '2026-10-08T12:05:00Z',
  source: { name: 'MET Norway', url: 'https://api.met.no/', license: 'CC BY 4.0' },
  marine: { model: 'WaveWatch III global', gridLatitude: 20.5, gridLongitude: -87, source: { name: 'NOAA / PacIOOS WaveWatch III', url: 'https://www.pacioos.hawaii.edu/waves/model-global/', license: 'Free use and redistribution' }, hours: [{ time: '2026-10-08T13:00:00Z', waveHeightM: 1.6, wavePeriodS: 6.2, waveDirectionDeg: 141 }] },
  hours: [{ time: '2026-10-08T13:00:00Z', symbolCode: 'partlycloudy_day', airTemperatureC: 27.5, apparentTemperatureC: 33.5, uvIndexClearSky: 8.4, windSpeedMps: 8.2, windDirectionDeg: 135, pressureHpa: 1012.4, cloudPercent: 42, humidityPercent: 75, precipitationMm: 0.2 }],
};

(async () => {
  assert.throws(() => weather.normalizeSiteWeather({ ok: true, hours: [] }), /no usable|unavailable/i);
  const normalized = weather.normalizeSiteWeather(sample);
  assert.equal(normalized.hours[0].windSpeedMps, 8.2);
  assert.equal(normalized.hours[0].uvIndexClearSky, 8.4);
  assert.equal(normalized.marine.hours[0].waveHeightM, 1.6);
  assert.equal(normalized.source.license, 'CC BY 4.0');
  const plan = buildDiveDayAdvice({ weather: normalized, waterTemperatureC: 27, exposureLabel: '3 mm wetsuit', motionSensitive: true, marine: true });
  assert.ok(plan.items.some(item => item.kind === 'sun' && /local/.test(item.detail)));
  assert.ok(plan.items.some(item => item.kind === 'motion' && /drowsiness/.test(item.detail)));
  assert.ok(plan.items.some(item => item.kind === 'warmth' && /wind/i.test(item.title)));

  weather.clearSiteWeatherCache();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.match(url, /lat=20\.307&lon=-87\.035/);
    assert.equal(options.headers.Accept, 'application/json');
    return new Response(JSON.stringify(sample), { status: 200 });
  };
  const first = weather.fetchSiteWeather(20.30688, -87.03491, { fetchImpl, marine: true });
  const duplicate = weather.fetchSiteWeather(20.30688, -87.03491, { fetchImpl, marine: true });
  assert.equal((await Promise.all([first, duplicate]))[0].hours.length, 1);
  assert.equal((await weather.fetchSiteWeather(20.3069, -87.0349, { fetchImpl, marine: true })).hours[0].airTemperatureC, 27.5);
  assert.equal(calls, 1, 'The native client caches forecasts for nearby coordinates.');
  await assert.rejects(() => weather.fetchSiteWeather(91, 0, { fetchImpl }), /invalid/i);
  console.log('Atlas app weather checks passed: validation, normalization, request deduplication and native cache.');
})().catch(error => { console.error(error); process.exitCode = 1; });
