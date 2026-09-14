import { calendarDays, calendarKey } from '../planning/weeklyCalendar';

/** Human-language boundary only. Downstream authorities consume this value, never its text. */
export type WeeklyAvailabilityDeclaration = {
  version: 1; source: 'explicit_user_declaration'; availability: Record<string, string[]>;
  resolution: 'EXPLICIT_ZERO_TRAINING' | 'DECLARED_AVAILABILITY';
  excludedDisciplines: string[]; unavailableDays: string[]; unresolvedDays: string[];
};
const activity = /\b(box|crossfit|carrera|running|corro|correr|correre|pista|fuerza|gym|gimnasio|metcon)\b/g;
const dayPattern = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g;
const uncertain = /\b(quiza|quizas|creo|depende|tal vez|si puedo|no se|no estoy seguro|o)\b/;
const absence = /\b(no|nada|sin|cero|0|descanso|descansar|descansare)\b/;
const trainingAbsent = /\bno\s+(?:(?:voy|vamos)\s+a\s+|(?:quiero|puedo|podre|hare|realizare)\s+(?:ningun\s+)?)?(?:entreno|entrenar|entrenare|entrenamiento)\b|\b(?:sin|nada de)\s+(?:entrenar|entrenamiento)\b|\b(?:cero|0)\s+(?:dias?\s+(?:de\s+)?)?entrenamientos?\b/;
const canonicalActivity = (s: string, scope: readonly string[]) => /^(box|crossfit|metcon)$/.test(s) ? 'box'
  : /^(carrera|running|corro|correr|correre|pista)$/.test(s) ? 'carrera'
  : scope.includes('box') && !scope.includes('fuerza') ? 'box' : 'fuerza';

export function parseWeeklyAvailabilityDeclaration(value: unknown, scope: readonly string[], previous: Record<string, string[]> = {}): WeeklyAvailabilityDeclaration | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const text = calendarKey(value).replace(/^no\s*,\s*/, '').replace(/\bpero\b/g, '.')
    .replace(/,?\s+(?=(?:solo|solamente|unicamente)\b)/g, '. ');
  const availability: Record<string, string[]> = {}, excluded = new Set<string>(), unavailable = new Set<string>(), unresolved = new Set<string>();
  let defaultActivity: string | null = null, only: string | null = null, hasDays = false, explicitZero = false;
  // Commas between day lists are not clause boundaries. Commas introducing a
  // new activity/rest/uncertain clause are. Direction is inferred from event order.
  const clauses = text.split(/[.;\n]+|,(?=\s*(?:(?:creo|quiza|quizas|no|descanso)\b|(?:box|crossfit|carrera|running|corro|fuerza)\b|(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:descanso|no puedo|no entreno)\b))/).filter(s => s.trim());
  for (const clause of clauses) {
    const ds = [...clause.matchAll(dayPattern)].map(m => ({ value: m[0], index: m.index! }));
    const acts = [...clause.matchAll(activity)].map(m => ({ value: canonicalActivity(m[0], scope), index: m.index! }));
    if (uncertain.test(clause) || /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+a\s+/.test(clause)) {
      ds.forEach(d => unresolved.add(d.value)); continue;
    }
    if (absence.test(clause)) {
      if (ds.length) ds.forEach(d => unavailable.add(d.value));
      else acts.forEach(a => { excluded.add(a.value); availability[a.value] = []; });
      if (!ds.length && !acts.length && (trainingAbsent.test(clause)
        || !/\bno\b/.test(clause) && /\b(descanso|descansar|descansare)\b/.test(clause))) {
        explicitZero = true;
        scope.forEach(id => { excluded.add(id); availability[id] = []; });
      }
      continue;
    }
    if (/\b(solo|solamente|unicamente)\b/.test(clause) && acts.length === 1 && !ds.length) only = acts[0].value;
    if (!ds.length) { if (acts.length === 1) defaultActivity = acts[0].value; continue; }
    // A dangling conjunction or unsupported day alternative is not a confirmed assignment.
    if (/\by\s*$/.test(clause) || /\bfestivo\b/.test(clause)) { ds.forEach(d => unresolved.add(d.value)); continue; }
    const activityFirst = acts.length && acts[0].index < ds[0].index;
    for (const d of ds) {
      const selected = activityFirst ? acts.filter(a => a.index < d.index).at(-1) : acts.find(a => a.index > d.index);
      const discipline = selected?.value ?? (acts.length === 1 ? acts[0].value : defaultActivity);
      const flexible = !discipline && /\b(puedo|podre)\s+entrenar\b/.test(clause);
      if (!discipline && !flexible) { unresolved.add(d.value); continue; }
      hasDays = true;
      for (const id of discipline ? [discipline] : scope) (availability[id] ??= []).push(d.value);
    }
  }
  if (only) for (const id of scope) if (id !== only) { excluded.add(id); availability[id] = []; }
  if (explicitZero && hasDays) return null;
  if (!hasDays && !excluded.size && !unavailable.size) return null;
  // A partial exclusion can reuse known days, but missing habitual data is not
  // a declaration of zero for the remaining disciplines.
  if (!hasDays && !explicitZero && scope.some(id => !excluded.has(id) && !Object.hasOwn(previous, id))) return null;
  // An exclusion alone is a bounded edit; an enumerated week defines its days.
  for (const id of scope) availability[id] ??= hasDays ? [] : [...(previous[id] ?? [])];
  for (const [id, days] of Object.entries(availability)) availability[id] = excluded.has(id) ? []
    : calendarDays.filter(d => days.includes(d) && !unavailable.has(d) && !unresolved.has(d));
  // Empty by interpretation failure is never an explicit choice to rest.
  if (!Object.values(availability).some(days => days.length) && unresolved.size && !explicitZero) return null;
  return { version: 1, source: 'explicit_user_declaration', availability,
    resolution: !Object.values(availability).some(days => days.length) ? 'EXPLICIT_ZERO_TRAINING' : 'DECLARED_AVAILABILITY',
    excludedDisciplines: [...excluded], unavailableDays: [...unavailable], unresolvedDays: [...unresolved] };
}

export function weeklyDeclaration(profile: any, week: string): WeeklyAvailabilityDeclaration | null {
  const value = profile?.weekly_availability?.[week];
  if (value === undefined) return null;
  if (value?.version !== 1 || value.source !== 'explicit_user_declaration' || !value.availability || typeof value.availability !== 'object'
    || Array.isArray(value.availability) || !['EXPLICIT_ZERO_TRAINING', 'DECLARED_AVAILABILITY'].includes(value.resolution)
    || !['excludedDisciplines', 'unavailableDays', 'unresolvedDays'].every(k => Array.isArray(value[k]))
    || Object.values(value.availability).some(days => !Array.isArray(days) || days.some(d => !calendarDays.includes(d)))) throw new Error('UNRESOLVED_AVAILABILITY');
  if ((value.resolution === 'EXPLICIT_ZERO_TRAINING') !== !Object.values(value.availability).some((days: any) => days.length)) throw new Error('UNRESOLVED_AVAILABILITY');
  return value;
}
export function validAvailabilityWeek(week: unknown): week is string {
  return typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(Date.parse(week))
    && new Date(week).toISOString().slice(0, 10) === week && new Date(week).getUTCDay() === 1;
}
