import { createHash, randomUUID } from 'node:crypto';
import { signalIds } from '../athlete/prescriptionSignals';
import { referenceQuestionFields } from './prescriptionReferenceFields';

export type SufficiencyFailure = { FAILED_RULE: 'PRESCRIPTION_DATA_MISSING'; FAILED_FIELD: string;
  EXPECTED_KIND: 'available_signal' | 'executable_reference'; RECEIVED_TYPE_SAFE_SUMMARY: string; PROPOSAL_PATH: string;
  MISSING_CATEGORY: 'capability' | 'equipment' | 'skill' | 'reference' | 'unresolved_signal' };
/** Only catalog signals and structural indices; never serialize a reference value or arbitrary suffix. */
export function sufficiencyFailure(signal: string, state: string, blockIndex: number, movementIndex: number): SufficiencyFailure {
  const reference = signal.startsWith('reference.');
  return { FAILED_RULE: 'PRESCRIPTION_DATA_MISSING',
    FAILED_FIELD: signalIds.includes(signal) ? `doseContext.sufficiency.signals.${signal}.state`
      : reference && Object.hasOwn(referenceQuestionFields, signal) ? `doseContext.references[${signal.slice(10)}]` : reference ? 'doseContext.references' : 'doseContext.sufficiency',
    MISSING_CATEGORY: reference ? 'reference' : signalIds.includes(signal) && signal.startsWith('capability.') ? 'capability'
      : signalIds.includes(signal) && signal.startsWith('equipment.') ? 'equipment' : signalIds.includes(signal) && signal.startsWith('skill.') ? 'skill' : 'unresolved_signal',
    EXPECTED_KIND: reference ? 'executable_reference' : 'available_signal',
    RECEIVED_TYPE_SAFE_SUMMARY: ['available', 'unavailable', 'unknown', 'ambiguous'].includes(state) ? `state_${state}` : 'invalid_state',
    PROPOSAL_PATH: `blocks[${blockIndex}].movements[${movementIndex}].prescription` };
}

export type BuilderCompletion = { text: string; planningRunId?: string; metadata?: {
  stopReason?: unknown; outputTokens?: unknown; contentBlockCount?: unknown; contentBlockTypes?: unknown } };
// Never retain arbitrary suffixes: movement IDs/field names in validator strings can originate in model text.
export function safeViolations(values: readonly string[]) {
  return values.map(v => { const [rule, field] = v.split(':');
    const safeRule = /^[A-Z][A-Z_]+$/.test(rule) ? rule : 'UNKNOWN_VIOLATION';
    return field && /^(sets|reps|durationSeconds|distanceMeters|restSeconds|\d{1,2})$/.test(field) ? `${safeRule}:${field}` : safeRule;
  });
}
export function builderTrace(contract: unknown, runId?: string) {
  const c = contract as { targetWeekStart: string; targetDay: string };
  const identity = createHash('sha256').update(JSON.stringify(contract)).digest('hex');
  const events: Record<string, any>[] = [];
  const builderInvocationId = randomUUID();
  let planningRunId: string | null = typeof runId === 'string' && /^[a-f0-9-]{36}$/.test(runId) ? runId : null;
  let provider: Record<string, unknown> = {};
  return {
    beginAttempt() { provider = {}; },
    completion(value: string | BuilderCompletion) {
      const raw = typeof value === 'string' ? value : value.text;
      const m = typeof value === 'string' ? undefined : value.metadata;
      if (typeof value !== 'string' && typeof value.planningRunId === 'string' && /^[a-f0-9-]{36}$/.test(value.planningRunId)) planningRunId = value.planningRunId;
      provider = { rawLength: typeof raw === 'string' ? raw.length : null, emptyResponse: typeof raw === 'string' ? !raw.trim() : null,
        stopReason: ['end_turn','max_tokens','stop_sequence','tool_use','pause_turn','refusal'].includes(String(m?.stopReason)) ? m!.stopReason : 'unknown',
        outputTokens: Number.isSafeInteger(m?.outputTokens) && Number(m?.outputTokens) >= 0 ? m!.outputTokens : null,
        contentBlockCount: Number.isSafeInteger(m?.contentBlockCount) && Number(m?.contentBlockCount) >= 0 ? m!.contentBlockCount : null,
        contentBlockTypes: Array.isArray(m?.contentBlockTypes) ? m.contentBlockTypes.map(t => ['text','thinking','redacted_thinking','tool_use'].includes(t) ? t : 'unknown') : [],
        truncationIndicated: m?.stopReason === 'max_tokens' };
      return raw;
    },
    emit(attempt: number, stage: string, code: string, violations: string[], eligible: boolean, reason: string, details: SufficiencyFailure[] = []) {
      const safe = safeViolations(violations);
      const event = { planningRunId, builderInvocationId, contractIdentity: identity, weekStart: c.targetWeekStart, day: c.targetDay,
        attempt, maxAttempts: 2, stage, result: code === 'PASS' ? 'pass' : 'fail', code, violations: safe,
        retryEligible: eligible, retryReason: reason, provider: { ...provider },
        failures: details.length ? details.slice(0, 32).map(detail => ({ FAILED_VALIDATOR: stage, ...detail })) : safe.map(v => ({ FAILED_VALIDATOR: stage, FAILED_RULE: v.split(':')[0], FAILED_FIELD: v.includes(':') ? v.split(':')[1] : 'unknown',
          EXPECTED: 'unknown', RECEIVED_TYPE_SAFE_SUMMARY: 'unknown' })) };
      if (details.length > 32) Object.assign(event, { failuresTruncated: true, failureTotalCount: details.length });
      events.push(event);
      try { console.info?.('SESSION_BUILDER_ATTEMPT', event); } catch { /* Diagnostics cannot change admission. */ }
      for (const detail of details.slice(0, 32)) {
        try { console.info?.('SESSION_PRESCRIPTION_DATA_MISSING_DETAIL', JSON.stringify({ planningRunId, builderInvocationId,
          contractIdentity: identity, day: c.targetDay, attempt, ...detail, totalCount: details.length, truncated: details.length > 32 })); }
        catch { /* Flat diagnostics must also be non-authoritative. */ }
      }
    },
    summary() { const last = events.at(-1); return { planningRunId, builderInvocationId, contractIdentity: identity,
      attemptCount: last?.attempt || 0, finalStage: last?.stage || 'preflight', finalViolations: last?.violations || [],
      retryExhausted: last?.result === 'fail' && last.attempt === 2, attempts: events }; },
  };
}
export function contractFailureStage(violations: string[]) {
  // This reflects the real ordered short-circuit validators, not a second validation pass.
  if (violations.some(v => v.startsWith('PRESCRIPTION_DATA_'))) return 'validateSessionAgainstTrainingContract/data_sufficiency';
  if (violations.some(v => /^SESSION_(BUDGET|DURATION)_/.test(v))) return 'validateSessionAgainstTrainingContract/budget';
  if (violations.some(v => /^(DOSE_|SESSION_DOSE_)/.test(v))) return 'validateSessionAgainstTrainingContract/dose';
  return 'validateSessionAgainstTrainingContract';
}
