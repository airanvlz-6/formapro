import type { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolveGoalId, type GoalId } from '../sports/goalTransferModel';

export type GoalResolutionResult = {
  status: 'GOAL_RESOLVED' | 'GOAL_MISSING' | 'GOAL_CONFLICT' | 'GOAL_UNSUPPORTED';
  canonicalGoalId: GoalId | null;
  candidates: { source: string; value: string; recognizedId: GoalId | null }[];
};
/** Only declared primary evidence is authority. No analysis, ownership or discipline inference. */
export function resolveGoalAuthority(context: Pick<ReturnType<typeof projectAthletePrescriptionProfile>, 'goals'>): GoalResolutionResult {
  const primary = context.goals.primary;
  const candidates = primary.candidates.map(c => ({ source: c.source, value: c.value, recognizedId: resolveGoalId(c.value) }));
  const ids = candidates.map(c => c.recognizedId);
  const status = !candidates.length ? 'GOAL_MISSING' : primary.reason !== 'resolved' ? 'GOAL_CONFLICT'
    : ids.some(id => !id) ? 'GOAL_UNSUPPORTED' : new Set(ids).size > 1 ? 'GOAL_CONFLICT' : 'GOAL_RESOLVED';
  return { status, canonicalGoalId: status === 'GOAL_RESOLVED' ? ids[0] : null, candidates };
}
/** Values remain available in the authenticated DTO; arbitrary personal prose never enters logs. */
export function goalResolutionDiagnostic(result: GoalResolutionResult) {
  return { status: result.status, canonicalGoalId: result.canonicalGoalId, candidateCount: result.candidates.length,
    candidateSources: [...new Set(result.candidates.map(c => c.source))],
    recognizedIds: [...new Set(result.candidates.flatMap(c => c.recognizedId ? [c.recognizedId] : []))],
    conflict: result.status === 'GOAL_CONFLICT', unsupportedLabelsSafe: result.candidates.filter(c => !c.recognizedId).map(() => '[unrecognized]'),
    decision: 'defer_to_strategy_resolution' };
}
