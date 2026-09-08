import { loadWeeklyCalendarContext } from './weeklyCalendarAuthority';
import { prepareAllowedWeeklyPlanContract } from './prepareAllowedWeeklyPlanContract';
import { calendarDays } from './weeklyCalendar';
import type { AllowedWeeklyPlanContract } from './allowedWeeklyPlanContract';

/** A request-local choice, never a persistent availability or ownership change. */
export function parseIncludeToday(value: unknown, answeringQuestion = false): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string' || value.length > 1000) return null;
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¡!¿?,.;]/g, ' ').replace(/\s+/g, ' ').trim();
  if (answeringQuestion && ['si', 'no'].includes(text)) return text === 'si';
  if (['hoy', 'si hoy', 'empezar hoy', 'empezamos hoy', 'incluir hoy', 'desde hoy'].includes(text)) return true;
  if (['hoy no', 'no hoy', 'excluir hoy', 'sin hoy', 'desde manana', 'a partir de manana', 'proximo dia disponible'].includes(text)) return false;
  const request = /^(?:genera|regenera|planifica|prepara)(?:me)? (?:mi |la |una )?(?:proxima )?semana (desde hoy|incluyendo hoy|sin hoy|desde manana|a partir de manana)$/.exec(text);
  return request ? ['desde hoy', 'incluyendo hoy'].includes(request[1]) : null;
}

/** Existence proof under the actual weekly count/rest/coverage constraints, forcing a NEW TRAIN today.
 * Does not alter strategy, select a session, or ask the model to decide temporal authority. */
export function admitsNewTrainToday(contract: AllowedWeeklyPlanContract, today: string): boolean {
  const groups = contract.strategy?.coverage || [], full = (1 << groups.length) - 1;
  let states = new Set(['0:0:0']);
  for (const day of calendarDays) {
    const options = contract.dayOptions[day].filter(o => day !== today || o.state === 'TRAIN' && !o.protected);
    const signatures = [...new Set(options.map(o => `${Number(['TRAIN', 'RECOVERY'].includes(o.state))}:${Number(o.state === 'REST')}:${groups.reduce((mask, g, i) => mask | (o.intent?.kind === 'adaptation'
      && (!g.adaptationId || o.intent.adaptationId === g.adaptationId) && (!g.discipline || o.discipline === g.discipline)
      && (!g.weaknessId || o.intent.weaknessId === g.weaknessId) ? 1 << i : 0), 0)}`))];
    const next = new Set<string>();
    for (const state of states) for (const signature of signatures) {
      const [n, rest, mask] = state.split(':').map(Number), [add, r, bits] = signature.split(':').map(Number);
      if (n + add <= contract.frequencyPolicy.maxExecutableDays) next.add(`${n + add}:${rest | r}:${mask | bits}`);
    }
    states = next;
  }
  return [...states].some(state => { const [n, rest, mask] = state.split(':').map(Number);
    return n >= contract.frequencyPolicy.minExecutableDays && (!contract.frequencyPolicy.requireGenuineRest || !!rest) && mask === full; });
}

export async function resolveWeeklyGenerationPreflight(db: any, codigo: string, request: {
  targetWeekStart: string; today: string; snapshot: { sessions: readonly any[] } | null; temporalIntent?: unknown; temporalReply?: boolean; planningRunId?: string;
}) {
  let availabilityStatus: 'VALID' | 'MISSING' | 'INVALID' | 'READ_ERROR' | 'NOT_CHECKED' = 'NOT_CHECKED';
  try {
    const c = await loadWeeklyCalendarContext(db, codigo);
    if (Object.values(c.allowed).some(days => days.some(day => !calendarDays.includes(day)))) throw new Error('CALENDAR_AVAILABILITY_INVALID');
    availabilityStatus = 'VALID';
    const explicit = parseIncludeToday(request.temporalIntent, request.temporalReply === true);
    // Keep the existing empezarHoy transport name at the adapter boundary only.
    const prepared = await prepareAllowedWeeklyPlanContract(db, codigo, { ...request, empezarHoy: explicit ?? true, strategyVersion: 1,
      diagnosticTemporalDecision: explicit });
    if (!prepared.ok) return { ...prepared, availabilityStatus, canContinue: false, temporalDecision: null };
    const index = Math.round((Date.parse(request.today) - Date.parse(request.targetWeekStart)) / 86400000);
    const today = calendarDays[index];
    const needsChoice = explicit === null && !!today && admitsNewTrainToday(prepared.contract, today);
    if (needsChoice) return { ok: true, availabilityStatus, availability: c.allowed, canContinue: false, temporalDecision: null,
      preflightRequirement: { kind: 'temporal', text: 'Hoy admite una sesión nueva. ¿Quieres incluir hoy en esta planificación? Responde «incluir hoy» o «excluir hoy».' } };
    return { ok: true, availabilityStatus, availability: c.allowed, canContinue: true,
      temporalDecision: { includeToday: explicit ?? true, reason: explicit !== null ? 'explicit_intent' : !today ? 'today_outside_target_week' : 'no_admissible_new_train_today' } };
  } catch (error: any) {
    const code = typeof error?.message === 'string' && /^[A-Z_]+(?::[a-z_]+)?$/.test(error.message) ? error.message : 'PREFLIGHT_READ_FAILED';
    availabilityStatus = code === 'CALENDAR_AVAILABILITY_REQUIRED' ? 'MISSING'
      : ['CALENDAR_AVAILABILITY_INVALID', 'CALENDAR_AVAILABILITY_UNRESOLVED'].includes(code) ? 'INVALID'
      : code.includes('READ') || code === 'PREFLIGHT_READ_FAILED' ? 'READ_ERROR' : availabilityStatus;
    const requirement = ['MISSING', 'INVALID'].includes(availabilityStatus)
      ? { kind: 'availability', text: 'No tengo una disponibilidad habitual válida. Indica la disciplina y sus días disponibles.' }
      : code === 'CALENDAR_SCOPE_INVALID' ? { kind: 'scope', text: 'La delegación de disciplinas no permite iniciar esta planificación. Revisa el modo y las disciplinas que gestiona Forge.' } : null;
    return { ok: false, code, availabilityStatus, canContinue: false, temporalDecision: null,
      ...(requirement ? { preflightRequirement: requirement } : {}) };
  }
}
