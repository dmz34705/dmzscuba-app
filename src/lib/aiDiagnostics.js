function safeLabel(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 24);
  return normalized || fallback;
}

export function createAiRequestId(feature = 'ai') {
  const prefix = safeLabel(feature, 'ai');
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}

export function logAiDiagnostic(event, details = {}) {
  // Never pass prompts, photos, booking text, tokens, email addresses, or user IDs.
  console.info('DMZ AI diagnostic', JSON.stringify({
    timestamp: new Date().toISOString(),
    event: safeLabel(event, 'event'),
    ...details,
  }));
}
