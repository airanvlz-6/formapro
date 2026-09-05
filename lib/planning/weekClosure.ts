import type { LegacyPlanCandidate as PlanCandidate } from './planMutationTypes';

export const isWeekRest = (tipo: unknown): boolean => typeof tipo === 'string' && /descanso/i.test(tipo);
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const normalize = (day: string) => day.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function weeklyFacts(plan: PlanCandidate) {
  const required = plan.sessions.filter(s => !isWeekRest(s.tipo));
  const completed = required.filter(s => s.completada === true);
  const pending = required.filter(s => s.completada !== true);
  return { required, completed, pending, adherence: `${completed.length}/${required.length}`,
    percentage: required.length ? Math.round(completed.length / required.length * 100) : 0 };
}

/** Shared read-only projection for check_week_closure and close_week. Date/day are
 * resolved in Madrid by the caller. No LLM input or persistence belongs here. */
export function projectWeekClosure<T extends PlanCandidate>(plan: T, today: string) {
  if (!Array.isArray(plan.sessions) || plan.sessions.some(s => !s ||
    ['dia', 'tipo', 'titulo', 'descripcion'].some(k => typeof (s as unknown as Record<string, unknown>)[k] !== 'string'))) {
    throw new Error('INVALID_WEEK_SESSIONS');
  }
  const todayIndex = days.indexOf(normalize(today));
  if (todayIndex < 0) throw new Error('INVALID_CLOSURE_DAY');
  const normalizedDays = plan.sessions.map(s => normalize(s.dia));
  const changedIndices: number[] = [];
  const sessions = plan.sessions.map((s, index) => {
    if (!isWeekRest(s.tipo) || s.completada === true) return s;
    const dayIndex = days.indexOf(normalizedDays[index]);
    if (dayIndex < 0) throw new Error('UNKNOWN_REST_DAY');
    if (dayIndex >= todayIndex) return s;
    if (normalizedDays.filter(d => d === normalizedDays[index]).length !== 1) throw new Error('AMBIGUOUS_REST_DAY');
    changedIndices.push(index);
    return { ...s, completada: true };
  });
  const projectedPlan: T = { ...plan, sessions };
  const facts = weeklyFacts(projectedPlan);
  // Legacy product rule: Sunday itself permits closing an incomplete week.
  const eligible = todayIndex === 6 || (facts.required.length > 0 && facts.pending.length === 0);
  return { projectedPlan, changedIndices, eligible, facts };
}
