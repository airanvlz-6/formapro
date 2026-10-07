import type { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolveGoalAuthority } from './goalResolution';
import { declaredSportStrategy, structuredEventStrategy, generalSportStrategy } from '../sports/declaredSportStrategy';
import { GOAL_DEFINITIONS, type GoalId } from '../sports/goalTransferModel';

type Profile = ReturnType<typeof projectAthletePrescriptionProfile>;
type Context = Pick<Profile, 'goals'> & Partial<Pick<Profile, 'athlete'>>;
export type StrategyResolutionResult = {
  status: 'STRATEGY_RESOLVED' | 'STRATEGY_UNSUPPORTED' | 'GOAL_MISSING' | 'GOAL_CONFLICT';
  strategyId: GoalId | null;
  source: 'exact_primary_goal' | 'structured_event' | 'declared_sport' | 'general_declared_sport' | null;
  strategySpecificity: 'SPECIFIC' | 'GENERAL' | null;
  sources: string[];
  goal: ReturnType<typeof resolveGoalAuthority>;
  declaredSport: { value: unknown; source: string } | null;
  /** GOAL AUTHORITY: what the athlete declared. Never replaced by the specialty/category-derived strategy. */
  goalAuthority: { origin: 'EXPLICIT_OBJECTIVE' | 'NONE'; objectiveRecognized: boolean; recognizedGoalId: GoalId | null };
  /** STRATEGY SUPPORT: how (and how specifically) the planner can program for that goal. */
  strategySupport: 'EXACT_GOAL' | 'STRUCTURED_EVENT' | 'SPECIALTY_FALLBACK' | 'GENERAL_FALLBACK' | 'NONE';
  /** Present exactly when the programming strategy is a fallback and NOT the athlete's goal. Serializable, no athlete prose. */
  fallback: StrategyFallback | null;
};
export type StrategyFallback = { kind: 'DECLARED_SPORT_FAMILY' | 'GENERAL_DECLARED_SPORT'; strategyId: GoalId; basedOn: string[];
  reason: 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED' };
/** Description and preparation family are independent, read-only, serializable projections.
 * Resolve each primary declaration before comparing strategic consequences. */
export function resolvePlanningStrategy(context: Context): StrategyResolutionResult {
  const goal = resolveGoalAuthority(context);
  const sport = context.athlete?.especialidad;
  const declaredSport = sport ? { value: sport.value, source: sport.source } : null;
  const distance = context.goals.disciplineSpecific.find(e => e.source === 'usuarios.perfil.distancia_objetivo');
  const event = structuredEventStrategy(sport?.value, distance?.value);
  const family = declaredSportStrategy(sport?.value);
  const fallback = event ?? family ?? generalSportStrategy(sport?.value);
  const ids = goal.candidates.map(c => c.recognizedId ?? fallback);
  const distinct = new Set(ids);
  const status = !ids.length ? 'GOAL_MISSING' : distinct.size > 1 ? 'GOAL_CONFLICT'
    : ids[0] ? 'STRATEGY_RESOLVED' : goal.status === 'GOAL_CONFLICT' ? 'GOAL_CONFLICT' : 'STRATEGY_UNSUPPORTED';
  const source = status !== 'STRATEGY_RESOLVED' ? null : goal.candidates.every(c => c.recognizedId)
    ? 'exact_primary_goal' : event ? 'structured_event' : family ? 'declared_sport' : 'general_declared_sport';
  const strategyId = status === 'STRATEGY_RESOLVED' ? ids[0] : null;
  // The explicit objective is ALWAYS the goal. The strategy derived from the specialty only supports programming when the
  // objective has no specialised strategy of its own; that is reported as a fallback, never as the athlete's goal.
  const objectiveRecognized = goal.candidates.length > 0 && goal.candidates.every(c => c.recognizedId);
  const strategySupport: StrategyResolutionResult['strategySupport'] = !strategyId ? 'NONE' : objectiveRecognized ? 'EXACT_GOAL'
    : source === 'structured_event' ? 'STRUCTURED_EVENT' : source === 'declared_sport' ? 'SPECIALTY_FALLBACK' : 'GENERAL_FALLBACK';
  const strategyFallback: StrategyFallback | null = strategyId && (strategySupport === 'SPECIALTY_FALLBACK' || strategySupport === 'GENERAL_FALLBACK')
    ? { kind: strategySupport === 'SPECIALTY_FALLBACK' ? 'DECLARED_SPORT_FAMILY' : 'GENERAL_DECLARED_SPORT', strategyId,
      basedOn: [sport!.source], reason: 'EXPLICIT_OBJECTIVE_NOT_SPECIALISED' } : null;
  return { status, strategyId, source, goalAuthority: { origin: goal.candidates.length ? 'EXPLICIT_OBJECTIVE' : 'NONE', objectiveRecognized,
      recognizedGoalId: goal.canonicalGoalId }, strategySupport, fallback: strategyFallback,
    strategySpecificity: strategyId ? GOAL_DEFINITIONS[strategyId].kind === 'general_training' ? 'GENERAL' : 'SPECIFIC' : null,
    sources: [...goal.candidates.map(c => c.source), ...(source === 'structured_event' ? [sport!.source, distance!.source]
      : source === 'declared_sport' || source === 'general_declared_sport' ? [sport!.source] : [])], goal, declaredSport };
}
