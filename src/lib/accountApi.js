import * as SecureStore from 'expo-secure-store';

export const ACCOUNT_API_BASE_URL = 'https://www.dmzscuba.com';
export const ACCOUNT_CHALLENGE_URL = 'https://dmzscuba-com.pages.dev/api/account/mobile-challenge';
export const SUPABASE_URL = 'https://nglcfndmfseknnthrvsw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5O0i-NkpVvg0VPr3k3fhuw_1i5WkDBE';

const REFRESH_TOKEN_STORAGE_KEY = 'dmz-scuba-customer-refresh-token-v1';
const REQUEST_TIMEOUT_MS = 15000;
let activeSession = null;
let refreshPromise = null;

export class AccountApiError extends Error {
  constructor(message, code = 'ACCOUNT_REQUEST_FAILED', status = 0) {
    super(message);
    this.name = 'AccountApiError';
    this.code = code;
    this.status = status;
  }
}

function authErrorMessage(data, fallback) {
  const message = String(data?.msg || data?.message || data?.error_description || data?.error || '').trim();
  return message && message.length <= 240 ? message : fallback;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { data, response };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AccountApiError('The account service took too long to respond. Please try again.', 'ACCOUNT_TIMEOUT');
    }
    throw new AccountApiError('The account service could not be reached. Check your connection and try again.', 'ACCOUNT_NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeSession(data) {
  const accessToken = String(data?.access_token || '');
  const refreshToken = String(data?.refresh_token || '');
  if (!accessToken || !refreshToken) {
    throw new AccountApiError('A secure account session could not be created.', 'INVALID_SESSION');
  }
  activeSession = {
    accessToken,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000,
    user: data.user && typeof data.user === 'object' ? data.user : {},
  };
  await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return activeSession;
}

async function clearSession() {
  activeSession = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY).catch(() => {});
}

async function requestSupabaseSession(grantType, body) {
  const { data, response } = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new AccountApiError(
      authErrorMessage(data, grantType === 'password' ? 'The email or password is incorrect.' : 'Your session has expired. Please sign in again.'),
      grantType === 'password' ? 'LOGIN_FAILED' : 'AUTH_REQUIRED',
      response.status
    );
  }
  return storeSession(data);
}

export async function signIn({ email, password, captchaToken }) {
  return requestSupabaseSession('password', {
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
    gotrue_meta_security: { captcha_token: String(captchaToken || '') },
  });
}

export async function createAccount({ firstName, lastName, email, password, captchaToken }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const { data, response } = await fetchJson(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: normalizedEmail,
      password: String(password || ''),
      data: {
        first_name: String(firstName || '').trim(),
        last_name: String(lastName || '').trim(),
      },
      gotrue_meta_security: { captcha_token: String(captchaToken || '') },
    }),
  });
  if (!response.ok) {
    throw new AccountApiError(authErrorMessage(data, 'Account creation could not be completed.'), 'SIGNUP_FAILED', response.status);
  }
  if (data?.access_token && data?.refresh_token) {
    await storeSession(data);
    return { email: normalizedEmail, verificationRequired: false };
  }
  return { email: normalizedEmail, verificationRequired: true };
}

export async function verifySignup({ email, token }) {
  const { data, response } = await fetchJson(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      token: String(token || '').trim().replace(/\s+/g, ''),
      type: 'signup',
    }),
  });
  if (!response.ok) {
    throw new AccountApiError(authErrorMessage(data, 'The verification code is invalid or expired.'), 'VERIFICATION_FAILED', response.status);
  }
  return storeSession(data);
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
    if (!refreshToken) {
      activeSession = null;
      return null;
    }
    try {
      return await requestSupabaseSession('refresh_token', { refresh_token: refreshToken });
    } catch (error) {
      await clearSession();
      if (error instanceof AccountApiError) throw error;
      throw new AccountApiError('Your session has expired. Please sign in again.', 'AUTH_REQUIRED');
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function restoreSession() {
  try {
    return await refreshSession();
  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') return null;
    throw error;
  }
}

async function getValidAccessToken() {
  if (activeSession?.accessToken && activeSession.expiresAt > Date.now() + 60000) {
    return activeSession.accessToken;
  }
  const session = await refreshSession();
  if (!session?.accessToken) throw new AccountApiError('Sign in is required.', 'AUTH_REQUIRED', 401);
  return session.accessToken;
}

async function accountRequest(path, options = {}, retry = true) {
  const accessToken = await getValidAccessToken();
  const { data, response } = await fetchJson(`${ACCOUNT_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry) {
    activeSession = null;
    try {
      await refreshSession();
      return accountRequest(path, options, false);
    } catch (_error) {
      await clearSession();
      throw new AccountApiError('Your session has expired. Please sign in again.', 'AUTH_REQUIRED', 401);
    }
  }
  if (!response.ok || data?.ok === false) {
    throw new AccountApiError(authErrorMessage(data, 'The account request could not be completed.'), response.status === 401 ? 'AUTH_REQUIRED' : 'ACCOUNT_REQUEST_FAILED', response.status);
  }
  return data;
}

export function fetchAccount() {
  return accountRequest('/api/account', { method: 'GET' });
}

export function saveAccountSettings(settings) {
  return accountRequest('/api/account/app-settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export function saveCustomerProfile(profile) {
  return accountRequest('/api/account', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function addCustomerCertification(certification) {
  return accountRequest('/api/account/certifications', {
    method: 'POST',
    body: JSON.stringify(certification),
  });
}

export function removeCustomerCertification(certificationId) {
  return accountRequest(`/api/account/certifications/${encodeURIComponent(String(certificationId || ''))}`, {
    method: 'DELETE',
  });
}

export function linkExistingCustomerRecords() {
  return accountRequest('/api/account/link-existing', { method: 'POST' });
}

export async function signOut() {
  const accessToken = activeSession?.accessToken;
  if (accessToken) {
    await fetchJson(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch(() => null);
  }
  await clearSession();
}
