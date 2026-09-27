export type PlannerMetadata = {
  stopReason: string | null; outputTokens: number | null;
  contentBlockCount: number | null; contentBlockTypes: string[];
};
export type PlannerCompletion = string | { text: string; metadata: PlannerMetadata; weeklySelection?: unknown };
export class WeeklyTransportError extends Error {
  constructor() { super('LLM_REQUEST_FAILED'); }
}
export type WeeklyProcessingStage = 'completion_processing' | 'completion_projection' | 'tool_output' | 'normalization' | 'json_parse' | 'selection_validation' | 'admission_processing';
export function weeklyInternalFailure(error: unknown, stage: WeeklyProcessingStage) {
  const errorType = label((error as any)?.name, ['Error','TypeError','RangeError','ReferenceError','SyntaxError']);
  const diagnostic = { stage, category: 'internal_processing', errorType, errorCode: 'WEEKLY_INTERNAL_PROCESSING_ERROR' };
  try { console.info('WEEKLY_PROCESSING_DIAGNOSTIC', diagnostic); } catch { /* Observation only. */ }
  return { ok: false as const, code: 'WEEKLY_PLANNER_FAILED', errors: ['WEEKLY_INTERNAL_PROCESSING_ERROR'], ...diagnostic };
}

/** Carries only safe metadata across the provider/Planner boundary, never the response payload. */
export class WeeklyProviderResponseError extends Error {
  readonly metadata: PlannerMetadata;
  constructor(readonly responseReason: 'BODY_JSON_INVALID' | 'CONTENT_INVALID' | 'TOOL_USE_MISSING' | 'TOOL_USE_INVALID' | 'STOP_REASON_INVALID', output?: unknown) {
    super('WEEKLY_PROVIDER_RESPONSE_INVALID');
    this.metadata = plannerProviderMetadata(output);
  }
}

const stopReasons = ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal', 'model_context_window_exceeded'];
const blockTypes = ['text', 'thinking', 'redacted_thinking', 'tool_use', 'server_tool_use', 'tool_result', 'web_search_tool_result', 'web_fetch_tool_result'];
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const label = (value: unknown, allowed: string[]) => typeof value === 'string' && allowed.includes(value) ? value : 'unknown';

/** Copy only bounded, allowlisted provider metadata; never retain the envelope. */
export function plannerProviderMetadata(output: any): PlannerMetadata {
  const blocks = Array.isArray(output?.content) ? output.content : null;
  return {
    stopReason: output?.stop_reason == null ? null : label(output.stop_reason, stopReasons),
    outputTokens: count(output?.usage?.output_tokens), contentBlockCount: blocks ? blocks.length : null,
    contentBlockTypes: blocks ? [...new Set<string>(blocks.map((b: any) => label(b?.type, blockTypes)))] : [],
  };
}

const errorCodes = ['LLM_REQUEST_FAILED', 'WEEKLY_PROVIDER_RESPONSE_INVALID', 'WEEKLY_JSON_INVALID', 'WEEKLY_SCHEMA_INVALID', 'WEEKLY_REQUIRES_SEVEN_DAYS',
  'WEEKLY_SLOT_SCHEMA_INVALID', 'WEEKLY_DUPLICATE_DAY', 'WEEKLY_OPTION_NOT_ALLOWED', 'WEEKLY_EXECUTABLE_LIMIT',
  'WEEKLY_NO_EXECUTABLE_SELECTION', 'WEEKLY_REST_REQUIRED', 'WEEKLY_DECISION_REQUIRED', 'WEEKLY_DECISION_SCHEMA_INVALID',
  'WEEKLY_FIXED_PRESCRIPTION_DUPLICATE', 'WEEKLY_STRATEGY_COVERAGE_REQUIRED', 'NO_NEW_EXECUTABLE_PRESCRIPTION',
  'D3_REQUIRED_LONG_RUN_MISSING', 'D3_REQUIRED_QUALITY_MISSING', 'D3_REQUIRED_EASY_MISSING', 'D3_REQUIRED_RECOVERY_MISSING'];

export function emitWeeklyPlannerDiagnostic(attempt: 1 | 2, raw: string, metadata: PlannerMetadata | undefined,
  parseOk: boolean, validationErrors: string[], reason: 'RAW_TOO_LONG' | 'JSON_PARSE_FAILED' | 'LLM_REQUEST_FAILED' | 'WEEKLY_PROVIDER_RESPONSE_INVALID' | null,
  normalizedMarkdownFence = false, responseError?: WeeklyProviderResponseError) {
  // Diagnostics must never change an admission decision, even if the logging sink fails.
  try {
    console.info('WEEKLY_PLANNER_DIAGNOSTIC', {
      attempt, rawLength: raw.length, overLengthLimit: raw.length > 32000, emptyText: raw.trim().length === 0,
      hasMarkdownFence: raw.includes('```'), normalizedMarkdownFence, parseOk, reason,
      validationErrors: [...new Set(validationErrors.filter(e => errorCodes.includes(e)))],
      stopReason: metadata?.stopReason == null ? null : label(metadata.stopReason, stopReasons),
      outputTokens: count(metadata?.outputTokens), contentBlockCount: count(metadata?.contentBlockCount),
      contentBlockTypes: [...new Set((metadata?.contentBlockTypes ?? []).map(t => label(t, blockTypes)))],
      ...(responseError ? { responseReceived: true, bodyParseable: responseError.responseReason !== 'BODY_JSON_INVALID',
        stage: responseError.responseReason === 'BODY_JSON_INVALID' ? 'provider_body' : 'tool_output',
        category: responseError.responseReason.startsWith('TOOL_USE') ? 'provider_tool' : 'provider_response',
        responseReason: label(responseError.responseReason, ['BODY_JSON_INVALID','CONTENT_INVALID','TOOL_USE_MISSING','TOOL_USE_INVALID','STOP_REASON_INVALID']),
        toolUsePresent: metadata?.contentBlockTypes.includes('tool_use') ?? false } : {}),
      ...(!responseError && reason !== 'LLM_REQUEST_FAILED' ? { stage: reason === 'JSON_PARSE_FAILED' ? 'json_parse' : reason === 'RAW_TOO_LONG' ? 'normalization' : 'selection_validation',
        category: reason === 'JSON_PARSE_FAILED' || reason === 'RAW_TOO_LONG' ? 'proposal_parser' : 'weekly_contract' } : {}),
    });
  } catch { /* Observability is not authority. */ }
}
