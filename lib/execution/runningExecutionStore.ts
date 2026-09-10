import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDigest, ExecutionError } from './executionIntegrity';
import { validateRunningExecution, reconcileRunningExecutions, type RunningExecutionRecord } from './runningExecution';

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
  const row = sealRunningExecution(athlete, input, today);
  if (!row.execution_id) throw new ExecutionError('EXECUTION_IDENTITY_AMBIGUOUS');
  const result = await db.from('running_execution_records').insert(row);
  if (result.error && result.error.code !== '23505') throw new ExecutionError('EXECUTION_WRITE_FAILED', 503);
  // Immutable append: contradictory facts remain visible; no last-wins overwrite, even concurrently.
  const evidence = await readRunningExecutions(db, athlete);
  if (evidence.conflicts.includes(row.execution_id)) return { ok: false, recorded: true, code: 'EXECUTION_CONFLICT', executionId: row.execution_id };
  if (!evidence.records.some(r => r.executionId === row.execution_id && canonicalDigest(r) === row.content_digest)) throw new ExecutionError('EXECUTION_WRITE_UNCONFIRMED', 503);
  return { ok: true, recorded: true, code: result.error ? 'EXECUTION_ALREADY_RECORDED' : 'EXECUTION_RECORDED', executionId: row.execution_id };
}
/** Bounded read fails closed rather than silently dropping conflicts/older records. No log of payloads. */
export async function readRunningExecutions(db: ExecutionDatabase, athlete: string, window?: {startDate:string;endDate:string}) {
  const result = await db.from('running_execution_records').select('record,signature,content_digest').eq('user_codigo', athlete)
    .order('created_at', { ascending: false }).limit(1001);
  if (result.error || !Array.isArray(result.data)) throw new ExecutionError('EXECUTION_READ_FAILED', 503);
  if (result.data.length > 1000) throw new ExecutionError('EXECUTION_READ_CAP_EXCEEDED', 503);
  const records = result.data.map(raw => {
    const row = raw as { record: RunningExecutionRecord; signature: string; content_digest: string };
    try {
      const expected = Buffer.from(signature(athlete, row.record)), actual = Buffer.from(row.signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || row.record.version !== 1
        || row.record.athleteScope !== canonicalDigest(athlete) || row.content_digest !== canonicalDigest(row.record)) throw new Error();
      return row.record;
    } catch { throw new ExecutionError('EXECUTION_STORED_INTEGRITY_INVALID', 503); }
  });
  // If any version intersects the window, compare every version of that identity. A conflicting
  // date cannot hide a contradiction; unrelated old executions do not block the current window.
  const relevantIds = window ? new Set(records.filter(r => r.occurredAt >= window.startDate && r.occurredAt <= window.endDate).map(r=>r.executionId)) : null;
  return reconcileRunningExecutions(relevantIds ? records.filter(r=>relevantIds.has(r.executionId)) : records);
}
