import type { WorkoutDatabase, WorkoutRecord } from './workoutRegistry';
import { projectRunningExecutionViews } from './runningExecutionStore';
import { ExecutionError } from './executionIntegrity';
import { verifyWorkoutRow } from './workoutIntegrity';
import { resolveCompletionDate } from '../planning/recordCompletion';

/** Serializable projection shared by web, mobile and Coach. Legacy values retain their original provenance. */
export function projectWorkout(r: WorkoutRecord) {
  return { ...r.data, executionId:r.executionId, revision:r.revision, createdAt:r.createdAt, updatedAt:r.updatedAt,
    source:'running_execution_records.v2', verification:r.verification, fecha:r.data.executedOn,
    tipo:r.data.discipline, titulo:r.data.title, descripcion:r.data.description, notas:[r.data.description,r.data.result,r.data.observations].filter(Boolean).join('\n'),
    resultado:r.data.result, ...(r.data.durationSeconds === undefined ? {} : {duracion:r.data.durationSeconds / 60}),
    ...(r.data.sensations === undefined ? {} : {sensacion:r.data.sensations}), workout_id:r.executionId };
}
export async function readWorkoutHistory(db: Pick<WorkoutDatabase, 'from'>, athlete: string,
  options: {limit?: number; cursor?: string; executionId?: string; fromDate?: string; toDate?: string} = {}) {
  const limit = options.limit ?? 60;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new ExecutionError('WORKOUT_LIMIT_INVALID');
  for (const date of [options.fromDate,options.toDate]) if (date !== undefined && resolveCompletionDate(date)?.date !== date)
    throw new ExecutionError('WORKOUT_DATE_INVALID');
  if (options.fromDate && options.toDate && options.fromDate > options.toDate) throw new ExecutionError('WORKOUT_DATE_INVALID');
  const scope = JSON.stringify([options.executionId ?? null,options.fromDate ?? null,options.toDate ?? null]);
  let before: string | undefined;
  let cursorVersion: string | undefined;
  if (options.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(options.cursor,'base64url').toString());
      if (cursor.version !== 1 || cursor.athlete !== athlete || cursor.scope !== scope || typeof cursor.key !== 'string' || cursor.key.length > 2000
        || typeof cursor.revisionCount !== 'string' || !/^\d+$/.test(cursor.revisionCount)) throw Error();
      before = cursor.key;
      cursorVersion = cursor.revisionCount;
    } catch { throw new ExecutionError('WORKOUT_CURSOR_INVALID'); }
  }
  const readVersion = async (): Promise<string> => {
    const result = await db.from('workout_history_version').select('revision_count').eq('user_codigo',athlete).limit(1);
    if (result.error || !Array.isArray(result.data) || result.data.length && !/^\d+$/.test(result.data[0].revision_count))
      throw new ExecutionError('WORKOUT_HISTORY_READ_FAILED',503);
    return result.data[0]?.revision_count ?? '0';
  };
  const revisionCount = await readVersion();
  if (cursorVersion !== undefined && cursorVersion !== revisionCount) throw new ExecutionError('WORKOUT_CURSOR_STALE',409);
  const candidates: any[] = [];
  // Fetch one extra candidate, in small keyset batches even when PostgREST caps results.
  while (candidates.length <= limit) {
    let q = db.from('workout_history_entries').select('*').eq('user_codigo',athlete)
      .order('chronology_key',{ascending:false}).limit(Math.min(200,limit+1-candidates.length));
    if (options.executionId) q = q.eq('execution_id',options.executionId);
    if (options.fromDate) q = q.gte('day',options.fromDate);
    if (options.toDate) q = q.lte('day',options.toDate);
    if (before !== undefined) q = q.lt('chronology_key',before);
    const result = await q;
    if (result.error || !Array.isArray(result.data)) throw new ExecutionError('WORKOUT_HISTORY_READ_FAILED',503);
    if (!result.data.length) break;
    const next = result.data.at(-1).chronology_key;
    if (typeof next !== 'string' || before !== undefined && next >= before) throw new ExecutionError('WORKOUT_CURSOR_NOT_ADVANCING',503);
    candidates.push(...result.data); before = next;
  }
  const page = candidates.slice(0,limit), records: any[] = [], conflicts: string[] = [];
  for (const entry of page) {
    const r = entry.payload, base = {historyId:entry.identity,executedOn:entry.day};
    if (entry.kind === 'canonical') records.push(projectWorkout(verifyWorkoutRow(athlete,r)));
    else if (entry.kind === 'running') {
      const view = projectRunningExecutionViews(athlete,r).history;
      conflicts.push(...view.conflicts);
      for (const run of view.records) records.push({...base, executionId:run.executionId, fecha:run.occurredAt,
        tipo:'carrera',source:'running_execution_records.v1',verification:run.verification,structuredRunning:run});
    } else if (entry.kind === 'legacy') records.push({...r,...base,...(r.source ? {legacySource:r.source} : {}),
      source:'usuarios.workout_history',verification:'LEGACY_UNVERIFIED'});
    else if (entry.kind === 'report') records.push({...base,source:'weekly_plan.chatExecutionEvidence',verification:'LEGACY_ATHLETE_REPORT',
      fecha:r.executionDate,tipo:r.discipline,descripcion:r.reportedExecution?.description ?? r.quote,legacyRecord:r});
    else if (entry.kind === 'completion') records.push({...base,source:'weekly_plan.sessions',verification:'LEGACY_COMPLETION_DATE_UNKNOWN',
      tipo:r.tipo,descripcion:r.descripcion_real,legacyRecord:r});
    else throw new ExecutionError('WORKOUT_HISTORY_READ_FAILED',503);
  }
  const truncated = candidates.length > limit, last = page.at(-1);
  // A concurrent edit can move execution dates across a keyset boundary. Reject
  // the traversal rather than return duplicate/missing executions from mixed states.
  if (await readVersion() !== revisionCount) throw new ExecutionError('WORKOUT_CURSOR_STALE',409);
  return {records, truncated, nextCursor:truncated && last ? Buffer.from(JSON.stringify({version:1,athlete,scope,revisionCount,key:last.chronology_key})).toString('base64url') : null,
    semantics:'CURRENT_CANONICAL_WITH_EXPLICIT_LEGACY_PROVENANCE',legacyRunningConflicts:conflicts};
}
