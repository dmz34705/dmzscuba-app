import { getAccessToken } from './accountApi';
import { AIRLINES } from '../features/planner/flightImport/parseFlightText';

// Smart import: the Worker reads confirmation emails (and PDF receipts) the on-device parser
// couldn't. Signed-in only; like Dive Lens it goes straight to the Worker from native builds.
const FLIGHT_API_URL = 'https://dmz-media-api.zacharylisowski55.workers.dev/api/planner/flights/parse';
const REQUEST_TIMEOUT_MS = 35000;

export class FlightImportError extends Error {
  constructor(message, code = 'FLIGHT_IMPORT_FAILED') {
    super(message);
    this.name = 'FlightImportError';
    this.code = code;
  }
}

// The Worker's flight shape → planner flight legs.
export function flightsFromSmartImport(data) {
  const reference = typeof data?.confirmation === 'string' ? data.confirmation : '';
  const flights = (Array.isArray(data?.flights) ? data.flights : []).map((flight) => {
    const code = /^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/.exec(flight.flightNumber || '');
    return {
      type: 'flight', title: code ? `${code[1]} ${code[2]}` : flight.flightNumber || '',
      provider: flight.airline || (code && AIRLINES[code[1]]) || '', reference,
      from: flight.from || '', to: flight.to || '',
      startDate: flight.departDate || '', startTime: flight.departTime || '',
      endDate: flight.arriveDate || flight.departDate || '', endTime: flight.arriveTime || '',
      notes: flight.seat ? `Seat ${flight.seat}` : '',
    };
  });
  const issues = flights.flatMap((flight, i) => {
    const missing = [!flight.from || !flight.to ? 'airports' : '', !flight.startDate ? 'date' : '', !flight.startTime || !flight.endTime ? 'times' : ''].filter(Boolean);
    return missing.length ? [`Flight ${i + 1}${flight.title ? ` (${flight.title})` : ''} is missing ${missing.join(' and ')}.`] : [];
  });
  return { flights, reference, issues };
}

export async function smartImportFlights({ text = '', pdfBase64 = '', referenceDate = '' }) {
  let token;
  try { token = await getAccessToken(); } catch { throw new FlightImportError('Sign in to your DMZ account to use smart import.', 'AUTH_REQUIRED'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response, data;
  try {
    response = await fetch(FLIGHT_API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: text || undefined, pdfBase64: pdfBase64 || undefined, referenceDate: referenceDate || undefined }),
      signal: controller.signal,
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    throw new FlightImportError(error?.name === 'AbortError' ? 'Smart import took too long. Please try again.' : 'Smart import could not be reached. Check your connection.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new FlightImportError('Your session expired. Sign in again to use smart import.', 'AUTH_REQUIRED');
  if (!response.ok || data?.ok !== true) throw new FlightImportError(data?.error || 'Smart import could not read that email.');
  return flightsFromSmartImport(data);
}
