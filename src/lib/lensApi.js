import { ACCOUNT_API_BASE_URL } from './accountApi';

const REQUEST_TIMEOUT_MS = 30000;

export class LensApiError extends Error {
  constructor(message, code = 'LENS_REQUEST_FAILED') {
    super(message);
    this.name = 'LensApiError';
    this.code = code;
  }
}

export async function identifyPhoto({ base64, mimeType = 'image/jpeg' }) {
  if (!base64) {
    throw new LensApiError('No photo was captured to analyze.', 'LENS_NO_IMAGE');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  let data;
  try {
    response = await fetch(`${ACCOUNT_API_BASE_URL}/api/vision/identify`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
      signal: controller.signal,
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new LensApiError('The identification took too long to respond. Please try again.', 'LENS_TIMEOUT');
    }
    throw new LensApiError('Dive Lens could not be reached. Check your connection and try again.', 'LENS_NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok || data?.ok === false) {
    const message = String(data?.error || '').trim();
    throw new LensApiError(message && message.length <= 240 ? message : 'That photo could not be analyzed. Try a clearer, closer shot.', 'LENS_REQUEST_FAILED');
  }

  const result = data?.result || {};
  return {
    category: result.category === 'gear' || result.category === 'marine_life' ? result.category : 'unclear',
    commonName: String(result.commonName || 'Unidentified'),
    scientificName: result.scientificName ? String(result.scientificName) : null,
    confidence: result.confidence === 'high' || result.confidence === 'medium' || result.confidence === 'low' ? result.confidence : 'low',
    description: String(result.description || ''),
    safetyNote: result.safetyNote ? String(result.safetyNote) : null,
    funFact: result.funFact ? String(result.funFact) : null,
  };
}
