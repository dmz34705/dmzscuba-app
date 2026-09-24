// Planning bands, not temperature ratings for a particular suit. Personal comfort, duration and
// neoprene compression matter: https://dan.org/safety-prevention/diver-safety/divers-blog/avoid-the-chill/
export const DEFAULT_DRYSUIT_BELOW_C = (60 - 32) * 5 / 9;
export function exposureFor(celsius) {
  if (!Number.isFinite(celsius)) return null;
  if (celsius >= 28) return 'Rash guard / thin suit';
  if (celsius >= 25) return '1–3 mm';
  if (celsius >= 22) return '3–5 mm';
  if (celsius >= 19) return '5–7 mm';
  if (celsius >= DEFAULT_DRYSUIT_BELOW_C) return '7 mm or drysuit';
  return 'Drysuit + insulation';
}

export function exposureAdvice({ site = {}, inland = null, temperatureC = null, bottomTemperatureC = null, depthMeters = null, demanding = false, drysuitBelowC = DEFAULT_DRYSUIT_BELOW_C, comfortOffsetC = 0 } = {}) {
  const tags = site.topologies || [];
  const fullCoverage = tags.some(tag => ['wreck', 'cave', 'cavern', 'mine'].includes(tag));
  const depth = Number.isFinite(depthMeters) ? depthMeters : !site.depthIsWholeLake ? site.maxDepthMeters : null;
  const deepInland = inland && !inland.geothermal && inland.constant == null
    && ['lake', 'quarry', 'wreck'].includes(inland.kind) && Number.isFinite(depth) && depth >= 18;
  const reasons = [];
  const bottomKnown = Number.isFinite(bottomTemperatureC);
  const effective = bottomKnown ? bottomTemperatureC : temperatureC;
  const planningTemperatureC = Number.isFinite(effective) ? effective - comfortOffsetC : null;
  let dry = Number.isFinite(effective) && effective < drysuitBelowC;
  if (deepInland && !bottomKnown) {
    dry = true;
    reasons.push('Deep inland water can stay cold below the thermocline despite a warm surface; plan drysuit insulation until bottom conditions are confirmed.');
  }
  if (Number.isFinite(effective) && effective < drysuitBelowC) reasons.push('Cold water favors a drysuit with suitable insulation.');
  if (demanding) reasons.push('Longer exposure and decompression stops increase the need for warmth; neoprene also loses insulation at depth.');
  if (comfortOffsetC) reasons.push(`Provisional guidance adjusted for your tendency to run ${comfortOffsetC > 0 ? 'cold' : 'warm'}; saved comfort combinations use actual water temperature.`);
  if (fullCoverage) reasons.push('Full-length coverage helps protect against accidental contact with wreckage or rock; it is not permission to touch marine life.');
  let label = dry ? 'Drysuit + insulation' : exposureFor(planningTemperatureC);
  if (!dry && demanding && planningTemperatureC != null && planningTemperatureC < 19) label = 'Drysuit preferred';
  if (!dry && fullCoverage && planningTemperatureC != null && planningTemperatureC >= 25) label = 'Thin full suit';
  return { label: label || 'Confirm water temperature', dry: dry || label === 'Drysuit preferred', fullCoverage, planningTemperatureC: deepInland && !bottomKnown ? null : planningTemperatureC, temperatureC: deepInland && !bottomKnown ? null : Number.isFinite(effective) ? effective : null,
    temperatureBasis: bottomKnown ? 'Your bottom-water temperature' : 'Monthly surface estimate; bottom temperature unconfirmed', deepInland: Boolean(deepInland), reasons };
}
