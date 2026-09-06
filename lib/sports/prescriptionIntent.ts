import { MOVEMENT_LIBRARY, type PatronMovimiento } from './movementLibrary';

export type PrescriptionIntent = { kind: 'stimulus_only' } | { kind: 'main_pattern'; pattern: PatronMovimiento };

// Runtime validation of the existing type, not aliases or a new taxonomy.
// Exhaustive Record keeps this validator aligned when PatronMovimiento changes.
const patterns: Record<PatronMovimiento, true> = {
  squat: true, hinge: true, horizontal_push: true, vertical_push: true, horizontal_pull: true, vertical_pull: true,
  olympic_lift: true, carry: true, run: true, jump: true, core_antirotacion: true, core_flexion: true,
  core_antiextension: true, locomotion: true, lunge: true, rotational: true, cyclic: true, inverted_locomotion: true,
};

/** Admission accepts exact structured values only. No text, aliases or case normalization. */
export function resolvePrescriptionIntent(value: unknown): { ok: true; intent: PrescriptionIntent } | { ok: false; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['INTENT_INVALID'] };
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (v.kind === 'stimulus_only' && keys.length === 1 && keys[0] === 'kind') return { ok: true, intent: { kind: 'stimulus_only' } };
  if (v.kind !== 'main_pattern' || keys.length !== 2 || !keys.includes('kind') || !keys.includes('pattern') || typeof v.pattern !== 'string')
    return { ok: false, errors: ['INTENT_INVALID'] };
  if (!Object.hasOwn(patterns, v.pattern)) return { ok: false, errors: ['INTENT_PATTERN_UNKNOWN'] };
  return { ok: true, intent: { kind: 'main_pattern', pattern: v.pattern as PatronMovimiento } };
}

/** Same exact metadata membership for feasibility and executed main-block validation.
 * Nonmatching IDs remain available as accessories; they cannot discharge the intent.
 */
export function intentMatchingMovementIds(intent: PrescriptionIntent, movementIds: readonly string[]): string[] {
  return movementIds.filter(id => Object.hasOwn(MOVEMENT_LIBRARY, id)
    && (intent.kind === 'stimulus_only' || MOVEMENT_LIBRARY[id].movement_pattern === intent.pattern));
}
