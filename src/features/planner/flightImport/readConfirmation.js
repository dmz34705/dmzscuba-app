import { emailToText } from './emailText';
import { parseFlightText } from './parseFlightText';

const importError = (message, code = 'FLIGHT_IMPORT_FAILED') => Object.assign(new Error(message), { code });

// Turns a pasted email, a saved .eml or a PDF receipt into flights for review. The phone's own
// parser goes first; smart import (the Worker) is only asked when that can't fill everything in,
// and only for signed-in divers. PDFs always need smart import. Returns
// { flights, reference, issues, source: 'device' | 'ai' }; throws with a message to show otherwise.
export async function readConfirmation({ raw = '', pdfBase64 = '', signedIn = false, today, smartImport }) {
  if (pdfBase64) {
    if (!signedIn) throw importError('Sign in to your DMZ account to import a PDF — PDFs are read with smart import.', 'AUTH_REQUIRED');
    const result = await smartImport({ pdfBase64, referenceDate: today });
    if (!result.flights.length) throw importError('No flights were found in that PDF.');
    return { ...result, source: 'ai' };
  }

  const { text, sentDate } = emailToText(raw);
  if (!text.trim()) throw importError('Paste the confirmation email or choose a file first.');
  const referenceDate = sentDate || today;
  const local = parseFlightText(text, { today: referenceDate });
  const localResult = { flights: local.flights.map((flight) => ({ ...flight, reference: local.reference })), reference: local.reference, issues: local.issues, source: 'device' };
  if (local.complete) return localResult;

  if (signedIn) {
    try {
      const result = await smartImport({ text: text.slice(0, 60000), referenceDate });
      if (result.flights.length) return { ...result, source: 'ai' };
    } catch (error) {
      if (!local.flights.length) throw error;
    }
  }
  if (local.flights.length) {
    return { ...localResult, issues: [...local.issues, signedIn ? '' : 'Sign in to let smart import fill the gaps.'].filter(Boolean) };
  }
  throw importError(signedIn ? 'No flights were found in that email.' : 'This phone couldn’t read that email. Sign in to your DMZ account to use smart import.', signedIn ? 'NO_FLIGHTS' : 'AUTH_REQUIRED');
}
