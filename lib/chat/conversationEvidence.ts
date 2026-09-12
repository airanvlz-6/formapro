export function conversationOnly(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-15).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 12000) }));
}
/** Only the human channel may enter extraction. Assistant prose stays conversation, never evidence. */
export function userEvidenceText(raw: unknown) { return conversationOnly(raw).filter(m => m.role === 'user').map(m => m.content).join('\n\n'); }
/** Conversational memory is not an alternative writer for facts with dedicated authorities. */
export function conversationalMemoryOnly(extracted: Record<string, unknown>) {
  return { ...extracted, fin_bloque: null, objetivo_principal: null, distribucion_semanal: null,
    datos_entrenamiento: null, nueva_marca: null };
}
