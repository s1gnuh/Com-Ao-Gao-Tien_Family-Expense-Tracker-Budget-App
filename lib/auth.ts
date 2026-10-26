/**
 * Supabase Auth has no username provider, so each account is created against a
 * synthetic address derived from the username. Nothing is ever delivered to it
 * — the project runs with email confirmation off — it exists only because
 * Supabase keys accounts by email, which also gives us username uniqueness for
 * free.
 */
const ACCOUNT_DOMAIN = 'comaogaotien.app';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${ACCOUNT_DOMAIN}`;
}

const AUTH_COOKIE_PREFIX = 'sb-';
const AUTH_COOKIE_SUFFIX = '-auth-token';

export interface StoredSession {
  expires_at?: number;
  user?: { id?: string; email?: string };
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/**
 * Reassembles the Supabase session from cookies without contacting the auth
 * server. @supabase/ssr splits long sessions across `name.0`, `name.1`, so the
 * parts are rejoined in name order.
 *
 * The contents are NOT verified. Use this only where the value merely selects
 * which rows to ask for — Supabase revalidates the token on every query, so a
 * forged cookie returns no data. Auth gates and writes must use the server's
 * getUser() instead.
 */
export function readStoredSession(
  cookies: { name: string; value: string }[],
): StoredSession | null {
  const parts = cookies
    .filter(
      ({ name }) => name.startsWith(AUTH_COOKIE_PREFIX) && name.includes(AUTH_COOKIE_SUFFIX),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ value }) => value);

  if (parts.length === 0) return null;

  let raw = parts.join('');
  if (raw.startsWith('base64-')) raw = raw.slice('base64-'.length);

  try {
    return JSON.parse(decodeBase64(raw)) as StoredSession;
  } catch {
    return null;
  }
}

/** Returns a Vietnamese problem description, or null when the name is usable. */
export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);

  if (username.length === 0) return 'Chưa nhập tên đăng nhập.';
  if (username.includes('@')) return 'Tên đăng nhập không được chứa ký tự @.';
  if (username.length < 3) return 'Tên đăng nhập cần ít nhất 3 ký tự.';
  if (username.length > 30) return 'Tên đăng nhập tối đa 30 ký tự.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.';
  }

  return null;
}
