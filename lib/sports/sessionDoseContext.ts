import type { DoseReference, SessionDoseContext } from './sessionDoseContract';
export type { DoseReference, SessionDoseContext } from './sessionDoseContract';
export { validateDoseContext } from './sessionDoseContract';
import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import type { PrescriptionIntent } from './prescriptionIntent';
import type { CanonicalWeekStrategy } from '../planning/canonicalWeekStrategy';
import { resolveStrategyGoal } from '../planning/canonicalWeekStrategy';
import { projectSessionDoseContext } from './sessionDoseProjection';

export function buildSessionDoseContext(context: Pick<AthletePrescriptionContext, 'sessionTimeBudget' | 'strength' | 'running' | 'prescriptionSignals' | 'development' | 'goals' | 'cycle' | 'hrZoneBootstrap'>, intent?: PrescriptionIntent,
  weekStrategy: CanonicalWeekStrategy | null = null, neighbours: SessionDoseContext['neighbours'] = [], enforceSufficiency = false,
  sessionDecisionAuthority?: 'coach'): SessionDoseContext {
  if (intent?.kind === 'adaptation' && resolveStrategyGoal(context) !== intent.goalId) throw new Error('SESSION_GOAL_CONTEXT_CHANGED');
  return projectSessionDoseContext(context, intent, weekStrategy, neighbours, enforceSufficiency, sessionDecisionAuthority);
}
