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
      mutationIntents: { type: 'array', maxItems: 3, uniqueItems: true, items: { type: 'string', enum: ['record_execution', 'propose_development_area', 'respond_development_proposal'] }, description: 'Mandatory semantic classification. Reported training requires record_execution; a longitudinal proposal or candidate response requires its development action. [] only when none applies. Retain pending intents across rounds.' },
      clarification: { anyOf: [{ type: 'string', minLength: 1, maxLength: 800 }, { type: 'null' }], description: 'Only a necessary question to resolve ambiguous association or missing information. Never a state claim. Normally null.' },
      answer: { anyOf: [{ type: 'string', maxLength: 16000 }, { type: 'null' }] },
      calls: { type: 'array', maxItems: 8, items: {
        type: 'object', additionalProperties: false, required: ['name', 'arguments'],
        properties: { name: { type: 'string' }, arguments: { type: 'object' } },
      } },
    },
  },
};

export function readCoachFirstOutput(output: any): unknown {
  // Refusals, truncations, missing/duplicate envelopes and text-only responses fail closed.
  if (!output || output.stop_reason !== 'tool_use' || !Array.isArray(output.content))
    throw new Error('COACH_FIRST_OUTPUT_INVALID');
  const calls = output.content.filter((block: any) => block?.type === 'tool_use');
  if (calls.length !== 1 || calls[0].name !== COACH_FIRST_OUTPUT_TOOL.name
    || typeof calls[0].id !== 'string' || !calls[0].id)
    throw new Error('COACH_FIRST_OUTPUT_INVALID');
  return calls[0].input;
}
