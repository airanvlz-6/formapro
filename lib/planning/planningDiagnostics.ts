import type { CanonicalWeekStrategy } from './canonicalWeekStrategy';
import type { WeeklyOption } from './allowedWeeklyPlanContract';
import { STIMULUS_LIBRARY } from '../sports/movementLibrary';

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
      method: option.intent?.kind === 'adaptation' ? option.intent.methodId : null })) };
}
