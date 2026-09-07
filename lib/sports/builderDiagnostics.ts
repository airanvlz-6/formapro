import { createHash, randomUUID } from 'node:crypto';

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
    emit(attempt: number, stage: string, code: string, violations: string[], eligible: boolean, reason: string) {
      const safe = safeViolations(violations);
      const event = { planningRunId, builderInvocationId, contractIdentity: identity, weekStart: c.targetWeekStart, day: c.targetDay,
        attempt, maxAttempts: 2, stage, result: code === 'PASS' ? 'pass' : 'fail', code, violations: safe,
        retryEligible: eligible, retryReason: reason, provider: { ...provider },
        failures: safe.map(v => ({ FAILED_VALIDATOR: stage, FAILED_RULE: v.split(':')[0], FAILED_FIELD: v.includes(':') ? v.split(':')[1] : 'unknown',
          EXPECTED: 'unknown', RECEIVED_TYPE_SAFE_SUMMARY: 'unknown' })) };
      events.push(event);
      try { console.info?.('SESSION_BUILDER_ATTEMPT', event); } catch { /* Diagnostics cannot change admission. */ }
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
