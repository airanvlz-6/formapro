import { identityDependencies } from '@/lib/auth/supabaseServer';
import { verifySupabasePrincipal, resolveAuthenticatedAthlete, IdentityError } from '@/lib/auth/athleteIdentity';

/** Technical visit only. No client-selected athlete, counter, timestamp or patch. */
export async function POST(request: Request) {
  const respond = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  let writeAttempted = false;
  try {
    const { auth, db } = identityDependencies();
    const principal = await verifySupabasePrincipal(request, auth);
    const athlete = await resolveAuthenticatedAthlete(db, principal);
    const text = await request.text();
    let body: unknown = {};
    try { if (text) body = JSON.parse(text); }
    catch { return respond({ ok: false, code: 'VISIT_INPUT_INVALID', retryable: false }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
      return respond({ ok: false, code: 'VISIT_INPUT_INVALID', retryable: false }, 400);

    // Retry only a confirmed zero-row CAS, never an ambiguous write response.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await db.from('usuarios').select('total_visitas').eq('id', athlete.athleteId)
        .eq('auth_user_id', principal.authUserId).single();
      if (current.error || !current.data) return respond({ ok: false, code: 'VISIT_READ_FAILED', retryable: false }, 503);
      const before = current.data.total_visitas;
      if (before != null && (!Number.isSafeInteger(before) || before < 0 || before >= Number.MAX_SAFE_INTEGER))
        return respond({ ok: false, code: 'VISIT_COUNTER_INVALID', retryable: false }, 409);
      // Preserve the existing baseline: (total_visitas || 1) + 1.
      const count = (before || 1) + 1;
      const timestamp = new Date().toISOString();
      let query = db.from('usuarios').update({ ultima_visita: timestamp, total_visitas: count })
        .eq('id', athlete.athleteId).eq('auth_user_id', principal.authUserId);
      query = before == null ? query.is('total_visitas', null) : query.eq('total_visitas', before);
      writeAttempted = true;
      const saved = await query.select('id,total_visitas,ultima_visita');
      if (saved.error || !Array.isArray(saved.data))
        return respond({ ok: false, code: 'VISIT_WRITE_UNKNOWN', retryable: false }, 503);
      if (!saved.data.length) { writeAttempted = false; continue; }
      if (saved.data.length !== 1 || saved.data[0].id !== athlete.athleteId || saved.data[0].total_visitas !== count
        || Date.parse(saved.data[0].ultima_visita) !== Date.parse(timestamp))
        return respond({ ok: false, code: 'VISIT_WRITE_UNKNOWN', retryable: false }, 503);
      return respond({ ok: true, total_visitas: count, ultima_visita: timestamp, retryable: false });
    }
    return respond({ ok: false, code: 'VISIT_CONFLICT', retryable: false }, 409);
  } catch (error) {
    if (error instanceof IdentityError) return respond({ ok: false, code: error.code, retryable: false }, error.status);
    return respond({ ok: false, code: writeAttempted ? 'VISIT_WRITE_UNKNOWN' : 'VISIT_UNAVAILABLE', retryable: false }, 503);
  }
}
