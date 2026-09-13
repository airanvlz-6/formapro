import { calendarDays, calendarKey } from './weeklyCalendar';
import { buildStructuredExposureReport } from '../sports/exposureEngine';
import { plannedPrescriptionLoad } from '../trainingLoad/prescriptionLoadAdapter';
import { resolvedMovement } from '../sports/movementVariants';

/** Callers authenticate rows first. No planned row enters historical completed exposure. */
export function currentWeekCoachingContext(week: string, rows: readonly any[], slots: readonly any[]) {
  const sessions = rows.map(row => {
    const day = calendarKey(row.dia), order = calendarDays.indexOf(day);
    const date = new Date(Date.parse(week) + order * 86400000).toISOString().slice(0, 10);
    const stored = row.structuredPrescription, proposal = stored?.proposal;
    const movements = (proposal?.blocks ?? []).flatMap((b: any) => b.movements.map((m: any) => {
      const resolved = resolvedMovement(m);
      return { identity: resolved?.identity ?? m.movementId, canonicalFamily: resolved?.canonicalFamily ?? null,
        pattern: resolved?.descriptor.movement_pattern ?? null, block: b.blockType, dose: m.prescription, doseProvenance: 'PRESCRIBED_NOT_MEASURED' };
    }));
    return { day, date, order, provenance: row.completada === true ? 'HISTORICAL_COMPLETED' : 'PLANNED_CURRENT_WEEK',
      modality: row.tipo, intent: stored?.objective?.intent ?? slots.find(s => s.day === day)?.intent ?? null,
      structure: proposal?.structureId ?? null, movements, proposal: proposal ?? null };
  }).sort((a, b) => a.order - b.order);
  const planned = rows.filter(row => row.completada !== true);
  const exposure = buildStructuredExposureReport(planned.flatMap(row => {
    const day = calendarKey(row.dia), date = new Date(Date.parse(week) + calendarDays.indexOf(day) * 86400000).toISOString().slice(0, 10);
    return plannedPrescriptionLoad(row, date, day).segments.flatMap(segment => segment.input.movementId ? [{
      sessionId: day, movementId: segment.input.movementId,
      ...((segment.input.formatContext as any)?.variant ? { variant: (segment.input.formatContext as any).variant } : {}),
      repetitions: segment.vector.repetitions.status === 'complete' ? segment.vector.repetitions.minimum : null,
    }] : []);
  }));
  return { version: 1, weekStart: week, semantics: 'ADVISORY_NOT_EXECUTED',
    weeklyIntents: slots.map(s => ({ day: s.day, state: s.state, discipline: s.discipline ?? null, intent: s.intent ?? null })),
    sessions, plannedExposure: { provenance: 'PLANNED_CURRENT_WEEK', ...exposure } };
}
