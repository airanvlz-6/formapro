/** Calendar safety, not a physiological load prescription. Availability is permission. */
export const calendarDays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export type CalendarState = 'TRAIN' | 'RECOVERY' | 'REST' | 'UNAVAILABLE';
export const calendarKey = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function calendarState(s: Record<string, any>): CalendarState {
  if (s.tipo === 'descanso') return 'REST';
  if (['external_blocked', 'sin_registrar', 'unavailable'].includes(s.tipo)) return 'UNAVAILABLE';
  if (s.stimulusId === 'recuperacion_activa' || (s.tipo === 'carrera' && s.titulo?.startsWith('recuperacion activa · '))) return 'RECOVERY';
  return 'TRAIN';
}
export function validateWeeklyCalendar(sessions: readonly Record<string, any>[], maxTrainingDays: number,
  allowed: Record<string, string[] | null>, protectedSlots?: { day: string; state: CalendarState; type: string }[]) {
  const errors: string[] = [];
  if (!Array.isArray(sessions) || sessions.length !== 7) return { ok: false, errors: ['CALENDAR_REQUIRES_SEVEN_DAYS'] };
  const slots = sessions.map(s => ({ day: typeof s.dia === 'string' ? calendarKey(s.dia) : '', state: calendarState(s), type: s.tipo }));
  if (new Set(slots.map(s => s.day)).size !== 7 || slots.some(s => !calendarDays.includes(s.day))) errors.push('CALENDAR_DAYS_INVALID');
  if (!Number.isInteger(maxTrainingDays) || maxTrainingDays < 0 || maxTrainingDays > 6) errors.push('CALENDAR_LIMIT_INVALID');
  if (slots.filter(s => s.state === 'TRAIN').length > maxTrainingDays) errors.push('CALENDAR_TRAINING_LIMIT');
  sessions.forEach((s, i) => {
    const slot = slots[i];
    if (slot.state === 'TRAIN' || slot.state === 'RECOVERY') {
      if (!['box', 'carrera'].includes(s.tipo)) errors.push('CALENDAR_DISCIPLINE_UNSUPPORTED');
      if (!Object.hasOwn(allowed, s.tipo)) errors.push('CALENDAR_DISCIPLINE_OUTSIDE_SCOPE');
      else if (allowed[s.tipo] !== null && !allowed[s.tipo]?.includes(slot.day)) errors.push('CALENDAR_DAY_UNAVAILABLE');
    }
    if (protectedSlots) {
      const before = protectedSlots.find(p => p.day === slot.day);
      if (!before || before.state !== slot.state || (['TRAIN', 'RECOVERY'].includes(slot.state) && before.type !== slot.type)) errors.push('CALENDAR_PROTECTED_DAY_CHANGED');
    }
  });
  return { ok: !errors.length, errors: [...new Set(errors)], slots };
}
