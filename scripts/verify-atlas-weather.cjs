const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const weather = loadSourceModule(path.resolve(__dirname, '../src/features/oceanAtlas/weather.js'), path.resolve(__dirname, '../src'));
const sample = {
  ok: true,
  updatedAt: '2026-10-08T12:00:00Z',
  fetchedAt: '2026-10-08T12:05:00Z',
  source: { name: 'MET Norway', url: 'https://api.met.no/', license: 'CC BY 4.0' },
  hours: [{ time: '2026-10-08T13:00:00Z', symbolCode: 'partlycloudy_day', airTemperatureC: 27.5, windSpeedMps: 6.2, windDirectionDeg: 135, pressureHpa: 1012.4, cloudPercent: 42, humidityPercent: 75, precipitationMm: 0.2 }],
};

(async () => {
  assert.throws(() => weather.normalizeSiteWeather({ ok: true, hours: [] }), /no usable|unavailable/i);
  const normalized = weather.normalizeSiteWeather(sample);
  assert.equal(normalized.hours[0].windSpeedMps, 6.2);
  assert.equal(normalized.source.license, 'CC BY 4.0');

  weather.clearSiteWeatherCache();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.match(url, /lat=20\.307&lon=-87\.035/);
    assert.equal(options.headers.Accept, 'application/json');
    return new Response(JSON.stringify(sample), { status: 200 });
  };
  const first = weather.fetchSiteWeather(20.30688, -87.03491, { fetchImpl });
  const duplicate = weather.fetchSiteWeather(20.30688, -87.03491, { fetchImpl });
  assert.equal((await Promise.all([first, duplicate]))[0].hours.length, 1);
  assert.equal((await weather.fetchSiteWeather(20.3069, -87.0349, { fetchImpl })).hours[0].airTemperatureC, 27.5);
  assert.equal(calls, 1, 'The native client caches forecasts for nearby coordinates.');
  await assert.rejects(() => weather.fetchSiteWeather(91, 0, { fetchImpl }), /invalid/i);
  console.log('Atlas app weather checks passed: validation, normalization, request deduplication and native cache.');
})().catch(error => { console.error(error); process.exitCode = 1; });
