import { canonicalDiscipline } from './prescriptionScope';
import { calendarDays, calendarKey } from '../planning/weeklyCalendar';

/** Persisted legacy writers used days.join(', '), including a scalar for one day.
 * Embedded JSON, prose, empty tokens and unknown weekdays are not that format.
 */
export function normalizeAvailabilityDays(value: unknown): string[] | null {
  const list = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(list) || !Array.from(list).every(day => typeof day === 'string')) return null;
  const days = list.map(calendarKey);
  return days.every(day => calendarDays.includes(day)) ? [...new Set(days)] : null;
}

/** Canonical capabilities are selected by existing scope, never by session titles. */
export function normalizeTrainingAvailability(distribution: Record<string, unknown>, disciplines: readonly string[]):
  { ok: true; availability: Record<string, string[]> } | { ok: false; discipline: string; reason: 'missing' | 'invalid' } {
  const availability: Record<string, string[]> = {};
  for (const discipline of disciplines) {
    const resolved = canonicalAvailability(distribution, discipline, normalizeAvailabilityDays);
    if (!resolved.found || resolved.days === null) return { ok: false, discipline, reason: resolved.found ? 'invalid' : 'missing' };
    availability[discipline] = resolved.days;
  }
  return { ok: true, availability };
}

/** Writer boundary: preserve category names/metadata, persist day categories as arrays.
 * Metadata-only descriptions cannot replace a structured calendar.
 */
export function normalizeAvailabilityForStorage(value: unknown): Record<string, unknown> | null {
  let input: unknown;
  try { input = typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const metadata = new Set(['observaciones', 'descripcion', 'duracion_sesion', 'cambio_permanente', 'razon']);
  const entries: [string, unknown][] = [];
  let dayCategories = 0;
  for (const [category, rawDays] of Object.entries(input)) {
    if (metadata.has(category)) { entries.push([category, rawDays]); continue; }
    const days = normalizeAvailabilityDays(rawDays);
    if (days === null) return null;
    entries.push([category, days]); dayCategories++;
  }
  return dayCategories ? Object.fromEntries(entries) : null;
}

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
