import type { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolveGoalAuthority } from './goalResolution';
import { declaredSportStrategy, structuredEventStrategy } from '../sports/declaredSportStrategy';
import type { GoalId } from '../sports/goalTransferModel';

type Profile = ReturnType<typeof projectAthletePrescriptionProfile>;
type Context = Pick<Profile, 'goals'> & Partial<Pick<Profile, 'athlete'>>;
export type StrategyResolutionResult = {
  status: 'STRATEGY_RESOLVED' | 'STRATEGY_UNSUPPORTED' | 'GOAL_MISSING' | 'GOAL_CONFLICT';
  strategyId: GoalId | null;
  source: 'exact_primary_goal' | 'structured_event' | 'declared_sport' | null;
  sources: string[];
  goal: ReturnType<typeof resolveGoalAuthority>;
  declaredSport: { value: unknown; source: string } | null;
};
/** Description and preparation family are independent, read-only, serializable projections.
 * Resolve each primary declaration before comparing strategic consequences. */
export function resolvePlanningStrategy(context: Context): StrategyResolutionResult {
  const goal = resolveGoalAuthority(context);
  const sport = context.athlete?.especialidad;
  const declaredSport = sport ? { value: sport.value, source: sport.source } : null;
  const distance = context.goals.disciplineSpecific.find(e => e.source === 'usuarios.perfil.distancia_objetivo');
  const event = structuredEventStrategy(sport?.value, distance?.value);
  const family = declaredSportStrategy(sport?.value);
  const fallback = event ?? family;
  const ids = goal.candidates.map(c => c.recognizedId ?? fallback);
  const distinct = new Set(ids);
  const status = !ids.length ? 'GOAL_MISSING' : distinct.size > 1 ? 'GOAL_CONFLICT'
    : ids[0] ? 'STRATEGY_RESOLVED' : goal.status === 'GOAL_CONFLICT' ? 'GOAL_CONFLICT' : 'STRATEGY_UNSUPPORTED';
  const source = status !== 'STRATEGY_RESOLVED' ? null : goal.candidates.every(c => c.recognizedId)
    ? 'exact_primary_goal' : event ? 'structured_event' : 'declared_sport';
  return { status, strategyId: status === 'STRATEGY_RESOLVED' ? ids[0] : null, source,
    sources: [...goal.candidates.map(c => c.source), ...(source === 'structured_event' ? [sport!.source, distance!.source]
      : source === 'declared_sport' ? [sport!.source] : [])], goal, declaredSport };
}
