import { emailToText } from './emailText';
import { parseBookingText } from './parseBookingText';
import { parseFlightText } from './parseFlightText';

const importError = (message, code = 'IMPORT_FAILED') => Object.assign(new Error(message), { code });

// Turns a pasted email, a saved .eml or a PDF into itinerary items for review: flights, hotels,
// rental cars, liveaboards, tours and dive bookings. The phone's own parsers go first; smart import
// (the Worker) is only asked when they can't fill everything in, and only for signed-in divers.
// PDFs always need smart import. Returns { items, issues, source: 'device' | 'ai' }; each item is a
// plain itinerary leg carrying its own `reference`. Throws with a message to show otherwise.
export async function readBooking({ raw = '', pdfBase64 = '', signedIn = false, today, smartImport }) {
  if (pdfBase64) {
    if (!signedIn) throw importError('Sign in to your DMZ account to import a PDF — PDFs are read with smart import.', 'AUTH_REQUIRED');
    const result = await smartImport({ pdfBase64, referenceDate: today });
    if (!result.items.length) throw importError('No bookings were found in that PDF.');
    return { ...result, source: 'ai' };
  }

  const { text, sentDate } = emailToText(raw);
  if (!text.trim()) throw importError('Paste the confirmation email or choose a file first.');
  const referenceDate = sentDate || today;
  const flights = parseFlightText(text, { today: referenceDate });
  // With flights in the email, only unmistakable hotels, cars and liveaboards count alongside them.
  const booking = parseBookingText(text, { today: referenceDate, strongOnly: flights.flights.length > 0 });
  const items = [...flights.flights.map((flight) => ({ ...flight, reference: flights.reference })), ...booking.items];
  const issues = [...(flights.flights.length ? flights.issues : []), ...booking.issues];
  const local = { items, issues, source: 'device' };
  if (items.length && !issues.length) return local;

  if (signedIn) {
    try {
      const result = await smartImport({ text: text.slice(0, 60000), referenceDate });
      if (result.items.length) return { ...result, source: 'ai' };
    } catch (error) {
      if (!items.length) throw error;
    }
  }
  if (items.length) return { ...local, issues: [...issues, signedIn ? '' : 'Sign in to let smart import fill the gaps.'].filter(Boolean) };
  throw importError(signedIn ? 'No bookings were found in that email.' : 'This phone couldn’t read that email. Sign in to your DMZ account to use smart import.', signedIn ? 'NOTHING_FOUND' : 'AUTH_REQUIRED');
}
