'use client';

import {
  WebAuthnError,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

/** Remembers that this device enrolled, so the login screen can lead with Face ID. */
const ENROLLED_KEY = 'cagt-passkey';

export type PasskeyResult = { ok: true } | { ok: false; error: string; cancelled?: boolean };

/** True on a device that has Face ID, Touch ID, or a similar built-in unlock. */
export async function passkeyAvailable(): Promise<boolean> {
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function autofillAvailable(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

export function markEnrolled(enrolled: boolean) {
  try {
    if (enrolled) localStorage.setItem(ENROLLED_KEY, '1');
    else localStorage.removeItem(ENROLLED_KEY);
  } catch {
    // Only a hint for the login screen.
  }
}

export function wasEnrolled(): boolean {
  try {
    return localStorage.getItem(ENROLLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** What the device is called in the list under Settings. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Điện thoại Android';
  if (/Windows/.test(ua)) return 'Máy tính Windows';
  return 'Thiết bị';
}

async function postJson<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    data = {} as T;
  }
  return { ok: response.ok, data };
}

function describe(error: unknown, action: 'register' | 'login'): PasskeyResult {
  // The person closed the Face ID sheet, or another prompt took its place.
  // Not an error worth a red message.
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return { ok: false, error: '', cancelled: true };
  }
  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      return { ok: false, error: 'Máy này đã bật Face ID rồi.' };
    }
    if (error.code === 'ERROR_CEREMONY_ABORTED') return { ok: false, error: '', cancelled: true };
  }
  return {
    ok: false,
    error:
      action === 'register'
        ? 'Không bật được Face ID trên máy này.'
        : 'Không đăng nhập được bằng Face ID, thử lại hoặc dùng mật khẩu.',
  };
}

export async function registerPasskey(): Promise<PasskeyResult> {
  const options = await postJson<Parameters<typeof startRegistration>[0]['optionsJSON'] & { error?: string }>(
    '/api/auth/passkey/register/options',
  );
  if (!options.ok) return { ok: false, error: options.data.error ?? 'Không bật được Face ID.' };

  let response;
  try {
    response = await startRegistration({ optionsJSON: options.data });
  } catch (error) {
    return describe(error, 'register');
  }

  const verified = await postJson<{ ok?: boolean; error?: string }>('/api/auth/passkey/register/verify', {
    response,
    deviceName: deviceLabel(),
  });
  if (!verified.ok) return { ok: false, error: verified.data.error ?? 'Không bật được Face ID.' };

  markEnrolled(true);
  return { ok: true };
}

/**
 * `autofill` starts the quiet version: no sheet appears until the person taps
 * the username field and picks their passkey from the keyboard suggestions.
 */
export async function loginWithPasskey(autofill = false): Promise<PasskeyResult> {
  const options = await postJson<Parameters<typeof startAuthentication>[0]['optionsJSON'] & { error?: string }>(
    '/api/auth/passkey/login/options',
  );
  if (!options.ok) return { ok: false, error: options.data.error ?? 'Face ID chưa sẵn sàng.' };

  let response;
  try {
    response = await startAuthentication({ optionsJSON: options.data, useBrowserAutofill: autofill });
  } catch (error) {
    return describe(error, 'login');
  }

  const verified = await postJson<{ ok?: boolean; error?: string }>('/api/auth/passkey/login/verify', {
    response,
  });
  if (!verified.ok) {
    // The server no longer knows this passkey; stop leading with Face ID here.
    if (verified.data.error?.includes('đã bị gỡ')) markEnrolled(false);
    return { ok: false, error: verified.data.error ?? 'Không đăng nhập được bằng Face ID.' };
  }

  markEnrolled(true);
  return { ok: true };
}
