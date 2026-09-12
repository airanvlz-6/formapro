export type PlannerMetadata = {
  stopReason: string | null; outputTokens: number | null;
  contentBlockCount: number | null; contentBlockTypes: string[];
};
export type PlannerCompletion = string | { text: string; metadata: PlannerMetadata };

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

const errorCodes = ['LLM_REQUEST_FAILED', 'WEEKLY_JSON_INVALID', 'WEEKLY_SCHEMA_INVALID', 'WEEKLY_REQUIRES_SEVEN_DAYS',
  'WEEKLY_SLOT_SCHEMA_INVALID', 'WEEKLY_DUPLICATE_DAY', 'WEEKLY_OPTION_NOT_ALLOWED', 'WEEKLY_EXECUTABLE_LIMIT',
  'WEEKLY_NO_EXECUTABLE_SELECTION', 'WEEKLY_REST_REQUIRED', 'WEEKLY_DECISION_REQUIRED', 'WEEKLY_DECISION_SCHEMA_INVALID',
  'WEEKLY_FIXED_PRESCRIPTION_DUPLICATE', 'WEEKLY_STRATEGY_COVERAGE_REQUIRED', 'NO_NEW_EXECUTABLE_PRESCRIPTION',
  'D3_REQUIRED_LONG_RUN_MISSING', 'D3_REQUIRED_QUALITY_MISSING', 'D3_REQUIRED_EASY_MISSING', 'D3_REQUIRED_RECOVERY_MISSING'];

export function emitWeeklyPlannerDiagnostic(attempt: 1 | 2, raw: string, metadata: PlannerMetadata | undefined,
  parseOk: boolean, validationErrors: string[], reason: 'RAW_TOO_LONG' | 'JSON_PARSE_FAILED' | 'LLM_REQUEST_FAILED' | null,
  normalizedMarkdownFence = false) {
  // Diagnostics must never change an admission decision, even if the logging sink fails.
  try {
    console.info('WEEKLY_PLANNER_DIAGNOSTIC', {
      attempt, rawLength: raw.length, overLengthLimit: raw.length > 32000, emptyText: raw.trim().length === 0,
      hasMarkdownFence: raw.includes('```'), normalizedMarkdownFence, parseOk, reason,
      validationErrors: [...new Set(validationErrors.filter(e => errorCodes.includes(e)))],
      stopReason: metadata?.stopReason == null ? null : label(metadata.stopReason, stopReasons),
      outputTokens: count(metadata?.outputTokens), contentBlockCount: count(metadata?.contentBlockCount),
      contentBlockTypes: [...new Set((metadata?.contentBlockTypes ?? []).map(t => label(t, blockTypes)))],
    });
  } catch { /* Observability is not authority. */ }
}
