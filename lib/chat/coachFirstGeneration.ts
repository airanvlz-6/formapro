import { beginWeeklyGeneration } from '../planning/weeklyGeneration';
import { resolveWeeklyGenerationPreflight } from '../planning/weeklyGenerationPreflight';
import { readAvailabilityConfirmation } from '../sports/chatAvailability';
import { calendarDays, calendarKey } from '../planning/weeklyCalendar';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { readCoachProfile, reportedEventProjection } from './coachFirstStore';
import { samePlanData } from '../planning/planMutationValidators';
import { decodeTurnPlanningIntent, bindTurnPlanningIntent, emitTurnPlanningDiagnostic, turnPlanningText,
  type TurnPlanningProjection, type TurnPlanningLayer } from '../planning/turnPlanningIntent';

export const GENERATION_ARGUMENT_REASONS = ['ARGUMENTS_FALSY', 'UNKNOWN_ARGUMENT_KEY', 'WEEK_RESOLUTION_MISMATCH',
  'INCLUDE_TODAY_NOT_BOOLEAN', 'SNAPSHOT_DIGEST_NOT_STRING'] as const;
export type GenerationArgumentReason = typeof GENERATION_ARGUMENT_REASONS[number];

export type CoachFirstPlanning = { user: string; operationId: string; reportedEvents: ReturnType<typeof reportedEventProjection>;
  readonly turnIntent?: TurnPlanningProjection;
  availabilityDigest: string; availability: unknown; week: string; includeToday: boolean;
  assertFresh: () => Promise<void>; confirmSaved: (planId: string, revision: number, sessions: unknown) => Promise<boolean> };
export const coachFirstPlanningText = (c?: CoachFirstPlanning, layer: TurnPlanningLayer = 'Planning') => c ?
  '\nCOACH_FIRST_REPORTED_EVENTS (reported, not verified; no automatic taper; same snapshot throughout generation):\n'
  + JSON.stringify({ operationId: c.operationId, targetWeek: c.week, includeToday: c.includeToday,
    availability: c.availability, availabilityDigest: c.availabilityDigest, digest: c.reportedEvents.digest,
    records: c.reportedEvents.records.map(({ provenance, ...event }: any) => event) }) + turnPlanningText(c.turnIntent, layer) : '';

/** Coordinates the existing Analyzer/Weekly/Builder/save handlers in process. No HTTP replay. */
export async function generateCoachFirstWeek(db: any, user: string, a: any, operationId: string, today: string,
  execute: (action: string, datos: any, context: CoachFirstPlanning) => Promise<any>,
  onArgumentRejection?: (reason: GenerationArgumentReason) => void) {
  // Preserve the original predicates and short-circuit order, including absent week semantics.
  const argumentReason: GenerationArgumentReason | undefined = !a ? 'ARGUMENTS_FALSY'
    : Object.keys(a).some(k => !['week','includeToday','snapshotDigest','turnIntent'].includes(k)) ? 'UNKNOWN_ARGUMENT_KEY'
    : resolveCompletionDate(a.week)?.weekStart !== a.week ? 'WEEK_RESOLUTION_MISMATCH'
    : typeof a.includeToday !== 'boolean' ? 'INCLUDE_TODAY_NOT_BOOLEAN'
    : typeof a.snapshotDigest !== 'string' ? 'SNAPSHOT_DIGEST_NOT_STRING' : undefined;
  if (argumentReason) {
    try { onArgumentRejection?.(argumentReason); } catch { /* Diagnostics cannot change validation. */ }
    return { status: 'rejected', code: 'GENERATION_ARGUMENT_INVALID' };
  }
  const interpreted = decodeTurnPlanningIntent(a.turnIntent);
  if (!interpreted.ok) return { status: 'rejected', code: 'TURN_PLANNING_INTENT_INVALID' };
  const turnIntent = interpreted.intent ? bindTurnPlanningIntent(interpreted.intent, operationId, a.week) : undefined;
  if (turnIntent) {
    emitTurnPlanningDiagnostic(turnIntent, 'generate_week.received');
    emitTurnPlanningDiagnostic(turnIntent, 'generate_week.validated');
  }
  const availability = await readAvailabilityConfirmation(db, user, a.week);
  if (!availability.ok || availability.snapshotDigest !== a.snapshotDigest) return { status: 'conflict', code: 'GENERATION_AVAILABILITY_CHANGED' };
  const events = reportedEventProjection(await readCoachProfile(db, user));
  const context: CoachFirstPlanning = { user, operationId, reportedEvents: events, availabilityDigest: a.snapshotDigest,
    ...(turnIntent ? { turnIntent } : {}),
    availability: availability.availability, week: a.week, includeToday: a.includeToday,
    confirmSaved: async (id, revision, sessions) => {
      try {
        const r = await db.from('weekly_plan').select('revision,sessions').eq('user_codigo', user).eq('id', id).single();
        return !r.error && r.data?.revision === revision && samePlanData(r.data.sessions, sessions);
      } catch { return false; }
    },
    assertFresh: async () => {
      if (reportedEventProjection(await readCoachProfile(db, user)).digest !== events.digest) throw new Error('GENERATION_EVENTS_CHANGED');
      const current = await readAvailabilityConfirmation(db, user, a.week);
      if (!current.ok || current.snapshotDigest !== a.snapshotDigest) throw new Error('GENERATION_AVAILABILITY_CHANGED');
    } };
  const generation = await beginWeeklyGeneration(db, user, today);
  if (![generation.currentWeek, generation.nextWeek].includes(a.week)) return { status: 'rejected', code: 'GENERATION_WEEK_INVALID' };
  const common = { generationToken: generation.token, targetWeekStart: a.week, confirmedAvailabilityDigest: a.snapshotDigest };
  const preflight = await resolveWeeklyGenerationPreflight(db, user, { targetWeekStart: a.week, today,
    snapshot: generation.snapshots[a.week], temporalIntent: a.includeToday, confirmedAvailabilityDigest: a.snapshotDigest,
    planningRunId: generation.planningRunId });
  if (!preflight.canContinue) return { status: 'rejected', requirements: preflight };
  const run = async (action: string, datos: any) => { await context.assertFresh(); return execute(action, datos, context); };
  // From here planning may reserve a longitudinal target. Any failure is terminal for this operation.
  try {
    const analyzer = await run('analizar_bloque_semana', common);
    if (!analyzer.ok) return { status: 'partial', code: 'ANALYZER_FAILED', operationId };
    const planner = await run('planificar_semana', { ...common, weeklyContractVersion: 2, empezarHoy: a.includeToday, analisis: analyzer.analisis });
    if (!planner.ok || ![2,3].includes(planner.estructura?.weeklyContractVersion)) return { status: 'partial', code: 'PLANNER_NOT_ADMITTED', requirements: planner, operationId };
    const structure = planner.estructura;
    const old = generation.snapshots[a.week]?.sessions ?? [];
    const slots = structure.sessions as any[];
    if (!Array.isArray(slots) || slots.length !== 7 || new Set(slots.map(s => calendarKey(s.dia))).size !== 7
      || slots.some(s => !calendarDays.includes(calendarKey(s.dia)))) return { status: 'partial', code: 'WEEKLY_SLOT_COVERAGE_INVALID', operationId };
    const executable = (slot: any) => !slot.weeklyProtected && !old.some((s: any) => calendarKey(s.dia) === calendarKey(slot.dia) && s.completada)
      && !['descanso','external_blocked','sin_registrar','unavailable'].includes(slot.tipo);
    if (slots.some(slot => slot.weeklyProtected && !old.some((s: any) => calendarKey(s.dia) === calendarKey(slot.dia))))
      return { status: 'partial', code: 'PROTECTED_SESSION_MISSING', operationId };
    const targets = slots.filter(executable);
    const diagnostic = (name: string, fields: Record<string, unknown>) => {
      try { console.info(name, { planningRunId: generation.planningRunId ?? null, ...fields }); } catch { /* Observation only. */ }
    };
    const started = Date.now();
    diagnostic('PARALLEL_BUILDERS_START', { count: targets.length, days: targets.map(s => calendarKey(s.dia)) });
    // allSettled waits for every in-flight call, including failures. No session is persisted here.
    const results = await Promise.allSettled(slots.map(async (slot, index) => {
      const original = old.find((s: any) => calendarKey(s.dia) === calendarKey(slot.dia));
      if (slot.weeklyProtected || original?.completada) {
        return original;
      }
      if (slot.tipo === 'descanso') return { dia: slot.dia, tipo: 'descanso', titulo: 'Descanso',
        por_que: 'Recuperación programada', descripcion: 'Día de descanso — prioriza sueño, hidratación y nutrición.' };
      if (!executable(slot)) return slot;
      const slotStarted = Date.now();
      let passed = false;
      try {
        const built = await run('construir_sesion_dia', { ...common, ...slot,
          calendarReceipt: structure.calendarReceipt, contractDigest: structure.contractDigest, contextDigest: structure.contextDigest, analisis: analyzer.analisis,
          diaAnterior: structure.sessions[index - 1] ?? null, diaSiguiente: structure.sessions[index + 1] ?? null });
        if (!built.ok || !built.sesion || calendarKey(built.sesion.dia) !== calendarKey(slot.dia) || built.sesion.tipo !== slot.tipo)
          throw new Error('BUILDER_NOT_ADMITTED');
        passed = true;
        return built.sesion;
      } finally { diagnostic('PARALLEL_BUILDER_COMPLETE', { day: calendarKey(slot.dia), durationMs: Date.now() - slotStarted, result: passed ? 'PASS' : 'FAIL' }); }
    }));
    const failureCount = results.filter(r => r.status === 'rejected').length;
    diagnostic('PARALLEL_BUILDERS_FAN_IN', { totalDurationMs: Date.now() - started, successCount: targets.length - failureCount, failureCount });
    if (failureCount) return { status: 'partial', code: 'BUILDER_NOT_ADMITTED', operationId };
    const sessions = results.map(r => (r as PromiseFulfilledResult<any>).value);
    sessions.sort((x,y) => calendarDays.indexOf(calendarKey(x.dia)) - calendarDays.indexOf(calendarKey(y.dia)));
    const plan = { week_start: a.week, week_number: structure.longitudinal?.semana ?? 1,
      total_weeks_block: structure.longitudinal?.totalSemanas ?? null,
      block_name: structure.longitudinal?.bloque ?? analyzer.analisis.tipo_semana,
      week_objective: structure.strategy.adaptacion_principal, sessions };
    const saved = await run('guardar_plan_semana', { ...common, plan, calendarReceipt: structure.calendarReceipt, weeklyContractVersion: 2 });
    return { ...saved, status: saved.commitConfirmed ? 'committed' : saved.persistenceStatus === 'conflict' ? 'conflict' : 'partial', operationId,
      reportedEventsDigest: events.digest, analyzerAuxiliaryEffects: 'not_persisted_coach_first' };
  } catch { return { status: 'unknown', code: 'GENERATION_UNCONFIRMED', operationId, reportedEventsDigest: events.digest }; }
}
