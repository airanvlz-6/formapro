import type { AllowedWeeklyPlanContract, WeeklyContractInput } from './allowedWeeklyPlanContract';
import { calendarDays, calendarKey, calendarState, isExecutableCalendarState } from './weeklyCalendar';
import { TRANSFER_METHODS } from '../sports/goalTransferModel';
import { strategicIntents } from './canonicalWeekStrategy';
import { buildWeeklyFeasibilityDiagnostic, projectRejectedWeeklyIntent, type WeeklyDiagnosticContext } from './weeklyFeasibilityDiagnostic';

/** Diagnostic only. Counts option-ID combinations, not deduplicated DP states; never selects a plan.
 * Decimal strings preserve exact counts. Coverage has not been bound at this preflight boundary. */
export function countRemainingSelections(contract: AllowedWeeklyPlanContract) {
  let states = new Map<string, bigint>([['0:0:0', BigInt(1)]]);
  let candidates = BigInt(1);
  for (const day of calendarDays) {
    candidates *= BigInt(contract.dayOptions[day].length);
    const next = new Map<string, bigint>();
    for (const [key, count] of states) for (const option of contract.dayOptions[day]) {
      const [n, rest, fresh] = key.split(':').map(Number);
      const exec = Number(isExecutableCalendarState(option.state));
      if (n + exec > contract.frequencyPolicy.maxExecutableDays) continue;
      const k = `${n + exec}:${Number(!!rest || option.state === 'REST')}:${Number(!!fresh || (!option.protected && !!exec))}`;
      next.set(k, (next.get(k) ?? BigInt(0)) + count);
    }
    states = next;
  }
  let calendarValid = BigInt(0), valid = BigInt(0);
  for (const [key, count] of states) {
    const [n, rest, fresh] = key.split(':').map(Number);
    if (n < contract.frequencyPolicy.minExecutableDays || (contract.frequencyPolicy.requireGenuineRest && !rest)) continue;
    calendarValid += count;
    if (!contract.regeneration || fresh) valid += count;
  }
  return { candidateSelectionCount: candidates.toString(), calendarValidSelectionCount: calendarValid.toString(), validSelectionCount: valid.toString() };
}

export function buildRemainingDiagnostic(input: WeeklyContractInput, contract: AllowedWeeklyPlanContract,
  rejected: ReturnType<typeof projectRejectedWeeklyIntent>[], context: WeeklyDiagnosticContext = {}) {
  const safe = buildWeeklyFeasibilityDiagnostic(input, contract.dayOptions, rejected, context);
  const today = typeof context.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(context.today)
    && Number.isFinite(Date.parse(context.today)) && new Date(context.today).toISOString().slice(0, 10) === context.today ? context.today : null;
  const calendar = calendarDays.map((day, index) => {
    const date = new Date(Date.parse(input.targetWeekStart) + index * 86400000).toISOString().slice(0, 10);
    const previous = context.snapshot?.sessions.find(s => calendarKey(s.dia) === day);
    const fixed = input.fixed[day];
    const past = today === null ? null : date < today;
    const inside = today === null || safe.temporalDecision === null ? null : date > today || (date === today && safe.temporalDecision);
    return { day, date, past, today: today === null ? null : date === today, future: today === null ? null : date > today,
      availabilityConfirmed: context.availabilityConfirmed === true,
      allowedDisciplines: safe.calendar[index].disciplinesAllowed,
      previousState: previous ? calendarState(previous) : null, completed: previous?.completada === true,
      protected: !!fixed,
      protectionReasonSafe: !fixed ? 'NONE' : previous?.completada === true ? 'COMPLETED'
        : inside === false ? 'OUTSIDE_EFFECTIVE_INTERVAL' : !input.regeneration && previous ? 'PRESERVED_OUTSIDE_ACTIVE_REGENERATION'
        : fixed.state === 'UNAVAILABLE' && Object.values(input.contexts).some(c => c.externalLoadContext.activities.some(a => a.days.includes(day)))
          ? 'CURRENT_EXTERNAL_ACTIVITY' : fixed.state === 'UNAVAILABLE' ? 'FIXED_UNAVAILABLE' : 'FIXED_STATE',
      replaceable: !!previous && !fixed,
      canTrain: safe.calendar[index].canTrain,
      canRecovery: contract.dayOptions[day].some(o => o.state === 'RECOVERY'), canRest: safe.calendar[index].canRest,
      insideEffectiveTemporalInterval: inside };
  });
  const adaptations = (safe.strategyProjection?.adaptations ?? []).map(a => {
    const initial = TRANSFER_METHODS.filter(m => m.adaptationId === a.id);
    const managed = initial.filter(m => input.prescriptionScope.managedDisciplines.includes(m.discipline));
    const phase = managed.filter(m => input.strategy?.methods.includes(m.id));
    const temporal = phase.filter(m => calendarDays.some(day => !input.fixed[day] && input.allowed[m.discipline]?.includes(day)
      && input.strategy && strategicIntents(input.strategy, m.discipline, m.stimulusId).some(i => i.kind === 'adaptation' && i.methodId === m.id)));
    const feasible = temporal.filter(m => Object.values(contract.dayOptions).flat().some(o => o.intent?.kind === 'adaptation' && o.intent.methodId === m.id));
    return { adaptationId: a.id, candidateMethodsInitial: initial.map(m => m.id),
      candidateMethodsAfterManagedDiscipline: managed.map(m => m.id), candidateMethodsAfterPhase: phase.map(m => m.id),
      candidateMethodsAfterTemporalCalendar: temporal.map(m => m.id), candidateMethodsAfterFeasibility: feasible.map(m => m.id) };
  });
  const executable = Object.values(contract.dayOptions).flat().filter(o => isExecutableCalendarState(o.state));
  const counts = countRemainingSelections(contract);
  return { ...safe, today, calendar, adaptations,
    phaseStageMeaning: 'CANONICAL_STRATEGY_METHODS_INCLUDING_ADAPTATION_AND_ROLE_FILTERS',
    minExecutableDays: contract.frequencyPolicy.minExecutableDays, maxExecutableDays: contract.frequencyPolicy.maxExecutableDays,
    preservedExecutableDays: executable.filter(o => o.protected).length,
    newExecutableDays: null, availableNewExecutableDays: calendarDays.filter(d => contract.dayOptions[d].some(o => !o.protected && isExecutableCalendarState(o.state))).length,
    futureManagedAvailableDays: calendarDays.filter(day => contract.regeneration?.pendingManagedDays.includes(day)),
    ...counts, selectedStatesByDay: null, builderTargetCount: null,
    reason: counts.validSelectionCount === '0' ? 'NO_FEASIBLE_REMAINING_SELECTION' : null,
    selectionStatus: 'NOT_SELECTED_EXISTENCE_CHECK_ONLY' };
}

export function emitRemainingDiagnostic(...args: Parameters<typeof buildRemainingDiagnostic>) {
  try { console.info('WEEKLY_REMAINING_SELECTION_DIAGNOSTIC', buildRemainingDiagnostic(...args)); }
  catch { /* No diagnostic failure may alter planning admission. */ }
}
