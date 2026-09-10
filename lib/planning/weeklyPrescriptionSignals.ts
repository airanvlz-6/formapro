import { projectPrescriptionSignals } from '../athlete/prescriptionSignals';
import { calendarDays } from './weeklyCalendar';

/** Same projection as AthletePrescriptionContext, with the target civil date and
 * assignment. Confirmation is supplied by the canonical availability digest check.
 * No reads, material defaults, dose/reference inference or alternative intents. */
export function projectWeeklyPrescriptionSignals(profile: { perfil?: unknown; especialidad?: unknown },
  week: string, disciplines: readonly string[], allowed: Record<string, string[]>, availabilityConfirmed: boolean) {
  return Object.fromEntries(calendarDays.map((day, index) => {
    const date = new Date(Date.parse(week) + index * 86400000).toISOString().slice(0, 10);
    return [day, Object.fromEntries(disciplines.map(discipline => [discipline,
      projectPrescriptionSignals(profile.perfil, date, { date, assignedDiscipline: discipline,
        ...(availabilityConfirmed && allowed[discipline]?.includes(day) ? { confirmedAssignment: { date, discipline } } : {}) }, profile.especialidad),
    ]))];
  }));
}
