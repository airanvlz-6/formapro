import type { PlanDatabase } from './planPersistence';

/** Compatibility boundary. A turn/tool ordinal is not a user-confirmed request identity. */
export async function recordExternalExecution(db: any, user: string, input: {
  date: string; description: string; discipline: string; durationMinutes?: number; rpe?: number;
  requestId?: string; confirmed?: boolean; result?: string;
}, _source: { operationId: string; messageId: string; message: string }, today: string) {
  if (!input.requestId || input.confirmed !== true)
    return {status:'confirmation_required', code:'WORKOUT_CONFIRMED_REQUEST_REQUIRED', planCompleted:false};
  const { recordWorkout } = await import('../execution/workoutRegistry');
  return { ...await recordWorkout(db, user, {requestId:input.requestId, confirmed:true, workout:{executedOn:input.date,
    discipline:input.discipline, title:input.description, description:input.description,
    ...(input.result === undefined ? {} : {result:input.result}),
    ...(input.durationMinutes === undefined ? {} : {durationSeconds:input.durationMinutes * 60}),
    ...(input.rpe === undefined ? {} : {rpe:input.rpe})}}, today), planCompleted:false };
}
/** Date-only means a Canary civil date; timestamps must carry an explicit offset.
 * UTC arithmetic below is calendar arithmetic, never the process timezone. */
export function resolveCompletionDate(value: unknown): { date: string; weekStart: string; day: string } | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const civil = value.slice(0, 10);
  const calendarDate = new Date(`${civil}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== civil) return null;
  let date = civil;
  if (value.length > 10) {
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime()) || Number(value.slice(11, 13)) > 23) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    date = `${part('year')}-${part('month')}-${part('day')}`;
  }
  const dayDate = new Date(`${date}T00:00:00.000Z`);
  const index = dayDate.getUTCDay();
  dayDate.setUTCDate(dayDate.getUTCDate() - (index || 7) + 1);
  return { date, weekStart: dayDate.toISOString().slice(0, 10),
    day: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][index] };
}

type CompletionEvidence = {
  source: 'explicit_completion' | 'deterministic_completion';
  userCodigo: unknown;
  fecha: unknown;
  title: unknown;
  description: unknown;
};

export type CompletionResult = {
  ok: boolean;
  planCompleted: boolean;
  historyOnly?: boolean;
  alreadyCompleted?: boolean;
  corrected?: boolean;
  status: string;
  error?: string;
  revision?: number;
  planId?: string;
  persistenceStatus?: 'committed' | 'conflict' | 'error' | 'unknown';
};

/** Retired day-based writer. Exact confirmed requests go through recordWorkout. */
export async function recordPlanCompletion(
  supabase: PlanDatabase,
  evidence: CompletionEvidence,
  validate?: typeof import('./planMutation').validatePlanMutation,
): Promise<CompletionResult> {
  // Old date/day completion cannot establish an exact canonical execution identity.
  // Call recordWorkout with a confirmed stable request and an exact prescription instead.
  return {ok:false, planCompleted:false, status:'WORKOUT_CONFIRMED_REQUEST_REQUIRED', error:'WORKOUT_CONFIRMED_REQUEST_REQUIRED'};
}
