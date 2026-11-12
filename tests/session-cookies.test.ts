import { describe, expect, it } from 'vitest';
import { authCookieName, isAuthCookie, readStoredSession } from '@/lib/supabase/cookies';

const BASE = authCookieName();

/** Encodes the way @supabase/ssr does: "base64-" + base64url, no padding. */
function encode(session: object): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

describe('authCookieName', () => {
  it('derives from the project ref', () => {
    expect(BASE).toBe('sb-abcdefghijkl-auth-token');
  });
});

describe('isAuthCookie', () => {
  it('accepts the cookie and its numbered chunks', () => {
    expect(isAuthCookie(BASE)).toBe(true);
    expect(isAuthCookie(`${BASE}.0`)).toBe(true);
    expect(isAuthCookie(`${BASE}.12`)).toBe(true);
  });

  it('leaves out the PKCE verifier and other projects', () => {
    expect(isAuthCookie(`${BASE}-code-verifier`)).toBe(false);
    expect(isAuthCookie('sb-otherproject-auth-token')).toBe(false);
    expect(isAuthCookie(`${BASE}.x`)).toBe(false);
  });
});

describe('readStoredSession', () => {
  // These characters are what base64url has and plain atob rejects.
  const session = {
    expires_at: 1_900_000_000,
    user: { id: '6f1c2b8e-0d4a-4c6e-9b1f-3a2d5e7f9c10', email: 'bo@comaogaotien.app' },
    // Bytes chosen so the encoding is certain to contain "-" and "_".
    filler: 'ûÿþ>>>???',
  };

  it('decodes a base64url session containing - and _', () => {
    const value = encode(session);
    expect(value).toMatch(/[-_]/);
    expect(readStoredSession([{ name: BASE, value }])).toMatchObject({
      expires_at: 1_900_000_000,
      user: { id: session.user.id },
    });
  });

  it('rejoins chunks in numeric order, past chunk 9', () => {
    const value = encode({ ...session, padding: 'x'.repeat(5000) });
    const size = Math.ceil(value.length / 11);
    const chunks = Array.from({ length: 11 }, (_, index) => ({
      name: `${BASE}.${index}`,
      value: value.slice(index * size, (index + 1) * size),
    }));
    // Shuffled the way a cookie header might list them: ".10" sorts before ".2" as text.
    const shuffled = [...chunks].sort((a, b) => a.name.localeCompare(b.name));
    expect(readStoredSession(shuffled)?.expires_at).toBe(1_900_000_000);
  });

  it('returns null with no session or garbage', () => {
    expect(readStoredSession([])).toBeNull();
    expect(readStoredSession([{ name: BASE, value: 'base64-%%%' }])).toBeNull();
  });
});
