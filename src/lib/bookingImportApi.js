import { getAccessToken } from './accountApi';
import { createAiRequestId, logAiDiagnostic } from './aiDiagnostics';
import { AIRLINES } from '../features/planner/bookingImport/parseFlightText';

// Smart import: the Worker reads confirmation emails (and PDFs) the on-device parsers couldn't —
// flights, hotels, rental cars, liveaboards, tours. Signed-in only; like Dive Lens it goes straight
// to the Worker from native builds.
const IMPORT_API_URL = 'https://dmz-media-api.zacharylisowski55.workers.dev/api/planner/itinerary/parse';
// Text imports normally finish within a minute; wait a little longer than the Worker.
const REQUEST_TIMEOUT_MS = 65000;
// Sending a 10-25MB PDF over a phone connection takes time before the server even starts reading.
const PDF_TIMEOUT_MS = 150000;
const TYPES = ['flight', 'stay', 'car', 'liveaboard', 'diving', 'activity', 'transfer', 'ferry', 'other'];
const LABELS = { flight: 'Flight', stay: 'Hotel', car: 'Rental car', liveaboard: 'Liveaboard', diving: 'Dive booking', activity: 'Activity', transfer: 'Transfer', ferry: 'Ferry', other: 'Booking' };

export class BookingImportError extends Error {
  constructor(message, code = 'IMPORT_FAILED', requestId = '') {
    super(message);
    this.name = 'BookingImportError';
    this.code = code;
    this.requestId = requestId;
  }
}

// The Worker's items → itinerary legs, with a note for anything it couldn't find.
export function itemsFromSmartImport(data) {
  const items = (Array.isArray(data?.items) ? data.items : []).map((item) => {
    const type = TYPES.includes(item?.type) ? item.type : 'other';
    const code = type === 'flight' ? /^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/.exec(item.title || '') : null;
    return {
      type, title: code ? `${code[1]} ${code[2]}` : item.title || '',
      provider: item.provider || (code && AIRLINES[code[1]]) || '', reference: item.reference || '',
      from: item.from || '', to: item.to || '',
      startDate: item.startDate || '', startTime: item.startTime || '',
      endDate: item.endDate || (type === 'flight' ? item.startDate || '' : ''), endTime: item.endTime || '',
      dives: Number(item.dives) || 0,
      notes: [item.seat ? `Seat ${item.seat}` : '', item.notes || ''].filter(Boolean).join(' · '),
    };
  });
  const issues = items.flatMap((item, i) => {
    const name = item.title || item.provider || `${LABELS[item.type]} ${i + 1}`;
    const missing = [!item.startDate ? 'a date' : '', ['stay', 'car', 'liveaboard'].includes(item.type) && !item.endDate ? 'an end date' : '',
      item.type === 'flight' && (!item.from || !item.to) ? 'airports' : ''].filter(Boolean);
    return missing.length ? [`${name} is missing ${missing.join(' and ')}.`] : [];
  });
  return { items, issues };
}

export async function smartImportBooking({ text = '', pdfBase64 = '', referenceDate = '' }) {
  let token;
  try { token = await getAccessToken(); } catch { throw new BookingImportError('Sign in to your DMZ account to use smart import.', 'AUTH_REQUIRED'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pdfBase64 ? PDF_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const requestId = createAiRequestId(pdfBase64 ? 'itinerary-pdf' : 'itinerary-text');
  const feature = pdfBase64 ? 'itinerary-pdf' : 'itinerary-text';
  const startedAt = Date.now();
  logAiDiagnostic('request.started', { requestId, feature, requestBytes: (text?.length || 0) + (pdfBase64?.length || 0) });
  let response, data;
  try {
    response = await fetch(IMPORT_API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-DMZ-Request-ID': requestId },
      body: JSON.stringify({ text: text || undefined, pdfBase64: pdfBase64 || undefined, referenceDate: referenceDate || undefined }),
      signal: controller.signal,
    });
    data = await response.json().catch(() => ({}));
    logAiDiagnostic('request.completed', {
      requestId: response.headers.get('x-dmz-request-id') || requestId,
      feature,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    logAiDiagnostic('request.failed', { requestId, feature, elapsedMs: Date.now() - startedAt, error: error?.name || 'Error' });
    throw new BookingImportError(error?.name === 'AbortError' ? 'Smart import took too long. Please try again.' : 'Smart import could not be reached. Check your connection.', 'NETWORK', requestId);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new BookingImportError('Your session expired. Sign in again to use smart import.', 'AUTH_REQUIRED', requestId);
  // The server doesn't have smart import (not deployed yet, or an older server).
  if (response.status === 404) throw new BookingImportError('Smart import isn’t available right now. Paste the email text instead, or add the booking by hand.', 'UNAVAILABLE', requestId);
  if (response.status === 503) throw new BookingImportError(data?.error || 'Smart import is busy right now. Try again in a few minutes.', 'AI_BUSY', requestId);
  if (response.status === 504) throw new BookingImportError('That took too long to read. Try again, or paste just the booking part of the email.', 'TIMEOUT', requestId);
  if (response.status === 413) throw new BookingImportError(data?.error || 'That file is too large for smart import.', 'TOO_LARGE', requestId);
  if (!response.ok || data?.ok !== true) throw new BookingImportError(data?.error || 'Smart import could not read that email.', 'IMPORT_FAILED', requestId);
  return itemsFromSmartImport(data);
}
