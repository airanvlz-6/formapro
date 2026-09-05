import type { PlanCandidate, ValidatedPlanMutation } from './planMutationTypes';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidatedPlanMutation } from './planMutation';
import { isPlanRevision } from './planMutationValidators';

type DatabaseResponse = { data: unknown; error: unknown; status?: number };
/** Use the SDK's own query types: recursively comparing a handwritten fluent
 * interface with PostgREST generics exceeds TypeScript's instantiation depth.
 * Only from is needed; no new client or credentials are created here.
 */
export type PlanDatabase = Pick<SupabaseClient, 'from'>;
export type PlanPersistenceError = Readonly<{ code: string; message: string }>;
export type PlanPersistenceResult =
  | { status: 'committed'; planId: string; revision: number }
  | { status: 'conflict'; reason: 'precondition' | 'unique_constraint'; error?: PlanPersistenceError }
  | { status: 'error'; error: PlanPersistenceError }
  | { status: 'unknown'; error: PlanPersistenceError };

/** HTTP 200 action envelope: apiCall retries non-2xx, so conflicts/unknown must
 * be delivered as terminal application outcomes. False means unconfirmed, not rollback.
 */
export function planPersistenceFailure(result: Exclude<PlanPersistenceResult, { status: 'committed' }>) {
  const error = result.status === 'conflict' ? 'PLAN_REVISION_CONFLICT'
    : result.status === 'unknown' ? 'PLAN_PERSISTENCE_UNKNOWN' : 'PLAN_PERSISTENCE_ERROR';
  return { ok: false as const, error, persistenceStatus: result.status,
    commitConfirmed: false as const, retryable: false as const,
    message: result.status === 'unknown'
      ? 'No se puede confirmar si el cambio quedó guardado. No se ha reintentado.'
      : result.status === 'conflict' ? 'El plan ya no cumple la precondición de esta modificación.'
        : 'La escritura del plan devolvió un error confirmado.' };
}

const columns = 'id,user_codigo,week_start,revision';
const weekFields = ['week_number', 'total_weeks_block', 'block_name', 'week_objective', 'status', 'confidence'] as const;
function project(candidate: PlanCandidate, fields: readonly string[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(candidate, field) && candidate[field] !== undefined)
      payload[field] = candidate[field];
  }
  return payload;
}
const errorInfo = (error: unknown): PlanPersistenceError => {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return { code: typeof value.code === 'string' ? value.code : 'UNCLASSIFIED',
    message: typeof value.message === 'string' ? value.message : 'Persistence outcome could not be confirmed.' };
};
const localError = (code: string): PlanPersistenceResult => ({ status: 'error', error: { code, message: code } });

/** Conservative classification of structured SQLSTATE failures from a nonzero HTTP response.
 * Classes 22/23/40/42 and query_cancelled confirm failure of this statement. Other
 * responses (including PGRST116 cardinality errors), status 0, SDK-wrapped fetch
 * failures and all thrown exceptions are UNKNOWN. Never guess from timeout text.
 * An HTTP/transport failure is not evidence of rollback; reconciliation belongs to B.
 */
function classifyError(error: unknown, status: number | undefined, create: boolean): PlanPersistenceResult {
  const detail = errorInfo(error);
  if (status && status >= 400 && status < 600 && /^(?:22|23|40|42)[0-9A-Z]{3}$|^57014$/.test(detail.code)) {
    if (create && detail.code === '23505') return { status: 'conflict', reason: 'unique_constraint', error: detail };
    return { status: 'error', error: detail };
  }
  return { status: 'unknown', error: detail };
}
function confirm(response: DatabaseResponse, mutation: ValidatedPlanMutation, revision: number, create: boolean): PlanPersistenceResult {
  if (response.error != null) return classifyError(response.error, response.status, create);
  if (response.status !== undefined && (response.status < 200 || response.status >= 300))
    return { status: 'unknown', error: { code: 'UNCONFIRMED_HTTP_RESPONSE', message: 'No confirmed successful response.' } };
  if (response.data === null && !create) return { status: 'conflict', reason: 'precondition' };
  const row = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data as Record<string, unknown> : null;
  if (!row || typeof row.id !== 'string' || !row.id.trim()
    || (!create && row.id !== mutation.existingPlan?.id)
    || row.user_codigo !== mutation.command.target.userCodigo
    || row.week_start !== mutation.command.target.weekStart
    || !isPlanRevision(row.revision) || row.revision !== revision) {
    return { status: 'unknown', error: { code: 'WRITE_UNCONFIRMED', message: 'Returned row identity or revision was not confirmed.' } };
  }
  return { status: 'committed', planId: row.id, revision: row.revision };
}

/** Only strict validation receipts. Callers must eliminate no-ops BEFORE preparing IDs,
 * timestamps or calling this adapter. No read, retry, upsert, auth or side effects.
 */
export async function createPlan(db: PlanDatabase, mutation: ValidatedPlanMutation): Promise<PlanPersistenceResult> {
  if (!isValidatedPlanMutation(mutation) || mutation.command.operationType !== 'create_week')
    return localError('INVALID_CREATE_RECEIPT');
  const payload = { ...project(mutation.candidate, [...weekFields, 'sessions', 'resumen_semana', 'updated_at']),
    week_start: mutation.command.target.weekStart, user_codigo: mutation.command.target.userCodigo, revision: 1 };
  try {
    return confirm(await db.from('weekly_plan').insert(payload).select(columns).maybeSingle(), mutation, 1, true);
  } catch (error: unknown) { return { status: 'unknown', error: errorInfo(error) }; }
}

export async function mutatePlanWithCAS(db: PlanDatabase, mutation: ValidatedPlanMutation): Promise<PlanPersistenceResult> {
  if (!isValidatedPlanMutation(mutation) || mutation.command.operationType === 'create_week' || !mutation.existingPlan)
    return localError('INVALID_EXISTING_RECEIPT');
  const { command, candidate, existingPlan } = mutation;
  if (!isPlanRevision(command.expectedRevision) || !Number.isSafeInteger(command.expectedRevision + 1))
    return localError('INVALID_EXPECTED_REVISION');
  const fields = command.operationType === 'set_week_summary' ? ['resumen_semana']
    : command.operationType === 'regenerate_week' ? [...weekFields, 'sessions', 'updated_at']
      : command.operationType === 'patch_session' ? ['sessions', 'updated_at', 'confidence']
        : command.operationType === 'record_completion' ? ['sessions', 'updated_at'] : ['sessions'];
  const revision = command.expectedRevision + 1;
  const payload = { ...project(candidate, fields), revision };
  try {
    const response = await db.from('weekly_plan').update(payload)
      .eq('id', existingPlan.id).eq('user_codigo', command.target.userCodigo)
      .eq('revision', command.expectedRevision).select(columns).maybeSingle();
    return confirm(response, mutation, revision, false);
  } catch (error: unknown) { return { status: 'unknown', error: errorInfo(error) }; }
}
