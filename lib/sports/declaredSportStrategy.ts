import type { GoalId } from './goalTransferModel';

/** Exact persisted selections, not ownership aliases or human goal descriptions.
 * Extend this domain catalog when another specialty has a compatible 3B family. */
const families: Readonly<Record<string, GoalId>> = {
  funcional_crossfit: 'crossfit', crossfit: 'crossfit', hibrido_hyrox: 'hyrox',
};
export function declaredSportStrategy(specialty: unknown): GoalId | null {
  return typeof specialty === 'string' && Object.hasOwn(families, specialty) ? families[specialty] : null;
}
/** Explicit general capability catalog. Delegated disciplines never select a primary sport. */
const generalFamilies: Readonly<Record<string, GoalId>> = { carrera: 'running_general' };
export function generalSportStrategy(specialty: unknown): GoalId | null {
  return typeof specialty === 'string' && Object.hasOwn(generalFamilies, specialty) ? generalFamilies[specialty] : null;
}
/** This questionnaire field is shared with triathlon. Only the running selection authorizes it. */
export function structuredEventStrategy(specialty: unknown, distance: unknown): GoalId | null {
  if (specialty !== 'carrera') return null;
  return distance === '10K' ? '10k' : distance === 'Media maratón (21K)' ? 'half_marathon' : null;
}
