/** Native Anthropic tool-use envelope, not an executable Forge capability.
 * Ordinary tool schemas support open argument objects; strict JSON outputs require
 * closed schemas throughout. Domain argument validation stays with existing authorities.
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
 */
export const COACH_FIRST_OUTPUT_TOOL = {
  name: 'submit_coach_turn',
  description: 'Submit the Coach answer and requested Forge calls for this round. This envelope itself performs no action. Use calls=[] with a string answer for a direct response. Use answer=null when requesting context without a user-facing answer yet.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['answer', 'calls'],
    properties: {
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
