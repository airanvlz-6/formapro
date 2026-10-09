import 'server-only';
import { IdentityError, resolveAuthenticatedAthlete, verifySupabasePrincipal } from '../auth/athleteIdentity';
import { getCanonicalProfile, saveCanonicalProfile } from './canonicalProfileService';

/**
 * GET /api/athlete/profile  — perfil canonico (lista blanca) del atleta autenticado.
 * PUT|PATCH /api/athlete/profile — guarda PLAN_STRUCTURE validado (semantica de actualizacion parcial) y, opcionalmente,
 * activa supervision|focus|coach reutilizando la transicion existente.
 *
 * Identidad: Bearer -> auth.getUser -> usuarios.auth_user_id. El body NUNCA elige atleta: un `codigo`, `email` o
 * cualquier otra clave fuera de { profile, activate } se rechaza antes de escribir.
 */
export async function handleAthleteProfile(request: Request, dependencies: () => { auth: any; db: any }) {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const header = request.headers.get('authorization');
    if (!header) throw new IdentityError('AUTH_REQUIRED', 401);
    if (!/^Bearer ([^\s,]+)$/i.test(header)) throw new IdentityError('AUTH_INVALID', 401);
    const method = request.method;
    if (!['GET', 'PUT', 'PATCH'].includes(method)) throw new IdentityError('AUTH_METHOD_NOT_ALLOWED', 405);
    const { auth, db } = dependencies();
    const principal = await verifySupabasePrincipal(request, auth);
    const athlete = await resolveAuthenticatedAthlete(db, principal);
    const result = method === 'GET'
      ? await getCanonicalProfile(db, athlete)
      : await (async () => {
        let body: unknown;
        try { body = await request.json(); } catch { return { status: 400, body: { ok: false, retryable: false, code: 'PROFILE_INVALID', errors: [{ field: 'body', code: 'PROFILE_PAYLOAD_INVALID' }] } }; }
        return saveCanonicalProfile(db, athlete, body);
      })();
    return respond(result.body, result.status);
  } catch (error) {
    const known = error instanceof IdentityError;
    return respond({ ok: false, retryable: false, code: known ? error.code : 'AUTH_VERIFICATION_UNAVAILABLE',
      error: 'No se ha podido completar la operacion.' }, known ? error.status : 503);
  }
}
