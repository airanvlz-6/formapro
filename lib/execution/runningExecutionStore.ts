import { readCurrentExecutionRows } from './workoutReads';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDigest, ExecutionError } from './executionIntegrity';
import { validateRunningExecution, reconcileRunningExecutions, type RunningExecutionRecord } from './runningExecution';
import { currentWorkouts, recordWorkout, type WorkoutDatabase } from './workoutRegistry';

type Result = { data?: unknown; error: { code?: string } | null };
interface Query extends PromiseLike<Result> {
  eq(field: string, value: string): Query;
  order(field: string, options: { ascending: boolean }): Query;
  limit(value: number): Query;
}
export interface ExecutionDatabase {
  from(table: string): { select(fields: string): Query; insert(value: unknown): PromiseLike<Result> };
}
function signature(athlete: string, record: RunningExecutionRecord): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new ExecutionError('EXECUTION_VERIFICATION_UNAVAILABLE', 503);
  return createHmac('sha256', key).update('forge-execution-v1:' + canonicalDigest([athlete, record])).digest('hex');
}
export function sealRunningExecution(athlete: string, input: unknown, today: string) {
  const record = validateRunningExecution(input, athlete, today);
  return { user_codigo: athlete, execution_id: record.executionId, content_digest: canonicalDigest(record),
    record, signature: signature(athlete, record) };
}
/** No request may supply record, provenance or signature. Only this server writer seals validated reports. */
export async function writeRunningExecution(db: ExecutionDatabase, athlete: string, input: unknown, today: string) {
  const r = validateRunningExecution(input, athlete, today);
  const original = input as Record<string, unknown>;
  if (!r.executionId) throw new ExecutionError('EXECUTION_IDENTITY_AMBIGUOUS');
  const legacy = {data:await readCurrentExecutionRows(db,athlete)};
  if (legacy.data.some((row:any) => row.record?.version === 1 && row.record.executionId === r.executionId)) {
    const verified = await readRunningExecutions(db,athlete);
    if (verified.conflicts.includes(r.executionId) || !verified.records.some(old => canonicalDigest(old) === canonicalDigest(r)))
      throw new ExecutionError('EXECUTION_CONFLICT',409);
    return {ok:true,recorded:true,code:'EXECUTION_ALREADY_RECORDED',executionId:r.executionId};
  }
  if (r.planAssociation) throw new ExecutionError('WORKOUT_EXACT_PRESCRIPTION_REQUIRED');
  const {sourceActivityId: _source, occurredAt: _date, ...running} = original;
  const result = await recordWorkout(db as unknown as WorkoutDatabase, athlete, {requestId:`running:${r.executionId}`,
    confirmed:true, workout:{executedOn:r.occurredAt, discipline:'carrera', title:'Carrera', description:'Registro estructurado de carrera',
      result:r.completeness, running}}, today);
  return {ok:!result.record.deletedAt, recorded:!result.record.deletedAt,
    code:result.record.deletedAt ? 'WORKOUT_DELETED' : result.status === 'already_applied' ? 'EXECUTION_ALREADY_RECORDED' : 'EXECUTION_RECORDED', executionId:result.record.executionId};
}
/** Keyset read of current revisions and immutable v1 evidence. No log of payloads. */
export async function readRunningExecutions(db: ExecutionDatabase, athlete: string, window?: {startDate:string;endDate:string}) {
  return (await readRunningExecutionViews(db, athlete, window)).window;
}
/** Same verified read, two projections: existing B3 window and historical continuity. */
export async function readRunningExecutionViews(db: ExecutionDatabase, athlete: string, window?: {startDate:string;endDate:string}) {
  return projectRunningExecutionViews(athlete, await readCurrentExecutionRows(db,athlete), window);
}
export function projectRunningExecutionViews(athlete: string, rows: any[], window?: {startDate:string;endDate:string}) {
  const result = {data:rows};
  const current = currentWorkouts(athlete, result.data);
  const records = result.data.filter(raw => (raw as any).record?.version !== 2).map(raw => {
    const row = raw as { record: RunningExecutionRecord; signature: string; content_digest: string };
    try {
      const expected = Buffer.from(signature(athlete, row.record)), actual = Buffer.from(row.signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || row.record.version !== 1
        || row.record.athleteScope !== canonicalDigest(athlete) || row.content_digest !== canonicalDigest(row.record)) throw new Error();
      return row.record;
    } catch { throw new ExecutionError('EXECUTION_STORED_INTEGRITY_INVALID', 503); }
  }).concat(current.filter(r => !r.deletedAt && r.structuredRunning).map(r => r.structuredRunning!));
  // If any version intersects the window, compare every version of that identity. A conflicting
  // date cannot hide a contradiction; unrelated old executions do not block the current window.
  const relevantIds = window ? new Set(records.filter(r => r.occurredAt >= window.startDate && r.occurredAt <= window.endDate).map(r=>r.executionId)) : null;
  return { window: reconcileRunningExecutions(relevantIds ? records.filter(r=>relevantIds.has(r.executionId)) : records),
    history: reconcileRunningExecutions(records), workouts:current };
}
