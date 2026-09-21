/** Read-only selection. Ranking is textual relevance + recency, never sporting authority. */
export function projectChatLongitudinal(profile: any, history: any, message: string, today: string) {
  const terms = (s: string) => new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const query = terms(message);
  const entries: { source: string; kind: string; date: string | null; value: unknown }[] = [];
  for (const m of Array.isArray(profile.historial) ? profile.historial.slice(-15) : []) {
    if (!['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string') continue;
    entries.push({ source: `usuarios.historial.${m.role}`, kind: m.role === 'user' ? 'USER_REPORTED_EVIDENCE' : 'COACH_INTERPRETATION',
      date: null, value: m.content });
  }
  for (const w of Array.isArray(profile.workout_history) ? profile.workout_history.slice(-60) : []) {
    const date = typeof w?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(w.fecha) ? w.fecha.slice(0, 10) : null;
    if (date && date > today) continue;
    // Legacy records may have been extracted: keep storage provenance without declaring human verification.
    entries.push({ source: 'usuarios.workout_history', kind: 'LEGACY_RECORDED_EVIDENCE', date, value: w });
  }
  for (const w of history?.completedSessions ?? []) entries.push({ source: 'weekly_plan.sessions',
    kind: 'RECORDED_EXECUTION', date: w.date ?? null, value: w });
  const ranked = entries.map((entry, index) => ({ entry, index,
    score: [...terms(JSON.stringify(entry.value))].filter(t => query.has(t)).length }));
  // Always retain recent conversational turns (including short follow-ups with no lexical match).
  const recent = ranked.filter(r => r.entry.source.startsWith('usuarios.historial')).slice(-6);
  const selected = [...recent, ...ranked.sort((a, b) => b.score - a.score || (b.entry.date ?? '').localeCompare(a.entry.date ?? '') || b.index - a.index)]
    .filter((r, i, all) => all.findIndex(other => other.index === r.index) === i).slice(0, 18);
  return { semantics: 'READ_ONLY_CONTEXT_NOT_STATE_OR_CLINICAL_RESOLUTION', limits: { entries: 18, charactersPerEntry: 1800 },
    total: entries.length, truncated: entries.length > selected.length,
    entries: selected.map(({ entry }) => { const text = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
      return { ...entry, value: text.slice(0, 1800), truncated: text.length > 1800 }; }),
    limitations: ['missing_dates_remain_unknown', 'assistant_is_not_human_evidence', 'legacy_records_are_not_verified_reports',
      'bounded_available_history_not_complete_memory', 'same_exposure_may_occur_in_multiple_sources_do_not_sum'] };
}

/** Keep receipts, full contract copies and old adaptation chains out of the LLM prompt. */
export function projectChatPlanSession(s: any) {
  const pickText = (value: unknown) => typeof value === 'string' ? value.slice(0, 1800) : value ?? null;
  return { session_id: s.session_id, dia: s.dia, tipo: s.tipo, owner: s.owner ?? null, completada: s.completada === true,
    titulo: pickText(s.titulo), descripcion: pickText(s.descripcion), por_que: pickText(s.por_que), duracion_min: s.duracion_min ?? null,
    titulo_real: pickText(s.titulo_real), descripcion_real: pickText(s.descripcion_real),
    proposal: s.structuredPrescription?.proposal ?? null,
    currentPrescriptionId: s.chatPrescriptionHistory?.at(-1)?.id ?? s.session_id,
    originalPrescription: s.chatPrescriptionHistory?.length ? {
      titulo: pickText(s.chatPrescriptionHistory[0].original?.titulo), tipo: s.chatPrescriptionHistory[0].original?.tipo,
      descripcion: pickText(s.chatPrescriptionHistory[0].original?.descripcion) } : null,
    reportedExecution: Array.isArray(s.chatExecutionEvidence) ? s.chatExecutionEvidence.slice(-8) : [],
    projection: { textLimit: 1800, executionLimit: 8, fullStoredContractOmitted: true } };
}
