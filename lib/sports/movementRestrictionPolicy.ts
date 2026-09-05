import type { CanonicalNote } from '../athlete/getCanonicalRestrictions';
import { MOVEMENT_RESTRICTION_EVIDENCE, type BiomechanicalProperty, type Movimiento } from './movementLibrary';

export const RESTRICTION_FLAGS = {
  prohibits_impact: 'impact', prohibits_jump: 'jump', prohibits_axial_load: 'axial_load',
  prohibits_deep_flexion: 'deep_flexion', prohibits_overhead_load: 'overhead_load',
} as const satisfies Partial<Record<keyof CanonicalNote, BiomechanicalProperty>>;
export type RestrictionFlag = keyof typeof RESTRICTION_FLAGS;
export function activeRestrictionFlags(notes: readonly CanonicalNote[]): RestrictionFlag[] {
  return (Object.keys(RESTRICTION_FLAGS) as RestrictionFlag[]).filter(flag => notes.some(n => n[flag] === true));
}
export function movementRestrictionProperty(movement: Movimiento, property: BiomechanicalProperty): boolean | 'unknown' {
  const evidence = MOVEMENT_RESTRICTION_EVIDENCE[movement.id]?.properties[property];
  // Existing ordinal metadata can establish incompatibility, never negative evidence.
  if (property === 'impact' && ['medio', 'alto'].includes(movement.impact)) return true;
  if (property === 'axial_load' && movement.axial_load === 'alto') return true;
  return typeof evidence === 'boolean' ? evidence : 'unknown';
}
export function evaluateMovementRestrictions(movement: Movimiento, flags: readonly RestrictionFlag[]) {
  const incompatible: RestrictionFlag[] = [], unknown: RestrictionFlag[] = [];
  for (const flag of flags) {
    const property = movementRestrictionProperty(movement, RESTRICTION_FLAGS[flag]);
    if (property === true) incompatible.push(flag);
    else if (property === 'unknown') unknown.push(flag);
  }
  return { allowed: !incompatible.length && !unknown.length, incompatible, unknown };
}
