import { canonicalDiscipline } from './prescriptionScope';

/** Union every stored alias of a capability without changing source ownership.
 * Callers retain their existing storage-format parser and source precedence.
 * A malformed matching category must never be silently dropped.
 */
export function canonicalAvailability(distribution: Record<string, unknown>, discipline: string,
  parse: (value: unknown) => string[] | null): { found: boolean; days: string[] | null } {
  const entries = Object.entries(distribution).filter(([key]) => canonicalDiscipline(key) === canonicalDiscipline(discipline));
  if (!entries.length) return { found: false, days: null };
  const groups = entries.map(([, value]) => parse(value));
  if (groups.some(group => group === null)) return { found: true, days: null };
  return { found: true, days: [...new Set(groups.flatMap(group => group!))] };
}
