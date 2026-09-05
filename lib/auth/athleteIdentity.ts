import 'server-only';
import { randomBytes } from 'node:crypto';

export type VerifiedPrincipal = Readonly<{ authUserId: string }>;
export type AuthenticatedAthlete = Readonly<{
  principal: VerifiedPrincipal; athleteId: string; legacyCodigo: string;
}>;
export class IdentityError extends Error {
  constructor(public readonly code: string, public readonly status = 403) { super(code); }
}
type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null };
type AuthVerifier = { getUser(token: string): Promise<{ data: { user: AuthUser | null }; error: { status?: number } | null }> };
// Only principals issued by the verifier in this process can reach the resolver.
const verified = new WeakMap<VerifiedPrincipal, AuthUser>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifySupabasePrincipal(request: Request, auth: AuthVerifier): Promise<VerifiedPrincipal> {
  const header = request.headers.get('authorization');
  if (!header) throw new IdentityError('AUTH_REQUIRED', 401);
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  if (!match) throw new IdentityError('AUTH_INVALID', 401);
  let result;
  try { result = await auth.getUser(match[1]); }
  catch { throw new IdentityError('AUTH_VERIFICATION_UNAVAILABLE', 503); }
  if (result.error) {
    if (!result.error.status || result.error.status === 429 || result.error.status >= 500)
      throw new IdentityError('AUTH_VERIFICATION_UNAVAILABLE', 503);
    throw new IdentityError('AUTH_INVALID', 401);
  }
  const user = result.data.user;
  if (!user || !uuid.test(user.id)) throw new IdentityError('AUTH_INVALID', 401);
  if (!user.email_confirmed_at) throw new IdentityError('AUTH_EMAIL_CONFIRMATION_REQUIRED', 403);
  const principal = Object.freeze({ authUserId: user.id });
  verified.set(principal, user);
  return principal;
}

function trusted(principal: VerifiedPrincipal) {
  const user = verified.get(principal);
  if (!user) throw new IdentityError('AUTH_INVALID', 401);
  return user;
}

export async function resolveAuthenticatedAthlete(db: any, principal: VerifiedPrincipal,
  requestedCodigo?: string): Promise<AuthenticatedAthlete> {
  trusted(principal);
  let result;
  try { result = await db.from('usuarios').select('id,codigo,auth_user_id').eq('auth_user_id', principal.authUserId).limit(2); }
  catch { throw new IdentityError('ATHLETE_RESOLUTION_UNAVAILABLE', 503); }
  if (result.error || !Array.isArray(result.data)) throw new IdentityError('ATHLETE_RESOLUTION_UNAVAILABLE', 503);
  if (result.data.length === 0) throw new IdentityError('ATHLETE_NOT_LINKED', 404);
  if (result.data.length !== 1) throw new IdentityError('ATHLETE_LINK_AMBIGUOUS', 409);
  const row = result.data[0];
  if (!uuid.test(row.id) || typeof row.codigo !== 'string' || !row.codigo.trim() || row.auth_user_id !== principal.authUserId)
    throw new IdentityError('ATHLETE_LINK_INVALID', 409);
  if (requestedCodigo !== undefined && requestedCodigo !== row.codigo) throw new IdentityError('ATHLETE_MISMATCH');
  return Object.freeze({ principal, athleteId: row.id, legacyCodigo: row.codigo });
}

export async function bootstrapNewAthlete(db: any, principal: VerifiedPrincipal, input: any): Promise<AuthenticatedAthlete> {
  const user = trusted(principal);
  if (input?.intent !== 'create_new_account') throw new IdentityError('ACCOUNT_BOOTSTRAP_INTENT_REQUIRED', 400);
  try { return await resolveAuthenticatedAthlete(db, principal); }
  catch (error) { if (!(error instanceof IdentityError) || error.code !== 'ATHLETE_NOT_LINKED') throw error; }
  const profile = input?.profile;
  if (!profile || !['funcional', 'carrera', 'fuerza', 'hibrido'].includes(profile.categoria)
    || typeof profile.objetivo !== 'string' || !profile.objetivo.trim() || profile.objetivo.length > 500
    || !['Principiante', 'Intermedio', 'Avanzado'].includes(profile.nivel))
    throw new IdentityError('ACCOUNT_PROFILE_INVALID', 400);
  // No legacy lookup, update, relink or client-supplied identity/privileges.
  const payload = {
    auth_user_id: principal.authUserId,
    codigo: `FP-${randomBytes(10).toString('hex').toUpperCase()}`,
    email: user.email ?? null,
    categoria: profile.categoria, especialidad: profile.categoria,
    perfil: { objetivo_general: profile.objetivo.trim(), nivel: profile.nivel },
    modo_entrada: 'supervision', marcas: [], historial: [],
    admin: false, premium: false,
  };
  let result;
  try { result = await db.from('usuarios').insert(payload); }
  catch { throw new IdentityError('ACCOUNT_BOOTSTRAP_UNAVAILABLE', 503); }
  if (result.error && result.error.code !== '23505') throw new IdentityError('ACCOUNT_BOOTSTRAP_UNAVAILABLE', 503);
  // UNIQUE(auth_user_id) arbitrates concurrent creation. Never retries INSERT.
  try { return await resolveAuthenticatedAthlete(db, principal); }
  catch (error) {
    if (error instanceof IdentityError && error.code === 'ATHLETE_NOT_LINKED')
      throw new IdentityError('ACCOUNT_BOOTSTRAP_CONFLICT', 409);
    throw error;
  }
}
