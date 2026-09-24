import { plannerProviderMetadata } from './weeklyPlannerDiagnostics';

export const LONGITUDINAL_DECISION_MARKER = 'LONGITUDINAL_COACH_TRANSITION\n';
export const LONGITUDINAL_DECISION_TOOL = {
  name: 'submit_longitudinal_decision',
  description: 'Submit the next longitudinal block decision. This tool only returns a proposal; the server validates and authorizes it.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['bloque', 'totalSemanas', 'reason'],
    properties: {
      bloque: { type: 'string', enum: ['acumulacion', 'intensificacion', 'realizacion', 'deload'] },
      totalSemanas: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      reason: { type: 'string', minLength: 1, maxLength: 600 },
    },
  },
};

/** Ignore prose; require exactly one unambiguous tool invocation. Never parse model text. */
export function readLongitudinalDecisionOutput(output: any) {
  if (!output || output.stop_reason !== 'tool_use' || !Array.isArray(output.content))
    throw new Error('LONGITUDINAL_DECISION_INVALID');
  const calls = output.content.filter((block: any) => block?.type === 'tool_use');
  if (calls.length !== 1 || calls[0].name !== LONGITUDINAL_DECISION_TOOL.name
    || typeof calls[0].id !== 'string' || !calls[0].id)
    throw new Error('LONGITUDINAL_DECISION_INVALID');
  // Preserve the shared callback shape without changing the weekly text consumer.
  // Longitudinal authority consumes only longitudinalDecision, never this empty text.
  return { text: '', metadata: plannerProviderMetadata(output), longitudinalDecision: calls[0].input };
}
