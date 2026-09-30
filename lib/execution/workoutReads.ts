import type { WorkoutDatabase } from './workoutContracts';
import { ExecutionError } from './executionIntegrity';

type Database = Pick<WorkoutDatabase, 'from'>;
/** Current v2 revisions plus immutable v1 rows. Never transfers superseded revisions.
 * Keyset pages remain valid under PostgREST's row cap; even a short page is continued
 * until empty, so an installation with a smaller cap cannot silently truncate data. */
export async function readCurrentExecutionRows(db: Database, athlete: string) {
  const rows: any[] = []; let after: string | undefined;
  for (;;) {
    let q = db.from('workout_read_rows').select('*').eq('user_codigo', athlete)
      .order('read_key', {ascending:true}).limit(200);
    if (after) q = q.gt('read_key', after);
    const result = await q;
    if (result.error || !Array.isArray(result.data)) throw new ExecutionError('WORKOUT_READ_FAILED',503);
    if (!result.data.length) return rows;
    const next = result.data.at(-1).read_key;
    if (typeof next !== 'string' || after && next <= after) throw new ExecutionError('WORKOUT_CURSOR_NOT_ADVANCING',503);
    rows.push(...result.data); after = next;
  }
}
/** Exact lookups use the existing unique indexes, not an athlete's full history. */
export async function readWorkoutLookup(db: Database, athlete: string, field: 'execution_id' | 'request_id', value: string) {
  const result = await db.from(field === 'execution_id' ? 'workout_current_records' : 'running_execution_records')
    .select('record,signature,content_digest').eq('user_codigo',athlete).eq('record_version',2).eq(field,value).limit(1);
  if (result.error || !Array.isArray(result.data)) throw new ExecutionError('WORKOUT_READ_FAILED',503);
  return result.data[0] ?? null;
}
