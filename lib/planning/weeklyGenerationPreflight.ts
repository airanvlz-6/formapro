import { loadWeeklyCalendarContext, weeklyDigest } from './weeklyCalendarAuthority';
import { prepareAllowedWeeklyPlanContract } from './prepareAllowedWeeklyPlanContract';
import { calendarDays, calendarKey } from './weeklyCalendar';
import { readAvailabilityConfirmation } from '../sports/chatAvailability';

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

export async function resolveWeeklyGenerationPreflight(db: any, codigo: string, request: {
  targetWeekStart: string; today: string; snapshot: { sessions: readonly any[] } | null; temporalIntent?: unknown; temporalReply?: boolean; planningRunId?: string; confirmedAvailabilityDigest?: string | null;
}) {
  let availabilityStatus: 'VALID' | 'MISSING' | 'INVALID' | 'READ_ERROR' | 'NOT_CHECKED' = 'NOT_CHECKED';
  try {
    const c = await loadWeeklyCalendarContext(db, codigo);
    if (Object.values(c.allowed).some(days => days.some(day => !calendarDays.includes(day)))) throw new Error('CALENDAR_AVAILABILITY_INVALID');
    availabilityStatus = 'VALID';
    // Reuse the existing confirmation digest. A temporal answer is not confirmation of changed availability.
    if (request.confirmedAvailabilityDigest != null && request.confirmedAvailabilityDigest !== weeklyDigest({
      distribution: c.profile.distribucion_semanal, sources: c.sources, scope: c.scope })) {
      const confirmation = await readAvailabilityConfirmation(db, codigo);
      if (!confirmation.ok) return { ok: false, code: confirmation.code, availabilityStatus, canContinue: false, temporalDecision: null };
      return { ok: false, code: 'AVAILABILITY_CONFIRMATION_STALE', availabilityStatus, canContinue: false,
        temporalDecision: null, snapshotDigest: confirmation.snapshotDigest,
        preflightRequirement: { kind: 'availability', text: confirmation.question } };
    }
    const explicit = parseIncludeToday(request.temporalIntent, request.temporalReply === true);
    const index = (Date.parse(request.today) - Date.parse(request.targetWeekStart)) / 86400000;
    const todayInTarget = Number.isInteger(index) && index >= 0 && index < calendarDays.length;
    // Potential calendar relevance only. Never evaluate movements, strategy, dose or DP to decide whether to ask.
    const relevantDays = todayInTarget ? calendarDays.filter((day, i) => i >= index
      && c.scope.managedDisciplines.some(discipline => c.allowed[discipline].includes(day))
      && !request.snapshot?.sessions.some(s => s.completada === true && typeof s.dia === 'string' && calendarKey(s.dia) === day)
      && !c.sources.some((source: { owner: string; dias?: string[] }) => source.owner === 'external'
        && Array.isArray(source.dias) && source.dias.some(d => calendarKey(d) === day))) : [];
    if (explicit === null && todayInTarget && relevantDays.length) return {
      ok: true, code: 'TEMPORAL_DECISION_REQUIRED', temporalStatus: 'TEMPORAL_DECISION_UNRESOLVED',
      availabilityStatus, availability: c.allowed, targetWeekStart: request.targetWeekStart,
      canContinue: false, temporalDecision: null,
      preflightRequirement: { kind: 'temporal', targetWeekStart: request.targetWeekStart,
        options: [{ value: true, label: 'Incluir hoy' }, { value: false, label: 'Próximo día disponible' }],
        text: '¿Quieres empezar hoy o desde el próximo día disponible? Las sesiones ya completadas se conservan. Responde «incluir hoy» o «próximo día disponible».' } };
    // Outside the target interval, includeToday cannot change any target slot. No unresolved default enters feasibility.
    const temporalDecision = { includeToday: explicit !== null ? explicit : false,
      reason: explicit !== null ? 'explicit_intent' : !todayInTarget ? 'today_outside_target_week' : 'no_remaining_managed_days' };
    const prepared = await prepareAllowedWeeklyPlanContract(db, codigo, { ...request,
      empezarHoy: temporalDecision.includeToday, strategyVersion: 1, diagnosticTemporalDecision: explicit });
    if (!prepared.ok) return { ...prepared, availabilityStatus, canContinue: false,
      temporalStatus: 'TEMPORAL_DECISION_RESOLVED', temporalDecision };
    return { ok: true, availabilityStatus, availability: c.allowed, canContinue: true,
      temporalStatus: 'TEMPORAL_DECISION_RESOLVED', temporalDecision };
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
