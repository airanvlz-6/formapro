import { calendarDays, calendarKey } from '../planning/weeklyCalendar';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { weeklyDeclaration } from './weeklyAvailabilityDeclaration';

/** Explicit week choices followed by dated access restrictions, never a habitual availability write. */
export function availableDaysAtWeek(profile: any, week: string, days: readonly string[] | null, discipline?: string) {
  const declaration = weeklyDeclaration(profile, week);
  if (declaration && discipline) days = declaration.availability[discipline] ?? [];
  const blocked = calendarDays.filter((_, index) => profile?.prescription_access?.[
    new Date(Date.parse(week) + index * 86400000).toISOString().slice(0, 10)]?.availability === 'unavailable');
  return days === null ? null : days.filter(day => !blocked.includes(calendarKey(day)));
}
export function parseTemporaryAvailability(message: string, today: string) {
  const text = calendarKey(message).replace(/[.!]$/, '');
  const match = text.match(/^(esta semana|la proxima semana) (?:el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo) no (?:puedo|podre) entrenar$/);
  const week = resolveCompletionDate(today);
  if (!match || !week) return null;
  const date = new Date(Date.parse(week.weekStart) + (calendarDays.indexOf(match[2]) + (match[1] === 'la proxima semana' ? 7 : 0)) * 86400000).toISOString().slice(0, 10);
  return { kind: 'temporary_availability' as const, dates: [date], value: 'unavailable' as const, source: 'explicit_user_declaration' as const };
}
