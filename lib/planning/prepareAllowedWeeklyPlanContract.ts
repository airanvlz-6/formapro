import { evaluateTrainingFeasibility } from '../sports/trainingFeasibility';
import type { PlannerCompletion } from './weeklyPlannerDiagnostics';
import { loadWeeklyCalendarContext, issueWeeklyCalendar, weeklyDigest } from './weeklyCalendarAuthority';
import { calendarDays, calendarKey, calendarState, isProtectedCalendarSession } from './weeklyCalendar';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { prepareSessionTrainingContext } from '../sports/prepareSessionTrainingContract';
import type { ContractInput } from '../sports/allowedTrainingContract';
import { buildAllowedWeeklyPlanContract, composeBoundedWeek, type WeeklyContractInput } from './allowedWeeklyPlanContract';
import { admitSessionContent } from '../sports/sessionAuthority';
import { loadAthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { buildCanonicalWeekStrategy, renderWeekObjective } from './canonicalWeekStrategy';
import { strategyDiagnostic } from './planningDiagnostics';
import { resolveGoalAuthority, goalResolutionDiagnostic } from '../athlete/goalResolution';
import { requireGoalAuthority } from '../athlete/goalAnswers';
import { resolvePlanningStrategy } from '../athlete/strategyResolution';

/** Read-only preparation, before any Planner call. Bounded reads per discipline, never per option. */
export async function loadWeeklyPlanningContext(db: any, codigo: string, request: {
  targetWeekStart: string; today: string; empezarHoy: boolean; snapshot: { sessions: readonly any[] } | null;
  strategyVersion?: 1; strategyProposal?: unknown; planningRunId?: string; diagnosticTemporalDecision?: boolean | null;
}) {
  const c = await loadWeeklyCalendarContext(db, codigo);
  if (request.strategyVersion !== undefined && request.strategyVersion !== 1) throw new Error('STRATEGY_VERSION_UNSUPPORTED');
  const athlete = request.strategyVersion === 1 ? await loadAthletePrescriptionContext(db, codigo, { asOfDate: request.today }) : undefined;
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
  const strategy = athlete ? buildCanonicalWeekStrategy(athlete, c.scope, c.max, request.strategyProposal) : undefined;
  const restrictions = await getCanonicalRestrictions(db, codigo);
  const contexts: Record<string, ContractInput> = {};
  for (const discipline of c.scope.managedDisciplines) {
    const prepared = await prepareSessionTrainingContext(db, codigo, c.profile,
      { targetWeekStart: request.targetWeekStart, day: 'lunes', discipline, stimulus: '' }, restrictions);
    if (!prepared.ok) return { ok: false as const, code: 'WEEKLY_CONTEXT_INVALID', errors: prepared.errors };
    contexts[discipline] = prepared.input;
  }
  const fixed: WeeklyContractInput['fixed'] = {}, fixedSessions: Record<string, any> = {};
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
    // Completed history survives; replaceable old states are re-enumerated in the active week.
    if (before && isProtectedCalendarSession(before, activeRegeneration, past)) fixedSessions[day] = before;
    else if (past) fixedSessions[day] = { dia: day, tipo: 'sin_registrar', titulo: 'Sin registrar',
      por_que: 'Día anterior al inicio de esta planificación', descripcion: 'No aplica — esta planificación comienza a partir de hoy.' };
    const external = Object.values(contexts).flatMap(context => context.externalLoadContext.activities).filter(a => a.days.includes(day));
    const externalDisciplines = [...new Set(external.map(a => a.discipline))];
    if (externalDisciplines.length > 1) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['EXTERNAL_DAY_AMBIGUOUS'] };
    if (externalDisciplines.length && !past) {
      if (before && before.tipo !== 'external_blocked' && (!activeRegeneration || fixedSessions[day] === before)) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['EXTERNAL_PROTECTED_CONFLICT'] };
      fixedSessions[day] ??= admitSessionContent({ dia: day }, codigo, request.targetWeekStart, { externalDiscipline: externalDisciplines[0] });
    }
    if (before && fixedSessions[day] === before && calendarState(before) === 'RECOVERY' && !before.completada) {
      const context = contexts[before.tipo];
      if (!context || typeof before.stimulusId !== 'string') return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['PROTECTED_RECOVERY_UNRESOLVED'] };
      const feasibility = evaluateTrainingFeasibility({ ...context, targetDay: day, stimulus: before.stimulusId,
        intent: Object.hasOwn(before, 'intent') ? before.intent : { kind: 'stimulus_only' } });
      if (!feasibility.feasible) return { ok: false as const, code: 'WEEKLY_CONTRACT_UNSATISFIABLE', errors: ['PROTECTED_RECOVERY_INFEASIBLE'] };
    }
    if (fixedSessions[day]) {
      const s = fixedSessions[day];
      fixed[day] = { state: calendarState(s), ...(['box', 'carrera'].includes(s.tipo) ? { discipline: s.tipo } : {}) };
    }
  }
  return { ok: true as const, input: { targetWeekStart: request.targetWeekStart, prescriptionScope: c.scope,
    maxExecutableDays: c.max, completeNewWeek: !request.snapshot && !hasPast, allowed: c.allowed, contexts, fixed,
    ...(activeRegeneration ? { regeneration: { pendingManagedDays: calendarDays.filter(day => !fixed[day]
      && c.scope.managedDisciplines.some(discipline => c.allowed[discipline].includes(day))) } } : {}),
    ...(strategy ? { strategy } : {}) },
    fixedSessions: structuredClone(fixedSessions) };
}

export async function prepareAllowedWeeklyPlanContract(db: any, codigo: string, request: Parameters<typeof loadWeeklyPlanningContext>[2]) {
  const context = await loadWeeklyPlanningContext(db, codigo, request);
  if (!context.ok) return context;
  const built = buildAllowedWeeklyPlanContract(context.input, { planningRunId: request.planningRunId,
    temporalDecision: request.diagnosticTemporalDecision === undefined ? request.empezarHoy : request.diagnosticTemporalDecision });
  return built.ok ? { ...built, fixedSessions: context.fixedSessions } : built;
}

/** Server resolves selections. Model prose never becomes an executable objective. */
export async function planBoundedWeek(db: any, codigo: string, request: Parameters<typeof prepareAllowedWeeklyPlanContract>[2],
  complete: (prompt: string) => Promise<PlannerCompletion>, generationToken?: string) {
  const prepared = await prepareAllowedWeeklyPlanContract(db, codigo, request);
  if (!prepared.ok) return prepared;
  const proposal = await composeBoundedWeek(prepared.contract, complete);
  if (!proposal.ok) return proposal;
  const sessions = calendarDays.map(day => {
    const option = proposal.selected[day];
    if (option.protected) return { ...structuredClone(prepared.fixedSessions[day]),
      weeklyProtected: !!request.snapshot?.sessions.some(s => calendarKey(s.dia) === day
        && weeklyDigest(s) === weeklyDigest(prepared.fixedSessions[day])) };
    if (option.state === 'REST') return { dia: day, state: 'REST', tipo: 'descanso', titulo_breve: 'Descanso', focus: '' };
    return { dia: day, state: option.state, discipline: option.discipline, tipo: option.discipline,
      stimulusId: option.stimulusId, intent: option.intent, titulo_breve: option.stimulusId!.replaceAll('_', ' '), focus: option.stimulusId,
      trabaja_debilidad: option.intent?.kind === 'adaptation' && !!option.intent.weaknessId };
  });
  const contractDigest = weeklyDigest(proposal.contract);
  const diagnostic = strategyDiagnostic(proposal.contract.strategy, proposal.selected);
  try { console.info?.('WEEKLY_STRATEGY_DIAGNOSTIC', { planningRunId: request.planningRunId ?? null, weekStart: request.targetWeekStart, contractDigest, ...diagnostic }); }
  catch { /* Observability cannot change the admitted strategy. */ }
  const calendarReceipt = generationToken === undefined ? undefined : await issueWeeklyCalendar(db, codigo, request.targetWeekStart, sessions,
    { contract: proposal.contract, selections: calendarDays.map(day => ({ day, optionId: proposal.selected[day].optionId })), request, generationToken });
  return { ok: true as const, estructura: { weeklyContractVersion: 1, calendarProtocolVersion: 2, contractDigest, calendarReceipt,
    contextDigest: proposal.contract.contextDigest,
    strategy: { ...(proposal.contract.strategy ? { canonical: proposal.contract.strategy } : {}),
      adaptacion_principal: proposal.contract.strategy ? renderWeekObjective(proposal.contract.strategy) : 'Estímulos genéricos seleccionados dentro del contrato autorizado.' },
    sessions: sessions.map((s, i) => ('weeklyProtected' in s && s.weeklyProtected) ? s : ({ ...s, optionId: proposal.selected[calendarDays[i]].optionId,
      targetDate: new Date(new Date(request.targetWeekStart + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10) })) }, attempts: proposal.attempts };
}
