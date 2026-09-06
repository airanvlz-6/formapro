import { canonicalDiscipline, type PrescriptionScope } from '../sports/prescriptionScope';
import { calendarDays, calendarKey } from './weeklyCalendar';

const CODE = 'CALENDAR_AVAILABILITY_UNRESOLVED';
// Stored keys can contain arbitrary user text. Only domain labels may reach logs.
const categories = new Set(['box', 'carrera', 'fuerza', 'pista', 'carrera_larga', 'carrera_series',
  'running', 'run', 'crossfit', 'funcional_crossfit', 'strength', 'otro', 'general', 'hibrido',
  'funcional', 'gimnasticos', 'intervalos', 'descanso', 'dias', 'disponibilidad', 'observaciones',
  'duracion_sesion', 'cambio_permanente', 'razon', 'descripcion']);
const label = (value: string) => categories.has(calendarKey(value)) ? calendarKey(value) : '[redacted_category]';
function reason(value: unknown) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (!Array.isArray(value)) return 'non_array';
  return value.some(v => typeof v !== 'string') ? 'non_string_member' : null;
}
function describe(value: unknown) {
  const isArray = Array.isArray(value);
  return { runtimeType: typeof value, isArray, isNull: value === null,
    ...(isArray ? { length: value.length } : {}), reason: reason(value),
    ...(isArray && value.every(v => typeof v === 'string' && calendarDays.includes(calendarKey(v)))
      ? { days: value.map(calendarKey) } : {}) };
}

/** Observability only: never changes the rejection, even if logging fails. */
export function weeklyAvailabilityFailure(distribution: Record<string, unknown>, discipline: string,
  scope: PrescriptionScope, sources: readonly { disciplina: string; dias?: unknown }[], value: unknown): Error {
  const error = new Error(CODE);
  try {
    const relevant = Object.entries(distribution).filter(([key]) => canonicalDiscipline(key) === discipline);
    const originReason = sources.length ? reason(value)
      : relevant.length ? relevant.map(([, days]) => reason(days)).find(Boolean) : 'missing';
    const diagnostic = { code: CODE, reason: originReason || 'unresolved_value',
      discipline: label(discipline), resolvedType: typeof value };
    Object.assign(error, { availabilityDiagnostic: diagnostic });
    console.warn('WEEKLY_AVAILABILITY_UNRESOLVED', {
      ...diagnostic,
      scope: { mode: scope.mode, managedDisciplines: scope.managedDisciplines.map(label) },
      rawCategories: Object.keys(distribution).map(label),
      relevantCategories: relevant.map(([category, days]) => ({ category: label(category), ...describe(days) })),
      explicitSources: sources.map(s => ({ category: label(s.disciplina), owner: 'forge', ...describe(s.dias) })),
      resolutionSource: sources.length ? 'explicit_sources' : 'distribution_aliases',
      canonicalCapabilityResult: { discipline: label(discipline), ...describe(value) },
    });
  } catch { /* Diagnostics must not replace or suppress the original fail-closed error. */ }
  return error;
}
