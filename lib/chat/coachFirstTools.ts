import { coachFirstReads, loadCoachActionContext, COACH_READ_RANGE_REASONS, type CoachReadStage } from './coachFirstReads';
import { applyChatCoachActions } from './chatCoachActions';
import { recordExternalExecution } from '../planning/recordCompletion';
import { updateStructuredChatAvailability } from '../sports/chatAvailability';
import { recordReportedEvent } from './coachFirstStore';
import type { CoachFirstCall, CoachFirstInput } from './coachFirstLoop';
import { GENERATION_ARGUMENT_REASONS, type GenerationArgumentReason } from './coachFirstGeneration';

export type CoachFirstPolicy = 'normal' | 'read_only';
/** Inspect the existing Planner envelope only; diagnostics never change its public result. */
function plannerRejectionDiagnostic(planner: any) {
  let failureReason = 'UNKNOWN_PLANNER_REJECTION';
  try {
    if (planner?.ok) {
      if (planner.estructura?.weeklyContractVersion !== 2) failureReason = 'WEEKLY_CONTRACT_VERSION_INVALID';
    } else if (planner?.code === 'STRATEGY_PROPOSAL_INVALID') {
      failureReason = 'STRATEGY_PROPOSAL_INVALID';
    } else if (['LONGITUDINAL_TARGET_UNRESOLVED', 'LONGITUDINAL_READ_FAILED',
      'LONGITUDINAL_TARGET_INVALID', 'LONGITUDINAL_ANCHOR_READ_FAILED',
      'LONGITUDINAL_LEGACY_POSITION_AMBIGUOUS', 'LONGITUDINAL_DECISION_INVALID'].includes(planner?.code)) {
      failureReason = 'LONGITUDINAL_TARGET_FAILED';
    } else if (planner?.code === 'WEEKLY_CONTEXT_INVALID') {
      failureReason = ['EXISTING_DAYS_INVALID', 'FUTURE_COMPLETION_NOT_ALLOWED']
        .find(reason => Array.isArray(planner.errors) && planner.errors.includes(reason)) ?? 'WEEKLY_CONTEXT_INVALID';
    } else if (planner?.code === 'WEEKLY_CONTRACT_UNSATISFIABLE') {
      failureReason = ['EXTERNAL_DAY_AMBIGUOUS', 'EXTERNAL_PROTECTED_CONFLICT',
        'PROTECTED_RECOVERY_UNRESOLVED', 'PROTECTED_RECOVERY_INFEASIBLE']
        .find(reason => Array.isArray(planner.errors) && planner.errors.includes(reason)) ?? 'WEEKLY_CONTRACT_UNSATISFIABLE';
    }
  } catch { failureReason = 'UNKNOWN_PLANNER_REJECTION'; }
  return { failureCode: 'PLANNER_NOT_ADMITTED', failureReason };
}
/** Operational diagnostics only. Never copy arguments, requirements or exception text. */
function generationRejectionDiagnostic(result: any, argumentReason?: GenerationArgumentReason) {
  const fallback = { failureCode: 'UNCLASSIFIED_PREFLIGHT_REJECTION', failureStage: 'preflight' };
  try {
    if (['GENERATION_READ_ARGUMENT_INVALID', 'GENERATION_AVAILABILITY_READ_REQUIRED',
      'GENERATION_READ_DIGEST_MISMATCH', 'GENERATION_PLANNING_READ_REQUIRED'].includes(result.code))
      return { failureCode: result.code, failureStage: 'validation' };
    if (result.code === 'GENERATION_ARGUMENT_INVALID')
      return { failureCode: 'GENERATION_ARGUMENT_INVALID', failureStage: 'validation',
        ...(GENERATION_ARGUMENT_REASONS.some(reason => reason === argumentReason) ? { failureReason: argumentReason } : {}) };
    if (result.code === 'GENERATION_WEEK_INVALID')
      return { failureCode: 'GENERATION_WEEK_INVALID', failureStage: 'target_validation' };
    const codes = [
      'CALENDAR_CONTEXT_READ_FAILED', 'CALENDAR_SCOPE_INVALID', 'CALENDAR_AVAILABILITY_REQUIRED',
      'CALENDAR_AVAILABILITY_INVALID', 'CALENDAR_AVAILABILITY_UNRESOLVED', 'UNRESOLVED_AVAILABILITY',
      'AVAILABILITY_EXISTING_REQUIRED', 'AVAILABILITY_CONFIRMATION_STALE', 'TEMPORAL_DECISION_REQUIRED',
      'GOAL_MISSING', 'GOAL_CONFLICT', 'STRATEGY_UNSUPPORTED', 'WEEKLY_CONTEXT_INVALID',
      'WEEKLY_CONTRACT_UNSATISFIABLE', 'WEEKLY_REGENERATION_NO_OP', 'PREFLIGHT_READ_FAILED',
      'RESTRICTIONS_AMBIGUOUS_STATE', 'RESTRICTIONS_INVALID_STATE', 'RESTRICTIONS_INVALID_VALID_UNTIL',
      'RESTRICTIONS_STATE_READ_FAILED', 'RESTRICTIONS_NOTES_READ_FAILED', 'RESTRICTIONS_READ_FAILED',
      'PRESCRIPTION_CONTEXT_READ_FAILED:usuarios', 'PRESCRIPTION_CONTEXT_READ_FAILED:weekly_plan',
      'PRESCRIPTION_CONTEXT_READ_FAILED:session_modification_events',
    ];
    const requirement = result.requirements;
    const code = requirement?.code;
    if (!codes.includes(code)) return fallback;
    const reasons: Record<string, readonly string[]> = {
      WEEKLY_REGENERATION_NO_OP: ['NO_REMAINING_MANAGED_DAYS'],
      WEEKLY_CONTEXT_INVALID: ['EXISTING_DAYS_INVALID', 'FUTURE_COMPLETION_NOT_ALLOWED', 'OPEN_WEEKLY_FACTS_INVALID',
        'SCOPE_SOURCES_READ_FAILED', 'PRESCRIPTION_NOT_ALLOWED', 'DISCIPLINE_OUTSIDE_MANAGED_SCOPE',
        'FOCUS_AVAILABILITY_UNRESOLVED', 'EXTERNAL_LOAD_READ_FAILED', 'EXPOSURE_READ_FAILED', 'CONTRACT_CONTEXT_READ_FAILED'],
      WEEKLY_CONTRACT_UNSATISFIABLE: ['EXTERNAL_DAY_AMBIGUOUS', 'EXTERNAL_PROTECTED_CONFLICT',
        'PROTECTED_RECOVERY_UNRESOLVED', 'PROTECTED_RECOVERY_INFEASIBLE'],
    };
    const reason = (reasons[code] ?? []).find(value => requirement.reason === value
      || Array.isArray(requirement.errors) && requirement.errors.includes(value));
    return { failureCode: code, failureStage: 'preflight', ...(reason ? { failureReason: reason } : {}) };
  } catch { return fallback; }
}
/** Exact allowlist only: never emit exception text, suffixes, stack or database details. */
function readFailureDiagnostic(error: unknown, stage: CoachReadStage) {
  const fallback = { failureCode: 'UNEXPECTED_READ_ERROR', failureStage: stage };
  try {
    const message = error && typeof error === 'object' ? (error as { message?: unknown }).message : undefined;
    for (const table of ['usuarios', 'weekly_plan', 'session_modification_events']) {
      if (message === `PRESCRIPTION_CONTEXT_READ_FAILED:${table}`)
        return { failureCode: 'PRESCRIPTION_CONTEXT_READ_FAILED', failureStage: table };
    }
    const codes: Record<string, string> = {
      READ_INVALID: 'validation', READ_RANGE_INVALID: 'validation', READ_LIMIT_INVALID: 'validation',
      READ_RESOURCE_INVALID: 'validation', READ_UNAVAILABLE: 'canonical_read', READ_SIZE_LIMIT: 'read_result',
      COACH_FIRST_PROFILE_UNAVAILABLE: 'profile', REPORTED_EVENTS_INVALID: 'reported_events',
      PRESCRIPTION_CONTEXT_INVALID_INPUT: 'planning_loader', SESSION_ENVIRONMENT_DATE_MISMATCH: 'planning_loader',
      PRESCRIPTION_READINESS_IDENTITY_MISMATCH: 'planning_loader',
      LONGITUDINAL_READ_FAILED: 'planning_loader',
    };
    if (typeof message === 'string' && Object.hasOwn(codes, message)) {
      const reason = message === 'READ_RANGE_INVALID' ? (error as { failureReason?: unknown }).failureReason : undefined;
      return { failureCode: message, failureStage: codes[message],
        ...(typeof reason === 'string' && COACH_READ_RANGE_REASONS.some(value => value === reason) ? { failureReason: reason } : {}) };
    }
  } catch { /* Even an unreadable exception must not change the tool result. */ }
  return fallback;
}

/** Server configuration only. A malformed policy must never restore write access. */
export function resolveCoachFirstPolicy(value: string | undefined): CoachFirstPolicy {
  if (value === undefined) return 'normal';
  if (value === 'normal' || value === 'read_only') return value;
  throw new Error('COACH_FIRST_POLICY_INVALID');
}

export function coachFirstTools(db: any, user: string, input: CoachFirstInput, turnId: string,
  generate: (args: any, operationId: string, onArgumentRejection?: (reason: GenerationArgumentReason) => void) => Promise<any>, observe: (event: Record<string, unknown>) => void,
  policy: CoachFirstPolicy = 'normal') {
  const mode = resolveCoachFirstPolicy(policy);
  const today = new Date(input.timestamp).toLocaleDateString('en-CA', { timeZone: input.timezone });
  const reads = coachFirstReads(db, user, today);
  const availabilityReads = new Map<string, { week: string; snapshotDigest: string }>();
  const planningWeeks = new Set<string>();
  const invalidateReads = () => { reads.invalidate(); availabilityReads.clear(); planningWeeks.clear(); };
  const attempted = new Set<string>();
  return async (call: CoachFirstCall, ordinal: number) => {
    const a: any = call.arguments, operationId = `${turnId}:${ordinal}`;
    let result: any, authority = '';
    let argumentReason: GenerationArgumentReason | undefined;
    let readStage: CoachReadStage = 'canonical_read';
    let failure: ReturnType<typeof readFailureDiagnostic> | undefined;
    try {
      if (mode === 'read_only' && call.name !== 'read_context') {
        result = { status: 'rejected', reason: 'read_only_policy', code: 'COACH_FIRST_READ_ONLY', operationId };
        return result;
      }
      if (call.name !== 'read_context') {
        const key = JSON.stringify(call);
        if (attempted.has(key)) return { status: 'rejected', code: 'TURN_ACTION_ALREADY_ATTEMPTED' };
        attempted.add(key);
      }
      switch (call.name) {
        case 'read_context': {
          authority = 'canonical_read_projection'; result = await reads.read(a, stage => { readStage = stage; });
          if (result.status === 'read' && a.resource === 'availability' && result.data?.ok === true
            && typeof result.data.snapshotDigest === 'string') {
            availabilityReads.set(operationId, { week: result.coverage.week, snapshotDigest: result.data.snapshotDigest });
            result = { ...result, availabilityReadId: operationId };
          }
          if (result.status === 'read' && a.resource === 'planning') planningWeeks.add(result.coverage.week);
          break;
        }
        case 'update_availability': {
          authority = 'updateStructuredChatAvailability'; const r = await updateStructuredChatAvailability(db, user, a);
          result = { ...r, status: r.ok ? r.actualizado ? 'committed' : 'confirmed' :
            r.code === 'AVAILABILITY_WRITE_FAILED' || r.code === 'AVAILABILITY_READBACK_FAILED' ? 'unknown' :
              r.code === 'AVAILABILITY_CONFIRMATION_STALE' ? 'conflict' : 'rejected' }; break;
        }
        case 'record_athlete_data': authority = 'reported_events_profile_cas';
          result = await recordReportedEvent(db, user, a, { operationId, messageId: input.messageId, message: input.message, timestamp: input.timestamp }); break;
        case 'update_session': case 'record_execution': {
          const execution = call.name === 'record_execution';
          const allowed = execution ? ['date','description','discipline','durationMinutes','rpe','sessionId','expectedRevision','associationConfirmed']
            : ['date','sessionId','expectedRevision','reason','state','discipline','intent','proposal','maximumSeconds'];
          if (Object.keys(a).some(k => !allowed.includes(k))) throw new Error('TOOL_ARGUMENT_INVALID');
          if (execution && a.sessionId === undefined) {
            authority = 'recordExternalExecution';
            result = await recordExternalExecution(db, user, a, { operationId, messageId: input.messageId, message: input.message }, today); break;
          }
          if (execution && a.associationConfirmed !== true) { result = { status: 'rejected', code: 'EXECUTION_ASSOCIATION_REQUIRED' }; break; }
          if (execution && (typeof a.description !== 'string' || !a.description.trim() || a.description.length > 3000
            || a.durationMinutes !== undefined && (!Number.isFinite(a.durationMinutes) || a.durationMinutes < 0)
            || a.rpe !== undefined && (!Number.isFinite(a.rpe) || a.rpe < 0 || a.rpe > 10))) throw new Error('EXECUTION_ARGUMENT_INVALID');
          authority = 'chatCoachActions/validatePlanMutation/mutatePlanWithCAS';
          const action = execution ? { kind: 'record_performed', date: a.date, sessionId: a.sessionId,
            discipline: a.discipline, quote: input.message, responseQuotes: [] } : { ...a, kind: 'adapt_session' };
          const results = await applyChatCoachActions(db, user, input.message, [action], async () => { throw new Error('REVIEW_NOT_ALLOWED'); }, today, '',
            { loadContext: date => loadCoachActionContext(db, user, date), expectedRevision: a.expectedRevision, maximumSeconds: a.maximumSeconds,
              ...(execution ? { reportedExecution: { operationId, messageId: input.messageId, description: a.description,
                ...(a.durationMinutes === undefined ? {} : { durationMinutes: a.durationMinutes }), ...(a.rpe === undefined ? {} : { rpe: a.rpe }) } } : {}) });
          result = results[0] ?? { status: 'rejected', code: 'ACTION_NO_RESULT' }; break;
        }
        case 'transition_restriction': authority = 'transitionAthleteState/protected_ui';
          result = { status: 'confirmation_required', code: 'PROTECTED_RESTRICTION_FLOW_REQUIRED',
            message: 'La resolución requiere el flujo explícito de restricción y reevaluación; el chat no da el alta.' }; break;
        case 'generate_week': {
          authority = 'weekly_generation_authorities';
          if (!a || Object.keys(a).some(key => !['availabilityReadId', 'includeToday', 'snapshotDigest'].includes(key))
            || typeof a.availabilityReadId !== 'string' || typeof a.includeToday !== 'boolean' || typeof a.snapshotDigest !== 'string') {
            result = { status: 'rejected', code: 'GENERATION_READ_ARGUMENT_INVALID' }; break;
          }
          const selected = availabilityReads.get(a.availabilityReadId);
          if (!selected) { result = { status: 'rejected', code: 'GENERATION_AVAILABILITY_READ_REQUIRED' }; break; }
          if (a.snapshotDigest !== selected.snapshotDigest) { result = { status: 'rejected', code: 'GENERATION_READ_DIGEST_MISMATCH' }; break; }
          if (!planningWeeks.has(selected.week)) { result = { status: 'rejected', code: 'GENERATION_PLANNING_READ_REQUIRED' }; break; }
          result = await generate({ week: selected.week, includeToday: a.includeToday, snapshotDigest: a.snapshotDigest },
            operationId, reason => { argumentReason = reason; }); break;
        }
        default: result = { status: 'rejected', code: 'TOOL_NOT_SUPPORTED' };
      }
      if (call.name !== 'read_context') invalidateReads();
      result = { ...result, operationId };
      return result;
    } catch (error) {
      if (call.name !== 'read_context') invalidateReads();
      if (call.name === 'read_context') failure = readFailureDiagnostic(error, readStage);
      result = { status: call.name === 'read_context' ? 'rejected' : 'unknown', code: 'TOOL_UNAVAILABLE' }; return result;
    }
    finally { observe({ route: 'coach_first', policy: mode, tool: authority || result?.reason === 'read_only_policy' ? call.name : 'unsupported', authority, status: result?.status ?? 'rejected', operationId,
      ...(result?.reason === 'read_only_policy' ? { reason: 'read_only_policy' } : {}),
      ...failure,
      ...(call.name === 'generate_week' && authority === 'weekly_generation_authorities'
        && result?.status === 'partial' && result.code === 'PLANNER_NOT_ADMITTED'
        ? plannerRejectionDiagnostic(result.requirements) : {}),
      ...(call.name === 'generate_week' && authority === 'weekly_generation_authorities' && result?.status === 'rejected'
        ? generationRejectionDiagnostic(result, argumentReason) : {}),
      ...(call.name === 'read_context' && ['session','week','availability','state','restrictions','goals','reported_events','history','load','planning'].includes(a.resource) ? { resource: a.resource } : {}) }); }
  };
}
