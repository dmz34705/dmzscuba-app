import { normalizeLensResult } from './lensResult';
import { getAccessToken } from './accountApi';
import { createAiRequestId, logAiDiagnostic } from './aiDiagnostics';

// Leave room for the desktop model's first request after it has been unloaded
// from VRAM. Warm requests normally return much sooner.
const REQUEST_TIMEOUT_MS = 70000;
// Native iOS networking can fail before HTTP when reaching the public site hostname.
// Keep account traffic on the site, but use the Worker directly for the image request.
const VISION_API_BASE_URL = 'https://dmz-media-api.zacharylisowski55.workers.dev';

export class LensApiError extends Error {
  constructor(message, code = 'LENS_REQUEST_FAILED', requestId = '') {
    super(message);
    this.name = 'LensApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

export async function identifyPhoto({ base64, mimeType = 'image/jpeg', context = null }) {
  if (!base64) {
    throw new LensApiError('No photo was captured to analyze.', 'LENS_NO_IMAGE');
  }

  let token;
  try {
    token = await getAccessToken();
  } catch {
    throw new LensApiError('Sign in to your DMZ account to use Dive Lens.', 'LENS_AUTH_REQUIRED');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestId = createAiRequestId('dive-lens');
  const startedAt = Date.now();
  logAiDiagnostic('request.started', { requestId, feature: 'dive-lens', requestBytes: base64.length, mimeType });

  let response;
  let data;
  try {
    response = await fetch(`${VISION_API_BASE_URL}/api/vision/identify`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-DMZ-Request-ID': requestId },
      body: JSON.stringify({ imageBase64: base64, mimeType, ...(context ? { context } : {}) }),
      signal: controller.signal,
    });
    data = await response.json().catch(() => ({}));
    logAiDiagnostic('request.completed', {
      requestId: response.headers.get('x-dmz-request-id') || requestId,
      feature: 'dive-lens',
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    logAiDiagnostic('request.failed', { requestId, feature: 'dive-lens', elapsedMs: Date.now() - startedAt, error: error?.name || 'Error' });
    if (error?.name === 'AbortError') {
      throw new LensApiError('The identification took too long to respond. Please try again.', 'LENS_TIMEOUT', requestId);
    }
    throw new LensApiError('Dive Lens could not be reached. Check your connection and try again.', 'LENS_NETWORK_ERROR', requestId);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new LensApiError('Your session expired. Sign in again to use Dive Lens.', 'LENS_AUTH_REQUIRED', requestId);
  }

  if (!response.ok || data?.ok === false) {
    const message = String(data?.error || '').trim();
    throw new LensApiError(message && message.length <= 240 ? message : 'That photo could not be analyzed. Try a clearer, closer shot.', 'LENS_REQUEST_FAILED', requestId);
  }

  const result = normalizeLensResult(data?.result);
  if (!result) throw new LensApiError('Dive Lens returned an incomplete identification. Please try again.', 'LENS_INVALID_RESULT', requestId);
  return result;
}
