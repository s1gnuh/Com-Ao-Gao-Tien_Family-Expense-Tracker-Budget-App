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
