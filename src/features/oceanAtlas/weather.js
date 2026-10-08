const WEATHER_ENDPOINT = 'https://dmz-media-api.zacharylisowski55.workers.dev/api/atlas/weather';
const weatherCache = new Map();
const inFlight = new Map();

const coordinateKey = (latitude, longitude) => `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;
const validCoordinate = (latitude, longitude) => Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
  && Number(latitude) >= -90 && Number(latitude) <= 90 && Number(longitude) >= -180 && Number(longitude) <= 180;

export function normalizeSiteWeather(payload) {
  if (!payload?.ok || !Array.isArray(payload.hours) || !payload.hours.length) throw new Error('Weather forecast is unavailable.');
  const hours = payload.hours.slice(0, 48).map(hour => ({
    time: typeof hour?.time === 'string' && Number.isFinite(Date.parse(hour.time)) ? hour.time : null,
    symbolCode: typeof hour?.symbolCode === 'string' ? hour.symbolCode.slice(0, 50) : null,
    airTemperatureC: Number.isFinite(hour?.airTemperatureC) ? hour.airTemperatureC : null,
    apparentTemperatureC: Number.isFinite(hour?.apparentTemperatureC) ? hour.apparentTemperatureC : null,
    uvIndexClearSky: Number.isFinite(hour?.uvIndexClearSky) ? hour.uvIndexClearSky : null,
    windSpeedMps: Number.isFinite(hour?.windSpeedMps) ? hour.windSpeedMps : null,
    windDirectionDeg: Number.isFinite(hour?.windDirectionDeg) ? hour.windDirectionDeg : null,
    pressureHpa: Number.isFinite(hour?.pressureHpa) ? hour.pressureHpa : null,
    cloudPercent: Number.isFinite(hour?.cloudPercent) ? hour.cloudPercent : null,
    humidityPercent: Number.isFinite(hour?.humidityPercent) ? hour.humidityPercent : null,
    precipitationMm: Number.isFinite(hour?.precipitationMm) ? hour.precipitationMm : null,
  })).filter(hour => hour.time);
  if (!hours.length) throw new Error('Weather forecast contains no usable hours.');
  const marineHours = Array.isArray(payload.marine?.hours) ? payload.marine.hours.slice(0, 72).map(hour => ({
    time: typeof hour?.time === 'string' && Number.isFinite(Date.parse(hour.time)) ? hour.time : null,
    waveHeightM: Number.isFinite(hour?.waveHeightM) ? hour.waveHeightM : null,
    wavePeriodS: Number.isFinite(hour?.wavePeriodS) ? hour.wavePeriodS : null,
    waveDirectionDeg: Number.isFinite(hour?.waveDirectionDeg) ? hour.waveDirectionDeg : null,
  })).filter(hour => hour.time && hour.waveHeightM != null) : [];
  return {
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : new Date().toISOString(),
    source: {
      name: typeof payload.source?.name === 'string' ? payload.source.name.slice(0, 80) : 'MET Norway',
      url: typeof payload.source?.url === 'string' && /^https:\/\//.test(payload.source.url) ? payload.source.url : 'https://api.met.no/',
      license: typeof payload.source?.license === 'string' ? payload.source.license.slice(0, 40) : 'CC BY 4.0',
    },
    marine: marineHours.length ? {
      model: typeof payload.marine?.model === 'string' ? payload.marine.model.slice(0, 80) : 'WaveWatch III global',
      gridLatitude: Number.isFinite(payload.marine?.gridLatitude) ? payload.marine.gridLatitude : null,
      gridLongitude: Number.isFinite(payload.marine?.gridLongitude) ? payload.marine.gridLongitude : null,
      source: {
        name: typeof payload.marine?.source?.name === 'string' ? payload.marine.source.name.slice(0, 100) : 'NOAA / PacIOOS WaveWatch III',
        url: typeof payload.marine?.source?.url === 'string' && /^https:\/\//.test(payload.marine.source.url) ? payload.marine.source.url : 'https://www.pacioos.hawaii.edu/waves/model-global/',
        license: typeof payload.marine?.source?.license === 'string' ? payload.marine.source.license.slice(0, 80) : 'Free use and redistribution',
      },
      hours: marineHours,
    } : null,
    hours,
  };
}

export async function fetchSiteWeather(latitude, longitude, { fetchImpl = fetch, timeoutMs = 12000, marine = false } = {}) {
  if (!validCoordinate(latitude, longitude)) throw new Error('Invalid weather coordinates.');
  const key = `${coordinateKey(latitude, longitude)}:${marine ? 'marine' : 'land'}`;
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${WEATHER_ENDPOINT}?lat=${encodeURIComponent(Number(latitude).toFixed(3))}&lon=${encodeURIComponent(Number(longitude).toFixed(3))}${marine ? '&marine=1' : ''}`;
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);
      const value = normalizeSiteWeather(await response.json());
      weatherCache.set(key, { value, expiresAt: Date.now() + 15 * 60 * 1000 });
      return value;
    } finally {
      clearTimeout(timer);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

export function clearSiteWeatherCache() {
  weatherCache.clear();
  inFlight.clear();
}
