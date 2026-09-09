import { normalizeAvailabilityForStorage } from '../sports/trainingAvailability';
import { resolveProfileDisciplines } from '../sports/prescriptionScope';

/** Creation boundary only. Explicit generic days belong to the sole configured
 * discipline; counts, prose, mixed ownership and ambiguous profiles grant nothing.
 * This writes habitual availability, never a weekly confirmation. */
export function projectOnboardingAvailability(profile: {
  modo_entrada?: unknown; especialidad?: string; categoria?: string; distribucion_semanal?: unknown;
}): unknown {
  const original = profile.distribucion_semanal;
  if (!['planificacion', 'coach'].includes(String(profile.modo_entrada))) return original;
  const distribution = normalizeAvailabilityForStorage(original);
  if (!distribution || !Array.isArray(distribution.disponibilidad)) return original;
  const dayKeys = Object.keys(distribution).filter(key => Array.isArray(distribution[key]));
  if (dayKeys.length !== 1) return original;
  const disciplines = resolveProfileDisciplines(profile);
  if (disciplines.length !== 1) return original;
  const { disponibilidad, ...metadata } = distribution;
  const projected = { ...metadata, [disciplines[0]]: disponibilidad };
  return typeof original === 'string' ? JSON.stringify(projected) : projected;
}
