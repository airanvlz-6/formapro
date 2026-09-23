import 'server-only';
import { IdentityError, resolveAuthenticatedAthlete, verifySupabasePrincipal } from './athleteIdentity';

/** All public chat operations cross this boundary, before domain dispatch. */
export async function authorizeChatRequest(request: Request, dependencies: () => { auth: any; db: any }) {
  const { auth, db } = dependencies();
  const principal = await verifySupabasePrincipal(request, auth);
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IdentityError('INPUT_INVALID', 400);
  const athlete = await resolveAuthenticatedAthlete(db, principal, body.codigo);
  if (body.action === 'guardar_usuario') throw new IdentityError('AUTH_REGISTRATION_REQUIRED');
  return { ...body, codigo: athlete.legacyCodigo };
}
