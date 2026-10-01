import { readWorkoutLookup } from './workoutReads';
import { IdentityError, resolveAuthenticatedAthlete, verifySupabasePrincipal } from '../auth/athleteIdentity';
import { ExecutionError } from './executionIntegrity';
import { recordWorkout, updateWorkout, deleteWorkout, verifyWorkoutRow, type WorkoutDatabase } from './workoutRegistry';
import { readWorkoutHistory } from './workoutHistory';
import { resolveCompletionDate } from '../planning/recordCompletion';

export async function handleWorkouts(request: Request, dependencies: () => {
  auth: Parameters<typeof verifySupabasePrincipal>[1]; db: WorkoutDatabase;
}) {
  const respond = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
  try {
    const {auth, db} = dependencies();
    const athlete = await resolveAuthenticatedAthlete(db, await verifySupabasePrincipal(request, auth));
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      if (params.has('requestId')) {
        const raw = await readWorkoutLookup(db,athlete.legacyCodigo,'request_id',params.get('requestId')!);
        const receipt = raw ? verifyWorkoutRow(athlete.legacyCodigo,raw) : null;
        const current = receipt ? await readWorkoutLookup(db,athlete.legacyCodigo,'execution_id',receipt.executionId) : null;
        return respond({record:current ? verifyWorkoutRow(athlete.legacyCodigo,current) : null});
      }
      if (params.has('prescriptionsOn')) {
        const date = params.get('prescriptionsOn'), civil = resolveCompletionDate(date);
        if (!civil || civil.date !== date) throw new ExecutionError('WORKOUT_DATE_INVALID');
        const result = await db.from('weekly_plan').select('id,sessions').eq('user_codigo',athlete.legacyCodigo)
          .eq('week_start',civil.weekStart).limit(100);
        if (result.error || !Array.isArray(result.data)) throw new ExecutionError('WORKOUT_READ_FAILED',503);
        const day = (v: unknown) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        return respond({prescriptions:result.data.flatMap((p:any) => (p.sessions ?? []).filter((s:any) =>
          s.session_id && day(s.dia) === day(civil.day) && !['descanso','unavailable','external_blocked'].includes(s.tipo))
          .map((s:any) => ({planId:String(p.id),sessionId:s.session_id,title:s.titulo ?? s.tipo})))});
      }
      return respond(await readWorkoutHistory(db, athlete.legacyCodigo, {
        limit: Number(params.get('limit') ?? 60), cursor: params.get('cursor') ?? undefined, executionId: params.get('executionId') ?? undefined,
        fromDate: params.get('fromDate') ?? undefined, toDate: params.get('toDate') ?? undefined }));
    }
    const text = await request.text();
    if (text.length > 100000) throw new ExecutionError('WORKOUT_INPUT_TOO_LARGE', 413);
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new ExecutionError('WORKOUT_JSON_INVALID', 400); }
    const operation = request.method === 'POST' ? recordWorkout : request.method === 'PUT' ? updateWorkout : request.method === 'DELETE' ? deleteWorkout : null;
    if (!operation) throw new ExecutionError('WORKOUT_METHOD_NOT_ALLOWED', 405);
    return respond({ok:true, ...await operation(db, athlete.legacyCodigo, input, resolveCompletionDate(new Date().toISOString())!.date)});
  } catch (e) {
    const known = e instanceof IdentityError || e instanceof ExecutionError;
    return respond({ok:false, code: known ? e.code : 'WORKOUT_UNAVAILABLE', retryable: known && e.code === 'WORKOUT_WRITE_UNCONFIRMED'}, known ? e.status : 503);
  }
}
