/** Native Anthropic tool-use envelope, not an executable Forge capability.
 * Ordinary tool schemas support open argument objects; strict JSON outputs require
 * closed schemas throughout. Domain argument validation stays with existing authorities.
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
 */
export const COACH_FIRST_OUTPUT_TOOL = {
  name: 'submit_coach_turn',
  description: 'Classify mutationIntents semantically on every round, then submit requested Forge calls. This envelope itself performs no action. calls=[] can finish only when declared mutations have verified receipts, or no mutation is needed. Use clarification for essential ambiguity and answer=null when reading context.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['answer', 'calls', 'mutationIntents', 'clarification'],
    properties: {
      mutationIntents: { type: 'array', maxItems: 3, uniqueItems: true, items: { type: 'string', enum: ['propose_development_area', 'respond_development_proposal'] }, description: 'Mandatory semantic classification. Training reports use the registration form, without a mutation intent. A longitudinal proposal or candidate response requires its development action. [] only when none applies. Retain pending intents across rounds.' },
      clarification: { anyOf: [{ type: 'string', minLength: 1, maxLength: 800 }, { type: 'null' }], description: 'Only a necessary question to resolve ambiguous association or missing information. Never a state claim. Normally null.' },
      answer: { anyOf: [{ type: 'string', maxLength: 16000 }, { type: 'null' }] },
      calls: { type: 'array', maxItems: 8, items: {
        type: 'object', additionalProperties: false, required: ['name', 'arguments'],
        properties: { name: { type: 'string' }, arguments: { type: 'object' } },
      } },
    },
  },
};

export type OutputRejectionObserver = (boundary: 'envelope' | 'decision' | 'mutation_intents', predicate: string, input: unknown) => void;

/** Observation is isolated from admission, including projection and logger failures. */
export function observeOutputRejection(observe: OutputRejectionObserver | undefined,
  boundary: Parameters<OutputRejectionObserver>[0], predicate: string, input: unknown) {
  try { observe?.(boundary, predicate, input); } catch { /* Preserve the original rejection. */ }
}

export function logCoachFirstOutputRejection(context: {
  messageId: string | null; operationId: string | null; round: number; providerStatus: number | null; output: any;
}, boundary: Parameters<OutputRejectionObserver>[0], predicate: string, input: any) {
  try {
    const type = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const known = ['answer', 'calls', 'mutationIntents', 'clarification'];
    const blocks = Array.isArray(context.output?.content) ? context.output.content : [];
    const tools = blocks.filter((b: any) => b?.type === 'tool_use');
    if (boundary === 'envelope' && tools.length === 1) input = tools[0].input;
    const object = input !== null && typeof input === 'object' && !Array.isArray(input);
    const stopReasons = ['tool_use','end_turn','max_tokens','stop_sequence','pause_turn','refusal'];
    const blockTypes = ['text','tool_use','thinking','redacted_thinking','server_tool_use','web_search_tool_result'];
    const intents = input?.mutationIntents;
    console.info('COACH_FIRST_OUTPUT_INVALID_DETAIL', {
      messageId: context.messageId, operationId: context.operationId, round: context.round,
      providerStatus: context.providerStatus,
      stopReason: stopReasons.includes(context.output?.stop_reason) ? context.output.stop_reason : '[unrecognized]',
      contentBlockTypes: blocks.map((b: any) => blockTypes.includes(b?.type) ? b.type : '[unrecognized]'),
      textBlockCount: blocks.filter((b: any) => b?.type === 'text').length, toolUseCount: tools.length,
      toolName: tools.length === 1 && tools[0].name === COACH_FIRST_OUTPUT_TOOL.name ? COACH_FIRST_OUTPUT_TOOL.name : '[unrecognized]',
      jsonParseResult: 'success', envelopeValidationResult: boundary === 'envelope' ? 'invalid' : 'valid',
      inputType: type(input), knownFieldPresence: Object.fromEntries(known.map(k => [k, object && Object.hasOwn(input, k)])),
      additionalKeyCount: object ? Object.keys(input).filter(k => !known.includes(k)).length : 0,
      answerType: type(input?.answer), clarificationType: type(input?.clarification),
      callsType: type(input?.calls), mutationIntentsType: type(intents),
      ...(typeof input?.answer === 'string' ? { answerLength: input.answer.length } : {}),
      ...(typeof input?.clarification === 'string' ? { clarificationLength: input.clarification.length,
        clarificationIsBlank: !input.clarification.trim() } : {}),
      ...(Array.isArray(input?.calls) ? { callsCount: input.calls.length } : {}),
      ...(Array.isArray(intents) ? { mutationIntentsCount: intents.length,
        mutationIntentDuplicateCount: intents.length - new Set(intents).size,
        unknownMutationIntentCount: intents.filter(v => !['record_execution','propose_development_area','respond_development_proposal'].includes(v)).length } : {}),
      failedBoundary: boundary, failedPredicate: predicate,
    });
  } catch { /* Never replace COACH_FIRST_OUTPUT_INVALID with a diagnostic failure. */ }
}

export function readCoachFirstOutput(output: any, observe?: OutputRejectionObserver): unknown {
  // Refusals, truncations, missing/duplicate envelopes and text-only responses fail closed.
  if (!output || output.stop_reason !== 'tool_use' || !Array.isArray(output.content)) {
    observeOutputRejection(observe, 'envelope', !output ? 'ENVELOPE_OUTPUT_MISSING'
      : output.stop_reason !== 'tool_use' ? 'ENVELOPE_STOP_REASON_INVALID' : 'ENVELOPE_CONTENT_NOT_ARRAY', undefined);
    throw new Error('COACH_FIRST_OUTPUT_INVALID');
  }
  const calls = output.content.filter((block: any) => block?.type === 'tool_use');
  if (calls.length !== 1 || calls[0].name !== COACH_FIRST_OUTPUT_TOOL.name
    || typeof calls[0].id !== 'string' || !calls[0].id) {
    observeOutputRejection(observe, 'envelope', calls.length !== 1 ? 'ENVELOPE_TOOL_USE_COUNT_INVALID'
      : calls[0].name !== COACH_FIRST_OUTPUT_TOOL.name ? 'ENVELOPE_TOOL_NAME_INVALID' : 'ENVELOPE_TOOL_ID_INVALID', undefined);
    throw new Error('COACH_FIRST_OUTPUT_INVALID');
  }
  return calls[0].input;
}
