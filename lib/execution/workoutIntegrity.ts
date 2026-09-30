import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDigest, ExecutionError } from './executionIntegrity';
import type { WorkoutRecord, WorkoutRow } from './workoutContracts';
export function workoutSignature(athlete: string, record: WorkoutRecord) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new ExecutionError('EXECUTION_VERIFICATION_UNAVAILABLE', 503);
  return createHmac('sha256', key).update('forge-workout-v2:' + canonicalDigest([athlete, record])).digest('hex');
}
export function verifyWorkoutRow(athlete: string, raw: unknown): WorkoutRecord {
  try {
    const r = raw as WorkoutRow, record = r.record;
    const expected = Buffer.from(workoutSignature(athlete, record)), actual = Buffer.from(r.signature);
    if (record.version !== 2 || record.athleteScope !== canonicalDigest(athlete) || !Number.isSafeInteger(record.revision) || record.revision < 1
      || r.content_digest !== canonicalDigest(record) || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    return record;
  } catch { throw new ExecutionError('WORKOUT_STORED_INTEGRITY_INVALID', 503); }
}
/** Select current revisions before filtering dates/deletions; old dates must never resurrect corrected evidence. */
export function currentWorkouts(athlete: string, rows: readonly unknown[]): WorkoutRecord[] {
  const current = new Map<string, WorkoutRecord>();
  for (const raw of rows) {
    if ((raw as WorkoutRow).record?.version !== 2) continue;
    const r = verifyWorkoutRow(athlete, raw), prior = current.get(r.executionId);
    if (prior?.revision === r.revision && canonicalDigest(prior) !== canonicalDigest(r)) throw new ExecutionError('WORKOUT_REVISION_CONFLICT', 503);
    if (!prior || prior.revision < r.revision) current.set(r.executionId, r);
  }
  return [...current.values()].sort((a,b) => b.data.executedOn.localeCompare(a.data.executedOn) || b.executionId.localeCompare(a.executionId));
}
