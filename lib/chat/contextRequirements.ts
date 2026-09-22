/** Context sufficiency is not prescription scope or permission to execute an action. */
export const CONTEXT_SCOPES = ['LOCAL_SESSION', 'WEEK_CONTEXT', 'LONGITUDINAL_PLANNING'] as const;
export type ContextScope = typeof CONTEXT_SCOPES[number];
const local = ['originalMessage', 'targetSession', 'currentWeek', 'necessaryNeighbours', 'currentState',
  'relevantRestrictions', 'readinessWhenRelevant', 'recentExecutionMinimal', 'relevantCapabilities'] as const;
const week = [...local, 'availability', 'completedAndPendingSessions', 'recentLoad', 'currentPhysiology',
  'activeGoal', 'activeBlock', 'relevantReportedEvents'] as const;
const longitudinal = [...week, 'cycle', 'relevantHistory', 'exposuresAndLoad', 'physiologyTrends', 'outcomes',
  'goalsAndEvents', 'weaknesses', 'evolution', 'relevantKnowledgeProvenance'] as const;
export type ContextRequirement = typeof longitudinal[number];
export type ContextRequirements = {
  version: 1; scope: ContextScope; requested: ContextRequirement[];
  selection: 'semantic_assessment' | 'uncertainty_escalation' | 'failure_fallback';
  evidenceElementIds: string[]; loading: 'NOT_LOADED'; authority: 'CONTEXT_ONLY';
  historyPolicy: 'MINIMAL_EXECUTION' | 'RELEVANT_WEEK' | 'RELEVANT_LONGITUDINAL';
};

/** All scope candidates are semantic model output, never keywords from the report. */
export function selectContextRequirements(scope: ContextScope, alternatives: readonly ContextScope[],
  elements: readonly { id: string; minimumContextScope: ContextScope }[], fallback = false): ContextRequirements {
  const scopes = [scope, ...alternatives, ...elements.map(e => e.minimumContextScope)];
  if (scopes.some(s => !CONTEXT_SCOPES.includes(s))) throw new Error('SEMANTIC_SCOPE_INVALID');
  const selected = fallback ? 'LONGITUDINAL_PLANNING' : CONTEXT_SCOPES[Math.max(...scopes.map(s => CONTEXT_SCOPES.indexOf(s)))];
  return { version: 1, scope: selected, requested: [...(selected === 'LOCAL_SESSION' ? local : selected === 'WEEK_CONTEXT' ? week : longitudinal)],
    selection: fallback ? 'failure_fallback' : selected !== scope ? 'uncertainty_escalation' : 'semantic_assessment',
    evidenceElementIds: elements.map(e => e.id), loading: 'NOT_LOADED', authority: 'CONTEXT_ONLY',
    historyPolicy: selected === 'LOCAL_SESSION' ? 'MINIMAL_EXECUTION' : selected === 'WEEK_CONTEXT' ? 'RELEVANT_WEEK' : 'RELEVANT_LONGITUDINAL' };
}
