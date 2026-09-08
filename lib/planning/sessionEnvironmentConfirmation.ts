import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
export const ENVIRONMENT_CONFIRMATION_COOKIE = 'forge_session_environment';
export const ENVIRONMENT_CONFIRMATION_TTL_SECONDS = 600;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
function sign(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('ENVIRONMENT_CONFIRMATION_KEY_UNAVAILABLE');
  return createHmac('sha256', secret).update('forge-session-environment-confirmation-v1:' + payload).digest('base64url');
}
type Binding = { user: string; weekStart: string; generationToken: string };
/** Called only after successful preflight validated the submitted confirmation digest. */
export function issueEnvironmentConfirmation(binding: Binding, availabilityDigest: unknown, now = Date.now()): string | null {
  if (typeof availabilityDigest !== 'string' || !digestPattern.test(availabilityDigest)) return null;
  const payload = Buffer.from(JSON.stringify({ version: 1, userHash: hash(binding.user), weekStart: binding.weekStart,
    generationHash: hash(binding.generationToken), availabilityDigest, issuedAt: now,
    expiresAt: now + ENVIRONMENT_CONFIRMATION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readEnvironmentConfirmation(cookieHeader: unknown, binding: Binding, now = Date.now()): string | null {
  try {
    if (typeof cookieHeader !== 'string') return null;
    const values = cookieHeader.split(';').map(v => v.trim()).filter(v => v.startsWith(ENVIRONMENT_CONFIRMATION_COOKIE + '='));
    if (values.length !== 1) return null;
    const token = values[0].slice(ENVIRONMENT_CONFIRMATION_COOKIE.length + 1);
    if (token.length > 2048) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload)), received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const evidence = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (evidence.version !== 1 || evidence.userHash !== hash(binding.user) || evidence.weekStart !== binding.weekStart
      || evidence.generationHash !== hash(binding.generationToken) || !Number.isFinite(evidence.expiresAt)
      || !Number.isFinite(evidence.issuedAt) || now < evidence.issuedAt || now >= evidence.expiresAt
      || evidence.expiresAt - evidence.issuedAt !== ENVIRONMENT_CONFIRMATION_TTL_SECONDS * 1000
      || typeof evidence.availabilityDigest !== 'string' || !digestPattern.test(evidence.availabilityDigest)) return null;
    return evidence.availabilityDigest;
  } catch { return null; }
}
