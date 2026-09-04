import { validatePlanMutation } from './planMutation';
import type { PlanCandidate, PlanMutationCommand, PlanMutationContext, PlanChangeSet } from './planMutationTypes';

const normalizeDay = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Date-only means a Madrid civil date; timestamps must carry an explicit offset.
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
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
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
};

/** Plan-only adapter. Source selects correction policy; it is not authentication.
 * Evidence, cardinality, rest and repeat policy are checked here, not by the core. */
export async function recordPlanCompletion(
  supabase: any,
  evidence: CompletionEvidence,
  validate: typeof validatePlanMutation = validatePlanMutation,
): Promise<CompletionResult> {
  const fail = (error: string): CompletionResult => ({ ok: false, planCompleted: false, status: error, error });
  const historyOnly = (status: string): CompletionResult => ({ ok: true, planCompleted: false, historyOnly: true, status });
  const { source, userCodigo, title, description } = evidence;
  if (!['explicit_completion', 'deterministic_completion'].includes(source)
    || typeof userCodigo !== 'string' || !userCodigo.trim()
    || typeof title !== 'string' || !title.trim()
    || typeof description !== 'string' || !description.trim()) return fail('INVALID_COMPLETION_EVIDENCE');
  const effective = resolveCompletionDate(evidence.fecha);
  if (!effective) return fail('INVALID_COMPLETION_DATE');
  let stage = 'PLAN_READ_FAILED';
  try {
    const { data: existingPlan, error: readError } = await supabase.from('weekly_plan').select('*')
      .eq('user_codigo', userCodigo).eq('week_start', effective.weekStart).maybeSingle();
    if (readError) return fail(stage);
    if (!existingPlan) return historyOnly('no_plan');
    if (existingPlan.user_codigo !== userCodigo || existingPlan.week_start !== effective.weekStart) return fail('PLAN_IDENTITY_MISMATCH');
    if (!Array.isArray(existingPlan.sessions)) return fail('INVALID_PLAN_SESSIONS');
    const indices = existingPlan.sessions.flatMap((session: any, index: number) =>
      typeof session?.dia === 'string' && normalizeDay(session.dia) === normalizeDay(effective.day) ? [index] : []);
    if (!indices.length) return historyOnly('no_target');
    if (indices.length !== 1) return fail('AMBIGUOUS_COMPLETION_TARGET');
    const index = indices[0];
    const target = existingPlan.sessions[index];
    if (typeof target.tipo === 'string' && /descanso/i.test(target.tipo)) return historyOnly('rest_target');
    const alreadyCompleted = target.completada === true;
    if (alreadyCompleted && target.titulo_real === title && target.descripcion_real === description) {
      return { ok: true, planCompleted: true, alreadyCompleted: true, status: 'already_completed_noop' };
    }
    if (alreadyCompleted && source === 'deterministic_completion') {
      return { ...fail('already_completed_conflict'), alreadyCompleted: true };
    }
    // Explicit correction-on-completed is intentional. The core has no separate correction operation.
    const replacement = { ...target, completada: true, titulo_real: title, descripcion_real: description };
    const candidate: PlanCandidate = { ...existingPlan,
      sessions: existingPlan.sessions.map((session: any, i: number) => i === index ? replacement : session),
      updated_at: new Date().toISOString() };
    const command: PlanMutationCommand = { source, operationType: 'record_completion',
      target: { userCodigo, weekStart: effective.weekStart, day: target.dia }, proposal: { title, description } };
    const context: PlanMutationContext = { existingPlan, normalizedWeekStart: effective.weekStart };
    const changeSet: PlanChangeSet = { operationType: 'record_completion', affectedDays: [target.dia],
      changedFields: ['completada', 'titulo_real', 'descripcion_real']
        .filter(key => !Object.is(target[key], replacement[key])).map(key => `sessions.${index}.${key}`)
        .concat(Object.is(existingPlan.updated_at, candidate.updated_at) ? [] : ['updated_at']) };
    stage = 'PLAN_MUTATION_VALIDATION_FAILED';
    const validationResult = await validate({ command, context, candidate, changeSet });
    if (validationResult.status !== 'ready_for_commit') {
      return fail(validationResult.status === 'rejected' ? 'PLAN_MUTATION_REJECTED' : stage);
    }
    stage = 'PLAN_WRITE_FAILED';
    const { data: saved, error: writeError } = await supabase.from('weekly_plan').update({
      sessions: validationResult.candidate.sessions, updated_at: validationResult.candidate.updated_at,
    }).eq('user_codigo', userCodigo).eq('week_start', effective.weekStart).select('user_codigo,week_start').maybeSingle();
    if (writeError) return fail(stage);
    if (!saved || saved.user_codigo !== userCodigo || saved.week_start !== effective.weekStart) return fail('PLAN_WRITE_UNCONFIRMED');
    return { ok: true, planCompleted: true, corrected: alreadyCompleted,
      status: alreadyCompleted ? 'explicit_correction' : 'completed' };
  } catch {
    return fail(stage);
  }
}
