import { readCurrentExecutionRows, readWorkoutLookup } from './workoutReads';
import { workoutSignature, verifyWorkoutRow, currentWorkouts } from './workoutIntegrity';
export { verifyWorkoutRow, currentWorkouts } from './workoutIntegrity';
import { canonicalDigest, ExecutionError, keys, object } from './executionIntegrity';
import { validateWorkoutExtensions } from './workoutRunningAdapter';
import { resolveCompletionDate } from '../planning/recordCompletion';

import type { WorkoutData, WorkoutRecord, WorkoutDatabase } from './workoutContracts';
export type { WorkoutData, WorkoutRecord, WorkoutRow, WorkoutDatabase, WorkoutRequest, UpdateWorkoutRequest, DeleteWorkoutRequest } from './workoutContracts';
const fields = ['executedOn','discipline','title','description','result','durationSeconds','distanceMeters','averageHeartRateBpm',
  'maximumHeartRateBpm','rpe','loadKg','sensations','observations','discomfort','prescription','libraryWorkoutId','running'];
function id(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(v)) throw new ExecutionError('WORKOUT_ID_INVALID');
}
function validate(input: unknown, athlete: string, today: string, executionId: string) {
  const d = object(input); keys(d, fields);
  if (typeof d.executedOn !== 'string' || resolveCompletionDate(d.executedOn)?.date !== d.executedOn || d.executedOn > today)
    throw new ExecutionError('WORKOUT_DATE_INVALID');
  for (const k of ['discipline','title','description','result','sensations','observations','discomfort']) {
    const required = ['discipline','title','description'].includes(k);
    if ((required || d[k] !== undefined) && (typeof d[k] !== 'string' || (d[k] as string).length > (k === 'discipline' ? 80 : 5000)
      || required && !(d[k] as string).trim())) throw new ExecutionError('WORKOUT_TEXT_INVALID');
  }
  for (const k of ['durationSeconds','distanceMeters','averageHeartRateBpm','maximumHeartRateBpm','rpe','loadKg']) {
    if (d[k] !== undefined && (typeof d[k] !== 'number' || !Number.isFinite(d[k]) || (d[k] as number) < 0
      || (d[k] as number) > (k === 'rpe' ? 10 : Number.MAX_SAFE_INTEGER))) throw new ExecutionError('WORKOUT_METRIC_INVALID');
  }
  if (d.libraryWorkoutId != null) throw new ExecutionError('WORKOUT_LIBRARY_REFERENCE_UNSUPPORTED');
  if (d.prescription !== undefined) {
    const p = object(d.prescription); keys(p, ['planId','sessionId','relation']); id(p.planId); id(p.sessionId);
    if (!['performed','replaced'].includes(String(p.relation))) throw new ExecutionError('WORKOUT_PRESCRIPTION_INVALID');
  }
  return { data: structuredClone(d) as WorkoutData, ...validateWorkoutExtensions(d as WorkoutData, athlete, today, executionId) };
}
export const readWorkoutRows = readCurrentExecutionRows;
export async function readWorkouts(db: Pick<WorkoutDatabase, 'from'>, athlete: string, includeDeleted = false) {
  return currentWorkouts(athlete, await readWorkoutRows(db, athlete)).filter(r => includeDeleted || !r.deletedAt);
}
async function mutate(db: WorkoutDatabase, athlete: string, operation: WorkoutRecord['operation'], input: unknown, today: string) {
  if (!athlete || resolveCompletionDate(today)?.date !== today) throw new ExecutionError('WORKOUT_CONTEXT_INVALID');
  const a = object(input); keys(a, operation === 'create' ? ['requestId','confirmed','workout'] :
    operation === 'update' ? ['requestId','confirmed','workout','executionId','expectedRevision'] : ['requestId','confirmed','executionId','expectedRevision']);
  id(a.requestId);
  if (a.confirmed !== true) throw new ExecutionError('WORKOUT_CONFIRMATION_REQUIRED');
  const executionId = operation === 'create' ? canonicalDigest([athlete, 'workout-v2', a.requestId]) : a.executionId;
  id(executionId);
  if (operation !== 'create' && (!Number.isSafeInteger(a.expectedRevision) || (a.expectedRevision as number) < 1)) throw new ExecutionError('WORKOUT_REVISION_REQUIRED');
  const requestDigest = canonicalDigest({operation, ...a});
  // Read the receipt first: a concurrently committed receipt must never be paired
  // with an earlier empty/current lookup and reported without its persisted record.
  const receiptRow = await readWorkoutLookup(db,athlete,'request_id',a.requestId);
  const currentRow = await readWorkoutLookup(db,athlete,'execution_id',executionId);
  const current = currentRow ? verifyWorkoutRow(athlete,currentRow) : undefined;
  const replay = receiptRow ? verifyWorkoutRow(athlete,receiptRow) : undefined;
  if (replay) {
    if (replay.requestDigest !== requestDigest || replay.executionId !== executionId) throw new ExecutionError('WORKOUT_REQUEST_CONFLICT', 409);
    return {status: 'already_applied', record: current!};
  }
  if (operation !== 'create' && !current) throw new ExecutionError('WORKOUT_NOT_FOUND', 404);
  if (current?.deletedAt) {
    if (operation === 'delete') return {status:'already_applied', record: current};
    throw new ExecutionError('WORKOUT_DELETED', 409);
  }
  if (operation !== 'create' && current!.revision !== a.expectedRevision) throw new ExecutionError('WORKOUT_REVISION_CONFLICT', 409);
  const now = new Date(Math.max(Date.now(), current ? Date.parse(current.updatedAt) + 1 : 0)).toISOString();
  const validated = operation === 'delete' ? {data:current!.data, ...(current!.structuredRunning ? {structuredRunning:current!.structuredRunning} : {})}
    : validate(a.workout, athlete, today, executionId);
  const references = [...(current?.prescriptionReferences ?? []), ...(validated.data.prescription ?
    [{planId:validated.data.prescription.planId,sessionId:validated.data.prescription.sessionId}] : [])];
  const record: WorkoutRecord = { version: 2, executionId, athleteScope: canonicalDigest(athlete), revision: (current?.revision ?? 0) + 1,
    requestId: a.requestId, requestDigest, operation, createdAt: current?.createdAt ?? now, updatedAt: now,
    deletedAt: operation === 'delete' ? now : null, source: 'confirmed_workout', verification: 'SERVER_VALIDATED_SELF_REPORT',
    prescriptionReferences:references.filter((r,i) => references.findIndex(p => p.planId === r.planId && p.sessionId === r.sessionId) === i),
    ...validated };
  const row = {record, signature: workoutSignature(athlete, record), content_digest: canonicalDigest(record)};
  let response;
  try { response = await db.rpc('mutate_workout', {p_user: athlete, p_operation: operation, p_expected: a.expectedRevision ?? 0, p_row: row}); }
  catch { throw new ExecutionError('WORKOUT_WRITE_UNCONFIRMED', 503); }
  if (response.error) throw new ExecutionError('WORKOUT_WRITE_UNCONFIRMED', 503);
  if (response.data?.code) throw new ExecutionError(response.data.code, response.data.code === 'WORKOUT_NOT_FOUND' ? 404 : 409);
  const saved = verifyWorkoutRow(athlete, response.data?.row);
  if (saved.executionId !== executionId) throw new ExecutionError('WORKOUT_WRITE_UNCONFIRMED', 503);
  return {status: response.data.status as 'committed' | 'already_applied', record: saved};
}
export const recordWorkout = (db: WorkoutDatabase, athlete: string, input: unknown, today: string) => mutate(db, athlete, 'create', input, today);
/** Full replacement of declared data: omitted optional fields are removed, never merged with stale values. */
export const updateWorkout = (db: WorkoutDatabase, athlete: string, input: unknown, today: string) => mutate(db, athlete, 'update', input, today);
export const deleteWorkout = (db: WorkoutDatabase, athlete: string, input: unknown, today: string) => mutate(db, athlete, 'delete', input, today);
