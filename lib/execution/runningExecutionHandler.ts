import { IdentityError, resolveAuthenticatedAthlete, verifySupabasePrincipal } from '../auth/athleteIdentity';
import { ExecutionError } from './executionIntegrity';
import { writeRunningExecution, type ExecutionDatabase } from './runningExecutionStore';
import { resolveCompletionDate } from '../planning/recordCompletion';

type Dependencies = () => { auth: Parameters<typeof verifySupabasePrincipal>[1]; db: ExecutionDatabase };
export async function handleRunningExecution(request: Request, dependencies: Dependencies) {
  const respond = (body: unknown, status: number) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
  try {
    if (request.method !== 'POST') throw new ExecutionError('EXECUTION_METHOD_NOT_ALLOWED', 405);
    if (!/^Bearer ([^\s,]+)$/i.test(request.headers.get('authorization') ?? '')) throw new IdentityError('AUTH_REQUIRED', 401);
    const {auth, db} = dependencies();
    const principal = await verifySupabasePrincipal(request, auth);
    const athlete = await resolveAuthenticatedAthlete(db, principal);
    const text = await request.text();
    if (text.length > 100_000) throw new ExecutionError('EXECUTION_INPUT_TOO_LARGE', 413);
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new ExecutionError('EXECUTION_JSON_INVALID', 400); }
    const result = await writeRunningExecution(db, athlete.legacyCodigo, input, resolveCompletionDate(new Date().toISOString())!.date);
    return respond(result, result.ok ? 200 : 409);
  } catch (error) {
    const known = error instanceof IdentityError || error instanceof ExecutionError;
    return respond({ok:false, retryable:false, code:known ? error.code : 'EXECUTION_UNAVAILABLE'}, known ? error.status : 503);
  }
}
