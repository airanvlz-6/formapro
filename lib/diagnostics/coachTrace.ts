/** Observation only: no work callbacks, promise wrappers, inputs, outputs or exception replacement. */
const operations = [
  'postGrounding.prepare', 'postGrounding.extractFacts', 'postGrounding.affectedFuturePlans', 'postGrounding.context',
  'answerGroundedChat', 'message.validate', 'prompt.build', 'generationAttempt', 'repair',
  'generation.arguments', 'generation.provider', 'response.parse', 'answer.validate', 'metadata.validate',
  'review.arguments', 'review.provider', 'review.parse', 'review.admit', 'decision.admit', 'answer.return',
  'generation.provider.requestArguments', 'generation.provider.receive', 'generation.provider.deserialize', 'generation.provider.extractText',
  'review.provider.requestArguments', 'review.provider.receive', 'review.provider.deserialize', 'review.provider.extractText',
] as const;
type Operation = typeof operations[number];
type Phase = 'success' | 'failure' | 'rejected';
const classes = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'TimeoutError', 'DataCloneError'];
const codes = ['CHAT_REVIEW_COACHING_ONLY', 'CHAT_REVIEW_FACTS_REMOVED', 'CHAT_REVIEW_UNVERIFIED', 'CHAT_RESPONSE_OBJECT_REQUIRED', 'CHAT_MESSAGE_INVALID', 'CHAT_PROVIDER_FAILED', 'CHAT_RESPONSE_JSON_REQUIRED', 'CHAT_ANSWER_INVALID',
  'CHAT_EPISTEMIC_SCHEMA_INVALID', 'CHAT_CANONICAL_FACT_MISMATCH', 'CHAT_EVIDENCE_NOT_USER_REPORTED',
  'CHAT_GROUNDING_REVIEW_INVALID', 'CHAT_PROSE_UNGROUNDED', 'CHAT_RESPONSE_INVALID',
  'ABORT_ERR', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'];
function errorField(error: unknown, key: string): unknown {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return undefined;
  let current = error;
  for (let depth = 0; current && depth < 8; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
function safeError(error: unknown) {
  let errorClass = 'UnknownError', errorCode = 'UNCLASSIFIED';
  try {
    const name = errorField(error, 'name');
    if (typeof name === 'string' && classes.includes(name)) errorClass = name;
    for (const value of [errorField(error, 'code'), errorField(error, 'message')]) if (typeof value === 'string' && codes.includes(value)) { errorCode = value; break; }
  } catch { /* Error getters are not diagnostic authority. */ }
  return { errorClass, errorCode };
}
export interface CoachTrace {
  start(operation: Operation, attempt?: 1 | 2): number;
  end(operationId: number, phase?: Phase, error?: unknown): void;
  failFrom(operationId: number, error: unknown): void;
}
export type ProviderObservation = { trace: CoachTrace; attempt: 1 | 2; kind: 'generation' | 'review'; outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> } };
export const silentCoachTrace: CoachTrace = { start: () => 0, end() {}, failFrom() {} };
export function createCoachTrace(runId: string): CoachTrace {
  if (process.env.FORGE_CHAT_COACH_DIAGNOSTICS !== '1') return silentCoachTrace;
  const safeRunId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) ? runId : null;
  let sequence = 0;
  const open = new Map<number, { operation: Operation; attempt?: 1 | 2; started: number }>();
  const emit = (operationId: number, entry: { operation: Operation; attempt?: 1 | 2; started: number }, phase: 'start' | Phase, error?: unknown) => {
    try {
      console.info('CHAT_COACH_OPERATION', JSON.stringify({ runId: safeRunId, operationId,
        operation: operations.includes(entry.operation) ? entry.operation : 'unknown',
        ...(entry.attempt === 1 || entry.attempt === 2 ? { attempt: entry.attempt } : {}),
        phase: ['start', 'success', 'failure', 'rejected'].includes(phase) ? phase : 'failure', durationMs: Math.max(0, Date.now() - entry.started),
        ...(['failure', 'rejected'].includes(phase) ? safeError(error) : {}) }));
    } catch { /* A failed sink must never influence coaching. */ }
  };
  const trace: CoachTrace = {
    start(operation, attempt) {
      try {
        const id = ++sequence, entry = { operation, attempt, started: Date.now() };
        open.set(id, entry); emit(id, entry, 'start'); return id;
      } catch { return 0; }
    },
    end(id, phase = 'success', error) {
      try { const entry = open.get(id); if (entry) { open.delete(id); emit(id, entry, phase, error); } } catch { /* Observation only. */ }
    },
    failFrom(id, error) {
      try { for (const key of [...open.keys()].reverse()) if (key >= id) trace.end(key, 'failure', error); } catch { /* Observation only. */ }
    },
  };
  return trace;
}
