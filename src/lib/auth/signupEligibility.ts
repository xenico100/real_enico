export type SignupIdentity = {
  is_anonymous?: boolean | null;
  app_metadata?: Record<string, unknown> | null;
};

export function isAnonymousSignup(user: SignupIdentity) {
  if (typeof user.is_anonymous === 'boolean') return user.is_anonymous;
  const metadata = user.app_metadata || {};
  const provider = typeof metadata.provider === 'string' ? metadata.provider.trim().toLowerCase() : '';
  const providers = Array.isArray(metadata.providers) ? metadata.providers : [];
  return provider === 'anonymous' || providers.some(value => typeof value === 'string' && value.trim().toLowerCase() === 'anonymous');
}

/** Missing configuration keeps the 24-hour guard; a present invalid value fails closed. */
export function parseSignupCutoff(value: string | undefined): { ok: true; at: number | null } | { ok: false } {
  if (value === undefined) return { ok: true, at: null };
  const text = value.trim();
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  const at = Date.parse(text);
  if (!parts || !Number.isFinite(at)) return { ok: false };
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return { ok: false };
  return { ok: true, at };
}
