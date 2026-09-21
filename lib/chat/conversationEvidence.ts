export function conversationOnly(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-15).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 12000),
      ...Object.fromEntries(['timestamp', 'createdAt', 'created_at'].filter(k => typeof m[k] === 'string').map(k => [k, m[k]])) }));
}
/** Only the human channel may enter extraction. Assistant prose stays conversation, never evidence. */
export function userEvidenceText(raw: unknown) { return conversationOnly(raw).filter(m => m.role === 'user').map(m => m.content).join('\n\n'); }
/** Conversational memory is not an alternative writer for facts with dedicated authorities. */
export function conversationalMemoryOnly(extracted: Record<string, unknown>) {
  return { ...extracted, fin_bloque: null, objetivo_principal: null, distribucion_semanal: null,
    datos_entrenamiento: null, nueva_marca: null };
}
/** Snapshot-local provenance, never a persistent message ID or an inferred date. */
export function contextualConversation(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).map((m, index) => ({ m, index }))
    .filter(({ m }) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-15).map(({ m, index }) => {
      // Preserve explicit metadata if present. Text embedded in content is not timestamp authority.
      const fields = ['timestamp', 'createdAt', 'created_at'] as const;
      const dates = fields.filter(k => typeof m[k] === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(m[k])
        && Number.isFinite(Date.parse(m[k])));
      const known = dates.length > 0 && new Set(dates.map(k => Date.parse(m[k]))).size === 1;
      return { role: m.role as 'user' | 'assistant', content: m.content.slice(0, 12000),
        provenance: { source: 'usuarios.historial' as const, index },
        temporal: known ? { status: 'KNOWN' as const, timestamp: m[dates[0]] as string, source: dates[0] }
          : { status: 'UNKNOWN' as const, timestamp: null, source: null } };
    });
}
