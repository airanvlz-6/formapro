import type { SessionShapeDiagnostic, PrescriptionShapeDiagnostic } from './sessionShapeDiagnostics';
import { createHash, randomUUID } from 'node:crypto';
import { signalIds } from '../athlete/prescriptionSignals';
import { referenceQuestionFields } from './prescriptionReferenceFields';
import { MOVEMENT_LIBRARY } from './movementLibrary';

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
type DiagnosticShape = 'scalar' | { fields: Record<string, DiagnosticShape> } | { items: DiagnosticShape };
const decisionShape: DiagnosticShape = { fields: { kind: 'scalar', version: 'scalar', adaptation: 'scalar',
  stimulus: 'scalar', method: 'scalar', role: 'scalar', reason: 'scalar', patterns: { items: 'scalar' } } };
const developmentIntentShape: DiagnosticShape = { items: { fields: {
  areaId: 'scalar', areaRevision: 'scalar', intendedRole: 'scalar', rationale: 'scalar' } } };
/** Only the explicitly selected fields may expose values; unexpected fields expose name/type only. */
function diagnosticValue(value: any, shape?: DiagnosticShape): any {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const result: any = { type };
  if (type === 'array') {
    result.length = value.length;
    result.items = value.map((item: unknown) => shape && typeof shape === 'object' && 'items' in shape
      ? diagnosticValue(item, shape.items) : { type: item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item });
  } else if (type === 'object') {
    result.keys = Object.keys(value);
    const fields = shape && typeof shape === 'object' && 'fields' in shape ? shape.fields : {};
    result.fields = Object.fromEntries([...new Set([...Object.keys(value), ...Object.keys(fields)])].map(key =>
      [key, Object.hasOwn(fields, key) ? diagnosticField(value, key, fields[key]) : {
        present: true, type: value[key] === null ? 'null' : Array.isArray(value[key]) ? 'array' : typeof value[key] }]));
  } else if (shape === 'scalar' && ['string','number','boolean','null'].includes(type)) result.value = value;
  return result;
}
function diagnosticField(parent: any, key: string, shape: DiagnosticShape): any {
  return { present: Object.hasOwn(parent, key), ...diagnosticValue(parent[key], shape) };
}
function contractRejectionProjection(proposal: any, authority: any) {
  const developmentAreas = diagnosticField(authority, 'developmentAreas', { fields: {
    areas: { items: { fields: { areaId: 'scalar', revision: 'scalar' } } } } });
  developmentAreas.projection = 'identity_revision_only';
  developmentAreas.emptySnapshotFallback = authority.developmentAreas == null;
  if (developmentAreas.emptySnapshotFallback) developmentAreas.effectiveAreaCount = 0;
  return {
    proposal: { stimulusId: diagnosticField(proposal, 'stimulusId', 'scalar'),
      finalDecision: diagnosticField(proposal, 'finalDecision', decisionShape),
      developmentIntent: diagnosticField(proposal, 'developmentIntent', developmentIntentShape) },
    contract: { contractVersion: diagnosticField(authority, 'contractVersion', 'scalar'),
      coachingGuidance: diagnosticField(authority, 'coachingGuidance', decisionShape),
      finalDecision: diagnosticField(authority, 'finalDecision', decisionShape), developmentAreas },
  };
}
export function builderTrace(contract: unknown, runId?: string) {
  const c = contract as { targetWeekStart: string; targetDay: string; discipline?: string };
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
      const duplicates = violations.filter(v => v.startsWith('DUPLICATE_MOVEMENT:'));
      for (const [occurrence, violation] of duplicates.slice(0, 32).entries()) {
        const [, block, movement] = violation.split(':');
        try { console.info?.('SESSION_DUPLICATE_MOVEMENT_DETAIL', JSON.stringify({ planningRunId, builderInvocationId,
          contractIdentity: identity, day: c.targetDay, attempt, occurrence,
          blockIndex: /^[0-2]$/.test(block) ? Number(block) : null,
          movementId: Object.hasOwn(MOVEMENT_LIBRARY, movement ?? '') ? movement : null,
          expected: 'unique_movement_id_within_block', totalCount: duplicates.length, truncated: duplicates.length > 32 })); }
        catch { /* Diagnostics cannot alter parsing or retry. */ }
      }
      for (const detail of details.slice(0, 32)) {
        try { console.info?.('SESSION_PRESCRIPTION_DATA_MISSING_DETAIL', JSON.stringify({ planningRunId, builderInvocationId,
          contractIdentity: identity, day: c.targetDay, attempt, ...detail, totalCount: details.length, truncated: details.length > 32 })); }
        catch { /* Flat diagnostics must also be non-authoritative. */ }
      }
    },
    shape(attempt: number, detail: SessionShapeDiagnostic) {
      try { console.info?.('SESSION_SHAPE_VIOLATION', { planningRunId, builderInvocationId, contractIdentity: identity,
        weekStart: c.targetWeekStart, day: c.targetDay, attempt, ...detail }); } catch { /* Observation cannot alter admission. */ }
    },
    prescriptionShape(attempt: number, detail: PrescriptionShapeDiagnostic) {
      try { console.info?.('SESSION_PRESCRIPTION_SHAPE_INVALID', { planningRunId, builderInvocationId, contractIdentity: identity,
        weekStart: c.targetWeekStart, day: c.targetDay, discipline: c.discipline ?? null, attempt, ...detail }); }
      catch { /* Log-only: no return payload or retry feedback changes. */ }
    },
    contractRejection(attempt: number, stage: 'admitFinalDecision' | 'validateSessionAgainstTrainingContract', violation: string,
      proposal: unknown, authority: unknown) {
      if (violation !== 'FINAL_SESSION_DECISION_INVALID' && violation !== 'DEVELOPMENT_INTENT_INVALID') return;
      try {
        const event = violation === 'FINAL_SESSION_DECISION_INVALID' ? 'SESSION_FINAL_DECISION_INVALID_DETAIL' : 'SESSION_DEVELOPMENT_INTENT_INVALID_DETAIL';
        console.info?.(event, JSON.stringify({ planningRunId, builderInvocationId, day: c.targetDay, attempt, stage, violation,
          ...contractRejectionProjection(proposal, authority) }));
      } catch { /* Projection and logging are observational only. */ }
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
  if (violations.some(v => /^(DOSE_|SESSION_DOSE_|RUNNING_METHOD_DOSE_)/.test(v))) return 'validateSessionAgainstTrainingContract/dose';
  return 'validateSessionAgainstTrainingContract';
}
