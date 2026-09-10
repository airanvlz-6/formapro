import { issueRunningHabitualConfirmation, type RunningHabitualInteraction } from './runningHabitualConfirmation';
export const habitualRunningFields = ['habitualEasyRunningDurationMinutes', 'habitualRunningSessionsPerWeek'] as const;
export type HabitualRunningField = typeof habitualRunningFields[number];
export type HabitualRunningDeclaration = { field: HabitualRunningField; authority: 'DECLARED';
  status: 'AVAILABLE' | 'NO_HABITUAL_EASY_RUN'; value: number | null; unit: 'minutes' | 'sessions_per_week';
  semantics: 'HABITUAL_EASY_RUN_DURATION' | 'HABITUAL_RUNNING_FREQUENCY';
  source: string; confirmedAt: string | null; freshness: 'UNKNOWN' };
const row = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function parseHabitualRunningAnswer(field: HabitualRunningField, answer: unknown): number | 'NO_HABITUAL_EASY_RUN' {
  if (!habitualRunningFields.includes(field)) throw new Error('RUNNING_HABITUAL_FIELD_INVALID');
  if (field === 'habitualEasyRunningDurationMinutes' && ['NO_HABITUAL_EASY_RUN', 'No tengo un rodaje fácil habitual'].includes(String(answer))) return 'NO_HABITUAL_EASY_RUN';
  const text = typeof answer === 'string' ? answer.trim() : '';
  const parsed = typeof answer === 'number' ? answer : /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < (field === 'habitualRunningSessionsPerWeek' ? 0 : 1)) throw new Error('RUNNING_HABITUAL_VALUE_INVALID');
  return parsed;
}
export function habitualRunningFact(field: HabitualRunningField, value: number | 'NO_HABITUAL_EASY_RUN', confirmedAt: string | null): HabitualRunningDeclaration {
  const parsed = parseHabitualRunningAnswer(field, value);
  return { field, authority: 'DECLARED', status: parsed === 'NO_HABITUAL_EASY_RUN' ? parsed : 'AVAILABLE',
    value: typeof parsed === 'number' ? parsed : null, unit: field === 'habitualEasyRunningDurationMinutes' ? 'minutes' : 'sessions_per_week',
    semantics: field === 'habitualEasyRunningDurationMinutes' ? 'HABITUAL_EASY_RUN_DURATION' : 'HABITUAL_RUNNING_FREQUENCY',
    source: `usuarios.perfil.runningHabitualDeclarations.${field}`, confirmedAt, freshness: 'UNKNOWN' };
}
export function projectHabitualRunningDeclarations(profile: unknown): HabitualRunningDeclaration[] {
  const stored = row(row(profile).runningHabitualDeclarations);
  return habitualRunningFields.flatMap(field => {
    const d = row(stored[field]);
    if (!Object.keys(d).length) return [];
    try {
      if (d.confirmedAt !== null && (typeof d.confirmedAt !== 'string' || !Number.isFinite(Date.parse(d.confirmedAt)))) return [];
      const fact = habitualRunningFact(field, d.status === 'NO_HABITUAL_EASY_RUN' ? 'NO_HABITUAL_EASY_RUN' : d.value as number, d.confirmedAt as string | null);
      return d.authority === fact.authority && d.status === fact.status && d.unit === fact.unit && d.semantics === fact.semantics
        && d.source === fact.source && d.value === fact.value ? [fact] : [];
    } catch { return []; }
  });
}
/** Validate canonical declarations again at the factual boundary; never accept raw prose. */
export function normalizeHabitualRunningFacts(input: readonly HabitualRunningDeclaration[]) {
  const valid = input.flatMap(d => projectHabitualRunningDeclarations({ runningHabitualDeclarations: { [d.field]: d } }));
  const facts = [...new Map(valid.map(d => [JSON.stringify(d), d])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const conflicts = habitualRunningFields.filter(field => new Set(facts.filter(d => d.field === field).map(d => JSON.stringify([d.status, d.value]))).size > 1);
  if (facts.some(d => d.field === 'habitualEasyRunningDurationMinutes' && d.status === 'AVAILABLE')
    && facts.some(d => d.field === 'habitualRunningSessionsPerWeek' && d.value === 0)) conflicts.push('habitualRunningSessionsPerWeek');
  return { facts, conflicts: [...new Set(conflicts)] };
}
export function habitualRunningRequirement(facts: readonly HabitualRunningDeclaration[]) {
  const field = habitualRunningFields.find(f => !facts.some(d => d.field === f));
  if (!field) return null;
  return { field, text: field === 'habitualEasyRunningDurationMinutes'
    ? 'En tu rutina actual, ¿cuántos minutos sueles correr a ritmo fácil o conversacional en una salida normal? Responde con un número entero o «No tengo un rodaje fácil habitual».'
    : '¿Cuántas veces por semana estás corriendo habitualmente ahora? Responde con un número entero; cero significa que actualmente no corres habitualmente.',
    unit: field === 'habitualEasyRunningDurationMinutes' ? 'minutes' : 'sessions_per_week' };
}
/** Dedicated profile fact capture using the existing chat identity boundary. Overwrite current field, not history, averaging or execution. */
export type HabitualRunningProfileStore = { from(table: 'usuarios'): {
  select(columns: 'perfil'): { eq(column: 'codigo', user: string): { single(): PromiseLike<{ data: { perfil: unknown } | null; error: unknown }> } };
  update(value: { perfil: Record<string, unknown> }): { eq(column: 'codigo', user: string): PromiseLike<{ error: unknown }> };
} };
export async function saveHabitualRunningAnswer(db: HabitualRunningProfileStore, user: string, field: HabitualRunningField, answer: unknown, confirmedAt = new Date().toISOString(), interaction?: RunningHabitualInteraction, expectedDurationMinutes?: unknown) {
  if (typeof user !== 'string' || !user.trim()) throw new Error('RUNNING_HABITUAL_USER_REQUIRED');
  const reconfirm = field === 'habitualEasyRunningDurationMinutes' && answer === 'CONFIRMAR';
  const value = reconfirm ? null : parseHabitualRunningAnswer(field, answer);
  if (!Number.isFinite(Date.parse(confirmedAt))) throw new Error('RUNNING_HABITUAL_DATE_INVALID');
  const current = await db.from('usuarios').select('perfil').eq('codigo', user).single();
  if (current.error || !current.data) throw new Error('RUNNING_HABITUAL_READ_FAILED');
  const profile = row(current.data.perfil), stored = row(profile.runningHabitualDeclarations);
  const previous = projectHabitualRunningDeclarations(profile).find(d => d.field === field);
  if (reconfirm && (!interaction || previous?.status !== 'AVAILABLE' || expectedDurationMinutes !== previous.value)) throw new Error('RUNNING_RECONFIRMATION_INVALID');
  const fact = habitualRunningFact(field, reconfirm ? previous!.value! : value!, confirmedAt);
  const selected = !interaction && previous?.status === fact.status && previous.value === fact.value ? previous : fact;
  const next = { ...profile, runningHabitualDeclarations: { ...stored, [field]: selected } };
  if (interaction && field === 'habitualEasyRunningDurationMinutes')
    Object.assign(next, {runningHabitualConfirmation:issueRunningHabitualConfirmation(user,interaction,selected)});
  const saved = await db.from('usuarios').update({ perfil: next }).eq('codigo', user);
  if (saved.error) throw new Error('RUNNING_HABITUAL_SAVE_FAILED');
  return { ok: true, requirement: interaction ? null : habitualRunningRequirement(projectHabitualRunningDeclarations(next)),
    message: interaction ? 'Rodaje habitual confirmado para esta planificación. Comprobaré la dosis, intensidad y tiempo disponibles.' : 'Declaración guardada. Describe tu rutina; requiere confirmación para usarla en una planificación.' };
}
