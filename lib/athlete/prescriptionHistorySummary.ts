import { calendarDays, calendarKey, calendarState } from '../planning/weeklyCalendar';
import { resolveCompletionDate } from '../planning/recordCompletion';

const object = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 400) : null;
const lineagePrescription = (s: any) => s ? { tipo: s.tipo ?? null, titulo: text(s.titulo),
  descripcion: typeof s.descripcion === 'string' ? s.descripcion.slice(0, 1800) : null,
  duracion_min: s.duracion_min ?? null, structuredProposal: s.structuredPrescription?.proposal ?? null } : null;
/** Presentation of stored prescriptions, never a source of executed dose or exposure. */
export function prescriptionHistorySummary(plans: readonly unknown[], asOfDate: string) {
  return plans.flatMap(raw => {
    const p = object(raw), week = resolveCompletionDate(p.week_start);
    if (!week || week.weekStart !== p.week_start) return [];
    return (Array.isArray(p.sessions) ? p.sessions : []).flatMap((raw: unknown) => {
      const s = object(raw), index = calendarDays.indexOf(calendarKey(String(s.dia ?? '')));
      if (index < 0) return [];
      const date = new Date(Date.parse(week.date) + index * 86400000).toISOString().slice(0, 10);
      const stored = object(s.structuredPrescription), intent = object(object(stored.objective).intent);
      const state = calendarState(s), prescribed = ['TRAIN', 'RECOVERY'].includes(state)
        && !!(s.titulo || s.descripcion || stored.proposal);
      return [{ source: 'weekly_plan.sessions', date, day: calendarDays[index], sessionId: s.session_id ?? null,
        temporal: date < asOfDate ? 'PAST' : date === asOfDate ? 'TODAY' : 'FUTURE', state,
        factualState: s.completada === true ? 'EXECUTED' : prescribed ? 'PLANNED_ONLY' : 'NO_EXECUTION_RECORDED',
        prescription: { discipline: s.tipo ?? null, title: text(s.titulo), methodId: intent.methodId ?? null,
          structuredDose: stored.proposal?.schemaVersion === 2 ? structuredClone(stored.proposal.blocks) : null,
          adaptationId: intent.adaptationId ?? null, role: intent.role ?? null,
          stimulusId: stored.proposal?.stimulusId ?? s.stimulusId ?? null,
          durationMinutes: typeof s.duracion_min === 'number' ? s.duracion_min : null },
        execution: s.completada === true ? { title: text(s.titulo_real), description: text(s.descripcion_real),
          quantityStatus: 'NOT_INFERRED_FROM_PRESCRIPTION' } : null,
        modified: s.modificado ?? null, modificationReason: text(s.motivo_modificacion),
        ...(Array.isArray(s.chatPrescriptionHistory) ? { prescriptionLineage: {
          source: 'weekly_plan.sessions.chatPrescriptionHistory', semantics: 'PLANNED_NOT_PERFORMED',
          original: lineagePrescription(s.chatPrescriptionHistory[0]?.original),
          adaptations: s.chatPrescriptionHistory.slice(-8).map((h: any) => ({ id: h.id, source: h.source,
            createdAt: h.createdAt, reason: text(h.reason), adapted: lineagePrescription(h.adapted) })),
          truncated: s.chatPrescriptionHistory.length > 8 } } : {}),
        ...(Array.isArray(s.chatExecutionEvidence) ? { reportedExecution: {
          source: 'weekly_plan.sessions.chatExecutionEvidence', quantityStatus: 'NOT_INFERRED_FROM_PRESCRIPTION',
          observations: s.chatExecutionEvidence.slice(-16), truncated: s.chatExecutionEvidence.length > 16 } } : {}) }];
    });
  }).sort((a, b) => b.date.localeCompare(a.date));
}
