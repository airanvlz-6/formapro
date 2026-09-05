import 'server-only';
import { bootstrapNewAthlete, IdentityError, resolveAuthenticatedAthlete, verifySupabasePrincipal } from './athleteIdentity';

export async function handleAthleteIdentity(request: Request, dependencies: () => { auth: any; db: any }) {
  const respond = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  try {
    // Missing/malformed credentials fail before creating privileged clients.
    const header = request.headers.get('authorization');
    if (!header) throw new IdentityError('AUTH_REQUIRED', 401);
    if (!/^Bearer ([^\s,]+)$/i.test(header)) throw new IdentityError('AUTH_INVALID', 401);
    const { auth, db } = dependencies();
    const principal = await verifySupabasePrincipal(request, auth);
    let athlete;
    if (request.method === 'GET') athlete = await resolveAuthenticatedAthlete(db, principal);
    else if (request.method === 'POST') {
      let input;
      try { input = await request.json(); } catch { throw new IdentityError('ACCOUNT_PROFILE_INVALID', 400); }
      athlete = await bootstrapNewAthlete(db, principal, input);
    } else throw new IdentityError('AUTH_METHOD_NOT_ALLOWED', 405);
    return respond({ ok: true, athlete });
  } catch (error) {
    const known = error instanceof IdentityError;
    return respond({ ok: false, retryable: false,
      code: known ? error.code : 'AUTH_VERIFICATION_UNAVAILABLE',
      error: 'No se ha podido completar el acceso.' }, known ? error.status : 503);
  }
}
