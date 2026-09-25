import { weeklyDeclaration } from '../sports/weeklyAvailabilityDeclaration';
import { runningPolicyGuidance } from '../sports/runningEvidencePolicy';
import { transferMethod } from '../sports/goalTransferModel';
import { buildWeeklyCoachingContext, loadWeeklyCoachingSupplement } from './weeklyCoachingContext';
import { scopeRunningHistory } from '../execution/historicalRunning';
import { projectWeeklyPrescriptionSignals } from './weeklyPrescriptionSignals';
import { buildDoseCapabilityProfile } from '../sports/doseCapabilityProfile';
import { evaluateTrainingFeasibility } from '../sports/trainingFeasibility';
import type { PlannerCompletion } from './weeklyPlannerDiagnostics';
import { loadWeeklyCalendarContext, issueWeeklyCalendar, weeklyDigest, availabilitySnapshotDigest } from './weeklyCalendarAuthority';
import { calendarDays, calendarKey, calendarState, isProtectedCalendarSession, legacyProtectedCalendarSession, calendarProtectionReason, type ProtectionReason } from './weeklyCalendar';
import { openSelection } from './openWeeklyCoachContract';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { prepareSessionTrainingContext } from '../sports/prepareSessionTrainingContract';
import type { ContractInput } from '../sports/allowedTrainingContract';
import { buildAllowedWeeklyPlanContract, composeBoundedWeek, type WeeklyContractInput } from './allowedWeeklyPlanContract';
import { admitSessionContent } from '../sports/sessionAuthority';
import { loadAthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { buildCanonicalWeekStrategy } from './canonicalWeekStrategy';
import { humanWeeklyObjective } from '../sports/humanCoachingProjection';
import { selectedWeekObjective } from './selectedWeekObjective';
import { ensureLongitudinalTarget, loadLongitudinalProjection } from './longitudinalAuthority';
import { strategyDiagnostic, weeklyCoachStepDiagnostic } from './planningDiagnostics';
import { resolveGoalAuthority, goalResolutionDiagnostic } from '../athlete/goalResolution';
import { resolveEventAuthority } from '../athlete/eventAuthority';
import { decideRunningEventPreparation } from '../sports/runningEventPreparation';
import { requireGoalAuthority } from '../athlete/goalAnswers';
import { resolvePlanningStrategy } from '../athlete/strategyResolution';

/** Read-only preparation, before any Planner call. Bounded reads per discipline, never per option. */
export async function loadWeeklyPlanningContext(db: any, codigo: string, request: {
  targetWeekStart: string; today: string; empezarHoy: boolean; snapshot: { sessions: readonly any[] } | null;
  strategyVersion?: 1; strategyProposal?: unknown; planningRunId?: string; diagnosticTemporalDecision?: boolean | null;
  confirmedAvailabilityDigest?: string | null;
  coherenceVersion?: 1;
  openCoachVersion?: 1 | 2;
  preservationVersion?: 1 | 2;
  /** Server-selected immutable survivors for a bounded chat reassessment; bound into the receipt. */
  preserveDays?: string[];
}) {
  const c = await loadWeeklyCalendarContext(db, codigo, request.targetWeekStart);
  const declaration = weeklyDeclaration(c.profile.perfil, request.targetWeekStart);
  try { console.info('WEEKLY_AVAILABILITY_RESOLVED', { planningRunId: request.planningRunId ?? null, normalizedDays: c.allowed, normalizedDisciplines: Object.keys(c.allowed), source: declaration?.source ?? 'profile_default', resolution: declaration?.resolution ?? 'PROFILE_DEFAULT', explicitExclusions: declaration?.excludedDisciplines ?? [], unresolvedDaysCount: declaration?.unresolvedDays.length ?? 0 }); } catch { /* Observation only. */ }
  if (request.strategyVersion !== undefined && request.strategyVersion !== 1) throw new Error('STRATEGY_VERSION_UNSUPPORTED');
  const athlete = request.strategyVersion === 1 ? await loadAthletePrescriptionContext(db, codigo, { asOfDate: request.today, runningHabitualInteraction: request.planningRunId ? {planningRunId:request.planningRunId,targetWeekStart:request.targetWeekStart} : undefined }) : undefined;
  const longitudinal = request.coherenceVersion === 1 ? await loadLongitudinalProjection(db, codigo, request.targetWeekStart) : undefined;
  if (athlete && longitudinal) athlete.cycle = { ...athlete.cycle,
    block: { ...athlete.cycle.block, value: longitudinal.bloque }, week: { ...athlete.cycle.week, value: longitudinal.semana },
    totalWeeks: { ...athlete.cycle.totalWeeks, value: longitudinal.totalSemanas } };
  if (athlete) {
    const goal = resolveGoalAuthority(athlete), resolution = resolvePlanningStrategy(athlete), admitted = resolution.status === 'STRATEGY_RESOLVED';
    console.log('GOAL_RESOLUTION_DIAGNOSTIC', goalResolutionDiagnostic(goal));
    console.log('WEEK_STRATEGY_ADMISSION', { planningRunId: request.planningRunId ?? null, goalStatus: goal.status,
      strategyStatus: resolution.status, strategyId: resolution.strategyId, strategySource: resolution.source,
      strategySpecificity: resolution.strategySpecificity,
      admitted, reason: admitted ? 'supported_planning_strategy' : 'strategy_resolution_required' });
    if (!admitted) return { ok: false as const, code: resolution.status, retryable: false,
      goalRequirement: await requireGoalAuthority(db, codigo) };
  }
  const event = athlete ? resolveEventAuthority(athlete.eventInput, athlete.planningStrategy.strategyId, c.scope, request.today, codigo) : null;
  const eventCycle = athlete && event?.targetEvent?.goalId === 'half_marathon' && event.targetEvent.status === 'active'
    ? {...athlete,cycle:{...athlete.cycle,
      block:{...athlete.cycle.block,value:null},week:{...athlete.cycle.week,value:null},totalWeeks:{...athlete.cycle.totalWeeks,value:null}}} : athlete;
  const strategy = eventCycle ? buildCanonicalWeekStrategy(eventCycle, c.scope, c.max, request.strategyProposal) : undefined;
  const runningEventPreparation = athlete && strategy ? decideRunningEventPreparation({
    eventAuthority: resolveEventAuthority(athlete.eventInput, strategy.goal.id, c.scope, request.today, codigo),
    runningHistory: athlete.runningHistory, scope: c.scope, restrictions: athlete.restrictions.value, referenceDate: request.today,
    availability: c.profile.distribucion_semanal,
  }) : null;
  const restrictions = await getCanonicalRestrictions(db, codigo);
  const contexts: Record<string, ContractInput> = {};
  for (const discipline of c.scope.managedDisciplines) {
    const prepared = await prepareSessionTrainingContext(db, codigo, c.profile,
      { targetWeekStart: request.targetWeekStart, day: 'lunes', discipline, stimulus: '' }, restrictions);
    if (!prepared.ok) return { ok: false as const, code: 'WEEKLY_CONTEXT_INVALID', errors: prepared.errors };
    contexts[discipline] = prepared.input;
  }
  const fixed: WeeklyContractInput['fixed'] = {}, fixedSessions: Record<string, any> = {};
  const protectionReasons: Record<string, ProtectionReason> = {};
  const existing = request.snapshot?.sessions || [];
  if (!Array.isArray(existing) || existing.some(s => !s || typeof s.dia !== 'string' || !calendarDays.includes(calendarKey(s.dia)))
    || new Set(existing.map(s => calendarKey(s.dia))).size !== existing.length)
    return { ok: false as const, code: 'WEEKLY_CONTEXT_INVALID', errors: ['EXISTING_DAYS_INVALID'] };
  let hasPast = false;
  const activeRegeneration = !!request.snapshot && request.today >= request.targetWeekStart
    && Date.parse(request.today) < Date.parse(request.targetWeekStart) + 7 * 86400000;
  for (const [index, day] of calendarDays.entries()) {
    const date = new Date(request.targetWeekStart + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + index);
    const civil = date.toISOString().slice(0, 10);
    const past = civil < request.today || (civil === request.today && !request.empezarHoy);
    hasPast ||= past;
    const before = existing.find(s => calendarKey(s.dia) === day);
    if (before?.completada === true && civil > request.today) {
      const diagnostic = { weekStart: request.targetWeekStart, day, derivedCivilDate: civil, currentCivilDate: request.today,
        completed: true, slotStatus: calendarState(before), code: 'FUTURE_COMPLETION_NOT_ALLOWED' };
      console.warn('WEEKLY_FUTURE_COMPLETION_REJECTED', diagnostic);
      return { ok: false as const, code: 'WEEKLY_CONTEXT_INVALID', errors: ['FUTURE_COMPLETION_NOT_ALLOWED'], diagnostic };
    }
    // Completed history and known past prescriptions survive independently of execution.
    // Future replaceable states are re-enumerated in the active week.
    if (before && (request.preservationVersion === 1 ? legacyProtectedCalendarSession : isProtectedCalendarSession)(before, activeRegeneration, past)) {
      fixedSessions[day] = before; protectionReasons[day] = calendarProtectionReason(before, past) ?? 'PAST';
    }
    else if (before && request.preserveDays?.includes(day)) { fixedSessions[day] = before; protectionReasons[day] = 'EXPLICIT_SCOPE_PRESERVE'; }
    else if (past) fixedSessions[day] = { dia: day, tipo: 'sin_registrar', titulo: 'Sin registrar',
      por_que: 'Día anterior al inicio de esta planificación', descripcion: 'No aplica — esta planificación comienza a partir de hoy.' };
    const external = Object.values(contexts).flatMap(context => context.externalLoadContext.activities).filter(a => a.days.includes(day));
    const externalDisciplines = [...new Set(external.map(a => a.discipline))];
    if (externalDisciplines.length > 1) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['EXTERNAL_DAY_AMBIGUOUS'] };
    if (externalDisciplines.length && !past) {
      if (before && before.tipo !== 'external_blocked' && (request.preservationVersion === 1 ? !activeRegeneration || fixedSessions[day] === before : fixedSessions[day] === before)) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['EXTERNAL_PROTECTED_CONFLICT'] };
      fixedSessions[day] ??= admitSessionContent({ dia: day }, codigo, request.targetWeekStart, { externalDiscipline: externalDisciplines[0] });
      protectionReasons[day] = 'EXTERNAL';
    }
    if (!fixedSessions[day] && c.profile.perfil?.prescription_access?.[civil]?.availability === 'unavailable')
      fixedSessions[day] = { dia: day, tipo: 'unavailable', titulo: 'No disponible', descripcion: 'Disponibilidad temporal declarada para esta fecha.', por_que: 'Cambio de disponibilidad.' };
    if (before && fixedSessions[day] === before && calendarState(before) === 'RECOVERY' && !before.completada) {
      const context = contexts[before.tipo];
      if (!context || typeof before.stimulusId !== 'string') return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['PROTECTED_RECOVERY_UNRESOLVED'] };
      const feasibility = evaluateTrainingFeasibility({ ...context, targetDay: day, stimulus: before.stimulusId,
        intent: Object.hasOwn(before, 'intent') ? before.intent : { kind: 'stimulus_only' } });
      if (!feasibility.feasible) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['PROTECTED_RECOVERY_INFEASIBLE'] };
    }
    if (fixedSessions[day]) {
      const s = fixedSessions[day];
      fixed[day] = { state: calendarState(s), ...(['box', 'carrera'].includes(s.tipo) ? { discipline: s.tipo } : {}),
        ...(request.preservationVersion === 1 ? {} : { protectionReason: protectionReasons[day] ?? (past ? 'PAST' : 'UNAVAILABLE') }) };
    }
  }
  // Habitual declarations remain dated facts. New session coaches do not need a
  // current-interaction exact-repeat target; signed fact changes are still checked at save.
  if (!request.openCoachVersion && runningEventPreparation?.managed && runningEventPreparation.preparationState !== 'GENERAL_DEVELOPMENT' && strategy?.goal.id === 'half_marathon' && contexts.carrera)
    contexts.carrera.runningEventPreparation = runningEventPreparation;
  let availabilityConfirmed = false;
  try {
    availabilityConfirmed = typeof request.confirmedAvailabilityDigest === 'string'
      && request.confirmedAvailabilityDigest === availabilitySnapshotDigest(c, request.targetWeekStart);
  } catch { /* Diagnostic metadata is never an admission requirement. */ }
  return { ok: true as const, input: { targetWeekStart: request.targetWeekStart, prescriptionScope: c.scope,
    ...(declaration ? { weeklyAvailability: declaration } : {}),
    ...(Array.isArray(c.profile.perfil?.coaching_knowledge) ? { athleteCoachingKnowledge: c.profile.perfil.coaching_knowledge } : {}),
    ...(request.openCoachVersion ? { openCoachVersion: request.openCoachVersion } : {}),
    maxExecutableDays: c.max, completeNewWeek: !request.snapshot && !hasPast, allowed: c.allowed, contexts, fixed,
    daySufficiency: projectWeeklyPrescriptionSignals(c.profile, request.targetWeekStart, c.scope.managedDisciplines, c.allowed, availabilityConfirmed),
    ...((activeRegeneration || request.preservationVersion !== 1 && !!request.snapshot) && !request.preserveDays ? { regeneration: { pendingManagedDays: calendarDays.filter(day => !fixed[day]
      && c.scope.managedDisciplines.some(discipline => c.allowed[discipline].includes(day))) } } : {}),
    ...(runningEventPreparation?.managed && runningEventPreparation.preparationState !== 'GENERAL_DEVELOPMENT' && strategy?.goal.id === 'half_marathon' ? { runningEventPreparation } : {}),
    ...(strategy ? { strategy, doseCapabilities: buildDoseCapabilityProfile(athlete!.runningDoseEvidenceAdmission, c.scope,
      { sessionDecisionAuthority: 'coach', ...(runningEventPreparation?.managed && runningEventPreparation.preparationState !== 'GENERAL_DEVELOPMENT' && strategy.goal.id === 'half_marathon' ? {runningEventPreparation} : {}), goalId: strategy.goal.id, blockPhase: strategy.block.phase, blockWeek: strategy.block.week, athlete, contexts }) } : {}) },
    athlete, longitudinal, fixedSessions: structuredClone(fixedSessions),
    runningHistoryContext: athlete ? scopeRunningHistory(athlete.runningHistory, c.scope) : null,
    runningEventPreparation,
    availabilityConfirmed };
}

export async function prepareAllowedWeeklyPlanContract(db: any, codigo: string, request: Parameters<typeof loadWeeklyPlanningContext>[2]) {
  const context = await loadWeeklyPlanningContext(db, codigo, request);
  if (!context.ok) return context;
  const built = buildAllowedWeeklyPlanContract(context.input, { planningRunId: request.planningRunId,
    includeFeasible: process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1',
    today: request.today, snapshot: request.snapshot,
    availabilityConfirmed: context.availabilityConfirmed,
    temporalDecision: request.diagnosticTemporalDecision === undefined ? request.empezarHoy : request.diagnosticTemporalDecision });
  if (!built.ok) return built;
  const evidencePolicy = runningPolicyGuidance(context.input.strategy?.goal.id??null,context.runningEventPreparation?.preparationState??'',context.runningEventPreparation?.daysRemaining??null);
  const coachingContext = buildWeeklyCoachingContext(context.input, built.contract, context.athlete, request.snapshot, request.today,
    await loadWeeklyCoachingSupplement(db, codigo, request.today), evidencePolicy);
  if (process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') try {
    for (const [day, options] of Object.entries(built.contract.dayOptions)) console.info('WEEKLY_COACH_OPTIONS', {
      planningRunId: request.planningRunId ?? null, weekStart: request.targetWeekStart, day,
      options: options.map(o => ({ optionId: o.optionId, state: o.state, discipline: o.discipline ?? null, intent: o.intent ?? null })) });
    // No raw DB rows, notes, identifiers of executions, provider envelope or secrets.
    console.info('WEEKLY_COACHING_INPUT', JSON.stringify({ planningRunId: request.planningRunId ?? null,
      weekStart: request.targetWeekStart, contextDigest: built.contract.contextDigest,
      goal: built.contract.strategy?.goal.id ?? null, phase: built.contract.strategy?.block.phase ?? 'unknown',
      blockWeek: built.contract.strategy?.block.week ?? null,
      eventPreparation: context.runningEventPreparation?.preparationState ?? null,
      daysToEvent: context.runningEventPreparation?.daysRemaining ?? null,
      context: { asOfDate: coachingContext.asOfDate, semantics: coachingContext.semantics,
        historyRows: coachingContext.past.prescriptionHistory.total,
        history: coachingContext.past.prescriptionHistory.items.map(row => ({ date: row.date, state: row.state,
          factualState: row.factualState, methodId: transferMethod(row.prescription.methodId)?.id ?? null,
          quantityStatus: row.execution?.quantityStatus ?? 'UNKNOWN' })),
        modificationRows: coachingContext.past.modifications.total,
        executionRows: coachingContext.past.domainExecutionEvidence.recent.total,
        executionStatus: coachingContext.past.domainExecutionEvidence.status,
        readinessStatus: coachingContext.current.readiness.status,
        timeBudgetReason: coachingContext.current.timeBudget.reason,
        externalActivities: coachingContext.current.external.activities.length,
        activeWeaknesses: coachingContext.future.weaknesses.total,
        availability: coachingContext.future.availability,
        limitations: coachingContext.past.historyLimitations },
      options: Object.fromEntries(Object.entries(built.contract.dayOptions).map(([day, options]) => [day,
        options.map(o => ({ optionId: o.optionId, state: o.state, discipline: o.discipline ?? null,
          protected: o.protected === true, adaptationId: o.intent?.kind === 'adaptation' ? o.intent.adaptationId : null,
          methodId: o.intent?.kind === 'adaptation' ? o.intent.methodId : null }))])) }));
  } catch { /* Diagnostics never change admission. */ }
  return { ...built, coachingContext, evidencePolicy, factualRequirements: context.input.doseCapabilities?.entries.flatMap(e=>e.factualRequirement?[e.factualRequirement]:[])??[], fixedSessions: context.fixedSessions, runningHistoryContext: context.runningHistoryContext, runningEventPreparation: context.runningEventPreparation };
}

/** Server resolves selections. Model prose never becomes an executable objective. */
export async function planBoundedWeek(db: any, codigo: string, request: Parameters<typeof prepareAllowedWeeklyPlanContract>[2],
  complete: (prompt: string) => Promise<PlannerCompletion>, generationToken?: string) {
  // Resolve existing goal, scope, restrictions and target preservation before any cycle write.
  if (request.coherenceVersion === 1) {
    const admission = await loadWeeklyPlanningContext(db, codigo, { ...request, coherenceVersion: undefined });
    if (!admission.ok) return admission;
  }
  const longitudinal = request.coherenceVersion === 1 ? await ensureLongitudinalTarget(db, codigo, request.targetWeekStart, request.today, complete, request.planningRunId) : undefined;
  const prepared = await prepareAllowedWeeklyPlanContract(db, codigo, request);
  if (!prepared.ok) return prepared;
  const proposal = await composeBoundedWeek(prepared.contract, complete, prepared.coachingContext, request.planningRunId);
  if (!proposal.ok) return proposal;
  try { console.info?.('ORCHESTRATOR Paso 2 — Weekly Coach', weeklyCoachStepDiagnostic(proposal.contract.contractVersion, proposal.selected, request.planningRunId)); }
  catch { /* Observation cannot change the Weekly Coach decision or admission. */ }
  if (process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') try {
    for (const day of calendarDays) {
      const option = proposal.selected[day];
      console.info('WEEKLY_COACH_SELECTION', { planningRunId: request.planningRunId ?? null, weekStart: request.targetWeekStart,
        day, optionId: option.optionId, state: option.state, intent: option.intent ?? null });
      console.info('WEEKLY_COACH_RATIONALE', { planningRunId: request.planningRunId ?? null, weekStart: request.targetWeekStart,
        day, decision: proposal.decisions[day] ?? null });
    }
    console.info('WEEKLY_COACHING_SELECTION', JSON.stringify({ planningRunId: request.planningRunId ?? null,
      weekStart: request.targetWeekStart, contextDigest: proposal.contract.contextDigest,
      selections: calendarDays.map(day => {
        const o = proposal.selected[day];
        return { day, optionId: o.optionId, state: o.state, discipline: o.discipline ?? null,
          protected: o.protected === true, adaptationId: o.intent?.kind === 'adaptation' ? o.intent.adaptationId : null,
          methodId: o.intent?.kind === 'adaptation' ? o.intent.methodId : null, decision: proposal.decisions[day] ?? null };
      }),
      warnings: proposal.warnings }));
  } catch { /* Explanations are diagnostic data, never receipt or Builder inputs. */ }
  const sessions = calendarDays.map(day => {
    const option = proposal.selected[day];
    if (option.protected) return { ...structuredClone(prepared.fixedSessions[day]),
      weeklyProtected: !!request.snapshot?.sessions.some(s => calendarKey(s.dia) === day
        && weeklyDigest(s) === weeklyDigest(prepared.fixedSessions[day])) };
    if (option.state === 'REST') return { dia: day, state: 'REST', tipo: 'descanso', titulo_breve: 'Descanso', focus: '' };
    return { dia: day, state: option.state, discipline: option.discipline, tipo: option.discipline,
      stimulusId: option.stimulusId, intent: option.intent, ...(option.coachingGuidance ? { coachingGuidance: option.coachingGuidance } : {}), titulo_breve: option.stimulusId?.replaceAll('_', ' ') ?? '', focus: option.stimulusId,
      trabaja_debilidad: option.intent?.kind === 'adaptation' && !!option.intent.weaknessId };
  });
  const contractDigest = weeklyDigest(proposal.contract);
  const diagnostic = strategyDiagnostic(proposal.contract.strategy, proposal.selected);
  try { console.info?.('WEEKLY_STRATEGY_DIAGNOSTIC', { planningRunId: request.planningRunId ?? null, weekStart: request.targetWeekStart, contractDigest, ...diagnostic }); }
  catch { /* Observability cannot change the admitted strategy. */ }
  const calendarReceipt = generationToken === undefined ? undefined : await issueWeeklyCalendar(db, codigo, request.targetWeekStart, sessions,
    { contract: proposal.contract, selections: calendarDays.map(day => proposal.contract.contractVersion >= 2
      ? openSelection(day, proposal.selected[day], proposal.decisions[day], proposal.contract.contractVersion) : { day, optionId: proposal.selected[day].optionId }), request, generationToken, decisions: proposal.decisions });
  return { ok: true as const, evidencePolicy:prepared.evidencePolicy, factualRequirements:prepared.factualRequirements, estructura: { weeklyContractVersion: proposal.contract.contractVersion, calendarProtocolVersion: 2, contractDigest, calendarReceipt, longitudinal,
    contextDigest: proposal.contract.contextDigest,
    strategy: { ...(proposal.contract.strategy ? { canonical: proposal.contract.strategy } : {}),
      adaptacion_principal: proposal.contract.strategy ? request.coherenceVersion === 1
        ? selectedWeekObjective(proposal.contract.strategy, calendarDays.map(day => ({ day, ...proposal.selected[day] })), proposal.decisions)
        : humanWeeklyObjective(proposal.contract.strategy) : 'Consulta las sesiones programadas para esta semana.' },
    sessions: sessions.map((s, i) => ('weeklyProtected' in s && s.weeklyProtected) ? s : ({ ...s, optionId: proposal.selected[calendarDays[i]].optionId,
      targetDate: new Date(new Date(request.targetWeekStart + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10) })) },
    coachingDecisions: proposal.decisions, coachingWarnings: proposal.warnings, attempts: proposal.attempts };
}
