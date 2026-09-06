import { normalizeLensResult } from './lensResult';

const REQUEST_TIMEOUT_MS = 30000;
// Native iOS networking can fail before HTTP when reaching the public site hostname.
// Keep account traffic on the site, but use the Worker directly for the image request.
const VISION_API_BASE_URL = 'https://dmz-media-api.zacharylisowski55.workers.dev';

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

  console.log('Dive Lens request', { base64Length: base64.length, mimeType });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  let data;
  try {
    response = await fetch(`${VISION_API_BASE_URL}/api/vision/identify`, {
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
    console.error('Dive Lens fetch failed', error?.name, error?.message, error);
    throw new LensApiError('Dive Lens could not be reached. Check your connection and try again.', 'LENS_NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok || data?.ok === false) {
    const message = String(data?.error || '').trim();
    throw new LensApiError(message && message.length <= 240 ? message : 'That photo could not be analyzed. Try a clearer, closer shot.', 'LENS_REQUEST_FAILED');
  }

  const result = normalizeLensResult(data?.result);
  if (!result) throw new LensApiError('Dive Lens returned an incomplete identification. Please try again.', 'LENS_INVALID_RESULT');
  return result;
}
