// Presentation-edge formatting and parsing for the logbook. Records store SI
// (metres, seconds, °C, bar, litres, kg); everything user-facing is converted
// here according to `appSettings` (depthUnit, pressureUnit, temperatureUnit,
// gasVolumeUnit).

import { METERS_TO_FEET } from '../divePhysics';
import { defaultGasLabel } from './schema';

export const BAR_TO_PSI = 14.5037738;
export const CUBIC_FOOT_LITERS = 28.316846592;
export const KG_TO_LB = 2.2046226218;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DASH = '—';

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInput(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Formatters (SI in, display string out)
// ---------------------------------------------------------------------------

export function formatDepth(meters, unit = 'm') {
  const value = finite(meters);
  if (value === null) return DASH;
  if (unit === 'ft') return `${Math.round(value * METERS_TO_FEET)} ft`;
  return `${Math.round(value)} m`;
}

export function formatDuration(seconds) {
  const value = finite(seconds);
  if (value === null || value < 0) return DASH;
  const totalMinutes = Math.round(value / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatTemperature(celsius, unit = 'C') {
  const value = finite(celsius);
  if (value === null) return DASH;
  if (unit === 'F') return `${Math.round((value * 9) / 5 + 32)}°F`;
  return `${Math.round(value)}°C`;
}

export function formatPressure(bar, unit = 'bar') {
  const value = finite(bar);
  if (value === null) return DASH;
  if (unit === 'psi') return `${Math.round(value * BAR_TO_PSI)} psi`;
  return `${Math.round(value)} bar`;
}

export function formatVolume(liters, unit = 'L') {
  const value = finite(liters);
  if (value === null) return DASH;
  if (unit === 'ft³') return `${(value / CUBIC_FOOT_LITERS).toFixed(1)} ft³`;
  return `${value.toFixed(1)} L`;
}

export function formatWeight(kg, unit = 'kg') {
  const value = finite(kg);
  if (value === null) return DASH;
  if (unit === 'lb') return `${Math.round(value * KG_TO_LB)} lb`;
  return `${value.toFixed(1)} kg`;
}

export function formatGasLabel(mix) {
  if (!mix || typeof mix !== 'object') return 'Air';
  return (typeof mix.label === 'string' && mix.label.trim())
    || defaultGasLabel(mix.o2, mix.he);
}

export function formatDate(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatTime(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatCoordinates(latitude, longitude) {
  const lat = finite(latitude);
  const lon = finite(longitude);
  if (lat === null || lon === null) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

// ---------------------------------------------------------------------------
// Parsers (display input -> SI) for form fields
// ---------------------------------------------------------------------------

export function parseNumberInput(text) {
  return parseInput(text);
}

export function parseDepthInput(text, unit = 'm') {
  const value = parseInput(text);
  if (value === null) return null;
  return unit === 'ft' ? value / METERS_TO_FEET : value;
}

export function parseTemperatureInput(text, unit = 'C') {
  const value = parseInput(text);
  if (value === null) return null;
  return unit === 'F' ? ((value - 32) * 5) / 9 : value;
}

export function parsePressureInput(text, unit = 'bar') {
  const value = parseInput(text);
  if (value === null) return null;
  return unit === 'psi' ? value / BAR_TO_PSI : value;
}

export function parseVolumeInput(text, unit = 'L') {
  const value = parseInput(text);
  if (value === null) return null;
  return unit === 'ft³' ? value * CUBIC_FOOT_LITERS : value;
}

export function parseWeightInput(text, unit = 'kg') {
  const value = parseInput(text);
  if (value === null) return null;
  return unit === 'lb' ? value / KG_TO_LB : value;
}

export function parseMinutesInput(text) {
  const value = parseInput(text);
  if (value === null) return null;
  return Math.round(value * 60);
}

// ---------------------------------------------------------------------------
// Inverse helpers (SI -> display input string) for edit-form prefill
// ---------------------------------------------------------------------------

function inputString(value, digits) {
  const parsed = finite(value);
  if (parsed === null) return '';
  const rounded = digits === 0 ? Math.round(parsed) : Number(parsed.toFixed(digits));
  return String(rounded);
}

export function depthToInput(meters, unit = 'm') {
  const value = finite(meters);
  if (value === null) return '';
  return inputString(unit === 'ft' ? value * METERS_TO_FEET : value, unit === 'ft' ? 0 : 1);
}

export function temperatureToInput(celsius, unit = 'C') {
  const value = finite(celsius);
  if (value === null) return '';
  return inputString(unit === 'F' ? (value * 9) / 5 + 32 : value, 0);
}

export function pressureToInput(bar, unit = 'bar') {
  const value = finite(bar);
  if (value === null) return '';
  return inputString(unit === 'psi' ? value * BAR_TO_PSI : value, 0);
}

export function volumeToInput(liters, unit = 'L') {
  const value = finite(liters);
  if (value === null) return '';
  return inputString(unit === 'ft³' ? value / CUBIC_FOOT_LITERS : value, 1);
}

export function weightToInput(kg, unit = 'kg') {
  const value = finite(kg);
  if (value === null) return '';
  return inputString(unit === 'lb' ? value * KG_TO_LB : value, 1);
}

export function minutesToInput(seconds) {
  const value = finite(seconds);
  if (value === null) return '';
  return String(Math.round(value / 60));
}
