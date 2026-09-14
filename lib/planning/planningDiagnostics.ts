import type { CanonicalWeekStrategy } from './canonicalWeekStrategy';
import type { WeeklyOption } from './allowedWeeklyPlanContract';
import { STIMULUS_LIBRARY, MOVEMENT_LIBRARY } from '../sports/movementLibrary';
import { calendarDays } from './weeklyCalendar';

/** Observation of admitted selections. No labels, rationale, athlete data or quotas. */
export function weeklyCoachStepDiagnostic(contractVersion: number, selected: Record<string, WeeklyOption>, planningRunId?: string) {
  const patterns = new Set(Object.values(MOVEMENT_LIBRARY).map(m => m.movement_pattern));
  const days = (state: string) => calendarDays.filter(day => selected[day]?.state === state);
  return { planningRunId: typeof planningRunId === 'string' && /^[a-f0-9-]{36}$/.test(planningRunId) ? planningRunId : null,
    contractVersion, trainDays: days('TRAIN').length, restDays: days('REST').length, recoveryDays: days('RECOVERY').length,
    trainDayNames: days('TRAIN'), restDayNames: days('REST'),
    intents: calendarDays.map(day => {
      const o = selected[day], i = o?.intent;
      return { day, state: ['TRAIN','REST','RECOVERY','UNAVAILABLE','EXTERNAL'].includes(o?.state) ? o.state : 'unknown', protected: !!o?.protected,
        kind: i && ['open_coach','adaptation','main_pattern','stimulus_only'].includes(i.kind) ? i.kind : null,
        pattern: i && 'pattern' in i && patterns.has(i.pattern) ? i.pattern : null,
        adaptation: i && 'adaptationId' in i && Object.hasOwn(STIMULUS_LIBRARY, i.adaptationId) ? i.adaptationId : null,
        role: i && 'role' in i && ['PRIMARY','SUPPORTING','MAINTENANCE'].includes(i.role) ? i.role : null };
    }) };
}

/** Inputs are admitted canonical strategy/options, not analyzer prose or athlete context. */
export function strategyDiagnostic(strategy: CanonicalWeekStrategy | undefined, selected: Record<string, WeeklyOption>) {
  const adaptations = (role: string) => strategy?.adaptations.filter(a => a.role === role).map(a => a.id) || [];
  return { canonicalPhase: strategy?.block.phase || 'unknown', canonicalGoalId: strategy?.goal.id || null,
    primaryAdaptations: adaptations('PRIMARY'), supportingAdaptations: adaptations('SUPPORTING'), maintenanceAdaptations: adaptations('MAINTENANCE'),
    deferredAdaptations: strategy?.deferred.map(d => ({ adaptation: Object.hasOwn(STIMULUS_LIBRARY, d.reference) ? d.reference :
      d.reference.startsWith('adaptation:') && Object.hasOwn(STIMULUS_LIBRARY, d.reference.slice(11)) ? d.reference.slice(11) : 'unknown', reason: d.reason })) || [],
    dailyIntents: Object.entries(selected).map(([day, option]) => ({ day, protected: !!option.protected, state: option.state,
      role: option.intent?.kind === 'adaptation' ? option.intent.role : null,
      adaptation: option.intent?.kind === 'adaptation' ? option.intent.adaptationId : null,
      method: option.intent?.kind === 'adaptation' ? option.intent.methodId : null,
      ...(option.intent?.kind === 'adaptation' && option.intent.transfer ? { transfer: option.intent.transfer } : {}) })) };
}
