/** Diagnostic-only boundaries. Never serialize inputs, results, messages or stacks. */
const stages = [
  'loadChatGrounding', 'resolveDate', 'profile.read', 'plans.read', 'sources.read', 'validateReadResults',
  'resolveScope', 'buildFacts', 'buildSessionDoseContext', 'projectCoachingKnowledge', 'projectPlans',
  'projectHistory', 'projectChatLongitudinal', 'projectConversation', 'loadEventContext', 'loadWeeklyCoachingSupplement',
  'loadAthletePrescriptionContext', 'athlete.usuarios', 'athlete.weekly_plan', 'athlete.session_modification_events',
  'getCanonicalRestrictions', 'prepareRecoveryContext', 'readRunningExecutionViews', 'projectCompletedSessions',
  'projectExposureInput', 'projectDatedHistory', 'projectAthletePrescriptionProfile', 'projectRunningDoseBaseline',
  'readRunningHabitualConfirmation', 'mergeRunningHistory', 'readMethodBaselines', 'buildAthleteContext',
  'resolvePlanningStrategy', 'admitRunningDoseEvidence', 'prescriptionHistorySummary', 'buildExposureReport',
] as const;
type Stage = typeof stages[number];
const codes = new Set([
  'CHAT_DATE_INVALID', 'CHAT_CONTEXT_READ_FAILED', 'CHAT_SCOPE_UNRESOLVED',
  'PRESCRIPTION_CONTEXT_INVALID_INPUT', 'PRESCRIPTION_CONTEXT_READ_FAILED:usuarios',
  'PRESCRIPTION_CONTEXT_READ_FAILED:weekly_plan', 'PRESCRIPTION_CONTEXT_READ_FAILED:session_modification_events',
  'RESTRICTIONS_INVALID_DATE', 'RESTRICTIONS_INVALID_USER', 'RESTRICTIONS_AMBIGUOUS_STATE',
  'RESTRICTIONS_INVALID_STATE', 'RESTRICTIONS_INVALID_VALID_UNTIL', 'RESTRICTIONS_NOTES_READ_FAILED',
  'RESTRICTIONS_STATE_READ_FAILED', 'RESTRICTIONS_READ_FAILED', 'EVENT_CONTEXT_READ_FAILED', 'EVENT_SCOPE_UNRESOLVED',
  'EXECUTION_READ_FAILED', 'EXECUTION_READ_CAP_EXCEEDED', 'EXECUTION_STORED_INTEGRITY_INVALID',
  'EXECUTION_VERIFICATION_UNAVAILABLE', 'HISTORICAL_RUNNING_INPUT_INVALID', 'HISTORICAL_RUNNING_ATHLETE_MISMATCH',
  'SESSION_TIME_BUDGET_CONFLICT', 'SESSION_GOAL_CONTEXT_CHANGED', 'SESSION_WEAKNESS_CONTEXT_CHANGED',
  '42703', '42P01', '42501', '57014', 'PGRST116', 'PGRST204', 'PGRST205',
]);
const recoveryReasons = new Set(['snapshot_query_failed', 'history_query_failed', 'subjective_context_read_failed',
  'subjective_context_invalid_response', 'invalid_envelope', 'snapshot_identity_mismatch', 'invalid_history_rows',
  'history_identity_or_range_mismatch', 'history_not_strictly_descending', 'invalid_options', 'invalid_date',
  'invalid_date_range', 'invalid_limit', 'recovery_context_identity_mismatch']);
function safeError(error: unknown) {
  let errorClass = 'UnknownError', errorCode = 'UNCLASSIFIED';
  try {
    const e = error as { name?: unknown; code?: unknown; message?: unknown; failure?: { error?: unknown; reason?: unknown } };
    const names = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'TimeoutError', 'DataCloneError'];
    if (typeof e?.name === 'string' && names.includes(e.name)) errorClass = e.name;
    for (const candidate of [e?.code, e?.message]) if (typeof candidate === 'string' && codes.has(candidate)) { errorCode = candidate; break; }
    const f = e?.failure;
    if (f && ['db_error', 'invalid_response', 'invalid_input'].includes(String(f.error))
      && typeof f.reason === 'string' && recoveryReasons.has(f.reason)) {
      errorClass = 'RecoveryReadError'; errorCode = 'CANONICAL_RECOVERY_' + f.error + ':' + f.reason;
    }
  } catch { /* Hostile error properties cannot affect the original exception. */ }
  return { errorClass, errorCode };
}
export interface GroundingTrace {
  sync<T>(stage: Stage, work: () => T): T;
  async<T>(stage: Stage, work: () => PromiseLike<T> | T, envelope?: boolean): Promise<T>;
}
export const silentGroundingTrace: GroundingTrace = {
  sync: (_stage, work) => work(), async: async (_stage, work) => await work(),
};
export function createGroundingTrace(runId: string, pass: 'initial' | 'reload'): GroundingTrace {
  if (process.env.FORGE_CHAT_COACH_DIAGNOSTICS !== '1') return silentGroundingTrace;
  const safeRunId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) ? runId : null;
  let sequence = 0;
  const begin = (stage: Stage) => {
    const operationId = ++sequence, started = Date.now();
    const emit = (phase: 'start' | 'success' | 'failure', error?: unknown) => {
      try {
        console.info('CHAT_GROUNDING_OPERATION', JSON.stringify({ runId: safeRunId,
          pass: pass === 'reload' ? 'reload' : 'initial', operationId,
          operation: stages.includes(stage) ? stage : 'unknown', phase,
          durationMs: Math.max(0, Date.now() - started), ...(phase === 'failure' ? safeError(error) : {}) }));
      } catch { /* Diagnostics must not change results or exceptions. */ }
    };
    emit('start'); return emit;
  };
  return {
    sync(stage, work) {
      const emit = begin(stage);
      try { const value = work(); emit('success'); return value; }
      catch (error) { emit('failure', error); throw error; }
    },
    async: async (stage, work, envelope = false) => {
      const emit = begin(stage);
      try {
        const value = await work();
        // A resolved PostgREST error remains a result, not a new exception.
        let error: unknown;
        try { if (envelope) error = (value as { error?: unknown })?.error; } catch { /* Observation only. */ }
        emit(error ? 'failure' : 'success', error); return value;
      } catch (error) { emit('failure', error); throw error; }
    },
  };
}
