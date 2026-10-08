const finite = value => Number.isFinite(value) ? value : null;
const maxOf = (values, fallback = null) => {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.max(...usable) : fallback;
};
const minOf = (values, fallback = null) => {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.min(...usable) : fallback;
};

export function buildDiveDayAdvice({ weather = null, waterTemperatureC = null, exposureLabel = '', motionSensitive = false, marine = false } = {}) {
  const hours = weather?.hours?.slice(0, 12) || [];
  const current = hours[0] || {};
  const windMps = maxOf(hours.slice(0, 6).map(hour => hour.windSpeedMps), finite(current.windSpeedMps));
  const apparentC = minOf(hours.slice(0, 6).map(hour => hour.apparentTemperatureC ?? hour.airTemperatureC), finite(current.apparentTemperatureC ?? current.airTemperatureC));
  const hotFeelsC = maxOf(hours.slice(0, 6).map(hour => hour.apparentTemperatureC ?? hour.airTemperatureC), finite(current.apparentTemperatureC ?? current.airTemperatureC));
  const uv = maxOf(hours.map(hour => hour.uvIndexClearSky), finite(current.uvIndexClearSky));
  const rainMm = hours.slice(0, 6).reduce((sum, hour) => sum + (finite(hour.precipitationMm) || 0), 0);
  const waves = weather?.marine?.hours?.slice(0, 12) || [];
  const waveHeightM = maxOf(waves.map(hour => hour.waveHeightM));
  const wavePeriodS = waves[0]?.wavePeriodS ?? null;
  const items = [];

  items.push({ kind: 'water', tone: 'water', title: exposureLabel || 'Confirm exposure protection',
    detail: waterTemperatureC == null ? 'Confirm temperature at depth with the operator before choosing insulation.' : 'Water and depth drive your in-water exposure protection; the surface forecast does not replace bottom-temperature planning.' });

  if (apparentC != null && apparentC <= 10) items.push({ kind: 'warmth', tone: 'cold', title: 'Pack a serious between-dive warming layer', detail: 'Bring a warm hat, windproof insulated layer, dry socks and a complete dry change. Get out of wet exposure protection between dives when practical.' });
  else if ((apparentC != null && apparentC <= 19) || (windMps != null && windMps >= 8)) items.push({ kind: 'warmth', tone: 'cold', title: 'Bring a wind-blocking surface layer', detail: 'A hooded shell, dry towel and dry change help prevent evaporative cooling after the dive—even when the water feels warm.' });
  else items.push({ kind: 'recovery', tone: 'neutral', title: 'Keep a dry change and towel accessible', detail: 'Surface comfort can fall quickly after a repetitive dive or a long ride back.' });

  if (rainMm >= 1) items.push({ kind: 'rain', tone: 'weather', title: 'Protect the dry gear from rain and spray', detail: `About ${rainMm >= 10 ? Math.round(rainMm) : rainMm.toFixed(1)} mm is forecast over the next six hours. Add a waterproof shell and a true dry bag for clothing and electronics.` });

  if (uv != null && uv >= 6) items.push({ kind: 'sun', tone: 'sun', title: `Strong sun protection · UV up to ${Math.round(uv)}`, detail: 'Pack a UPF sun shirt, hat, sunglasses, shade and broad-spectrum water-resistant sunscreen where permitted. Check local sunscreen laws; “reef-safe” is not a standardized guarantee.' });
  else if (uv != null && uv >= 3) items.push({ kind: 'sun', tone: 'sun', title: `Sun protection · UV up to ${Math.round(uv)}`, detail: 'Bring a sun shirt, hat and broad-spectrum water-resistant sunscreen where local rules allow it.' });

  if (hotFeelsC != null && hotFeelsC >= 32) items.push({ kind: 'heat', tone: 'sun', title: 'Plan shade and hydration before suiting up', detail: 'The forecast feels hot. Bring water, use shade and avoid standing fully suited longer than necessary.' });

  if (marine && waveHeightM != null) {
    const rough = waveHeightM >= 2.5, unsettled = waveHeightM >= 1 || (wavePeriodS != null && wavePeriodS < 7 && waveHeightM >= .7);
    const state = rough ? 'rough' : unsettled ? 'active' : waveHeightM >= .5 ? 'slight' : 'low';
    items.push({ kind: 'boat', tone: rough ? 'warn' : unsettled ? 'weather' : 'neutral', title: `Open-ocean sea state · ${state}`, detail: `${waveHeightM.toFixed(1)} m significant wave height${wavePeriodS != null ? ` · ${wavePeriodS.toFixed(0)} s period` : ''}. This coarse offshore model can differ sharply at the entry, reef, harbor or lee shore—confirm with the operator.` });
    if ((motionSensitive && waveHeightM >= .5) || unsettled) items.push({ kind: 'motion', tone: unsettled ? 'warn' : 'weather', title: motionSensitive ? 'Use your motion-sickness plan early' : 'Motion-sensitive divers: plan ahead', detail: 'Use only precautions you already know are safe for you, check drowsiness and diving warnings, and ask a pharmacist or clinician before using medication. Hydrate, eat lightly and stay where you can see the horizon.' });
  } else if (marine) items.push({ kind: 'boat', tone: 'neutral', title: 'Sea-state model unavailable here', detail: 'Ask the operator about swell, chop, entry conditions and the ride out; an atmospheric forecast alone cannot describe the sea.' });

  const headline = items.some(item => item.tone === 'warn') ? 'Extra planning recommended'
    : items.some(item => ['cold', 'sun', 'weather'].includes(item.tone)) ? 'Pack for the surface, too' : 'A straightforward surface plan';
  return { headline, items, signals: { windMps, apparentC, hotFeelsC, uv, rainMm, waveHeightM, wavePeriodS } };
}
