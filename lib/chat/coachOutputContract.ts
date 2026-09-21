/** Wire schemas are static: never put athlete values in a compiled provider schema. */
const text = { type: 'string' };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const COACH_GENERATION_FORMAT = { type: 'json_schema' as const, schema: object({
  answer: text,
  grounding: { type: 'array', items: object({ fact: text, valueJson: text }) },
  evidence: { type: 'array', items: object({ quote: text, kind: { type: 'string', enum: ['observation', 'declaration'] } }) },
  interpretation: text, decision: text,
  actionsJson: { type: 'array', items: text },
}) };
export const COACH_REVIEW_FORMAT = { type: 'json_schema' as const, schema: object({
  supported: { type: 'boolean' }, unsupportedClaims: { type: 'array', items: object({ quote: text, kind: { type: 'string', enum: ['unsupported_fact', 'interpretation', 'recommendation', 'metadata'] } }) },
}) };
export const COACH_WIRE_INSTRUCTION = `\nFORMATO DE TRANSPORTE: devuelve únicamente un objeto JSON válido, sin Markdown ni texto exterior, conforme al schema suministrado. Conserva answer, evidence, interpretation y decision. En grounding usa {fact, valueJson}: valueJson es un string que contiene la serialización JSON completa del valor exacto (incluyendo comillas para strings, null, arrays y objetos). En lugar de actions usa actionsJson: cada elemento es un string con la serialización JSON completa de una acción candidata del contrato anterior; [] cuando no haya acciones. No omitas contenido ni cambies la semántica de valores o acciones. El texto natural va exclusivamente dentro de answer.`;

/** Only an entire JSON document or one entire fenced document; never salvage fragments. */
export function parseCoachObject(raw: string): Record<string, any> {
  let source = raw.trim();
  if (source.startsWith('```')) {
    const block = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(source);
    if (!block) throw new Error('CHAT_RESPONSE_JSON_REQUIRED');
    source = block[1];
  }
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('CHAT_RESPONSE_JSON_REQUIRED'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CHAT_RESPONSE_OBJECT_REQUIRED');
  return parsed as Record<string, any>;
}

/** Decode opaque JSON leaves without narrowing the domain vocabulary. Invalid candidates
 * stay invalid and cannot authorize learning or writes, but do not erase answer. */
export function decodeCoachEnvelope(envelope: Record<string, any>): Record<string, any> {
  const wire = Object.hasOwn(envelope, 'actionsJson');
  if (!wire) return envelope; // Defensive compatibility with the existing domain envelope.
  const { actionsJson, ...rest } = envelope;
  const decode = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
  };
  return { ...rest,
    grounding: Array.isArray(rest.grounding) ? rest.grounding.map((claim: any) => {
      if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return claim;
      const { valueJson, ...fields } = claim;
      const value = decode(valueJson);
      // Extra fields remain visible to metadata validation.
      return { ...fields, value, ...(value === undefined || Object.hasOwn(fields, 'value') ? { invalidWireValue: true } : {}) };
    }) : rest.grounding,
    actions: Object.hasOwn(rest, 'actions') ? null : Array.isArray(actionsJson) ? actionsJson.map(decode) : null,
  };
}

export function coachRepairInstruction(code: string): string {
  const instructions: Record<string, string> = {
    CHAT_RESPONSE_JSON_REQUIRED: 'Emite un único objeto JSON completo. Escapa comillas y saltos de línea dentro de strings; no uses Markdown, texto exterior ni documentos concatenados. Serializa también correctamente valueJson y cada actionsJson.',
    CHAT_RESPONSE_OBJECT_REQUIRED: 'La raíz debe ser un objeto con los campos del schema, nunca array, string ni null.',
    CHAT_ANSWER_INVALID: 'answer debe ser texto natural no vacío de hasta 16000 caracteres, sin tags ejecutables.',
    CHAT_GROUNDING_REVIEW_INVALID: 'Regenera la respuesta con el mismo contrato; la revisión factual anterior no pudo interpretarse.',
    CHAT_PROSE_UNGROUNDED: 'Revisa las afirmaciones factuales frente a FACTS y resultados de autoridad. Distingue hechos, hipótesis y propuestas; no afirmes cambios guardados ni recuperación no confirmados.',
  };
  return instructions[code] ?? 'Regenera un objeto completo conforme al mismo schema y conserva únicamente afirmaciones factuales sustentadas.';
}
