import type { WorkoutStructure } from './workoutStructureLibrary';

/** Only the format constraints already enforced by the structured-session validator. */
export function structureSemantics(structure: WorkoutStructure | undefined) {
  return {
    exactMainMovements: structure?.formato === 'couplet' ? 2 : structure?.formato === 'triplet' ? 3 : null,
    uninterrupted: !!structure && (structure.formato === 'continuous' || structure.id === 'continuo_carrera'),
  };
}

export function validateStructureSemantics(structure: WorkoutStructure | undefined,
  main: readonly { prescription: { sets?: number; restSeconds?: number } }[]): string[] {
  const rules = structureSemantics(structure);
  const errors: string[] = [];
  if (rules.exactMainMovements === 2 && main.length !== 2) errors.push('STRUCTURE_REQUIRES_TWO_MOVEMENTS');
  if (rules.exactMainMovements === 3 && main.length !== 3) errors.push('STRUCTURE_REQUIRES_THREE_MOVEMENTS');
  if (rules.uninterrupted && main.some(m => (m.prescription.sets ?? 1) > 1 || (m.prescription.restSeconds ?? 0) > 0)) errors.push('STRUCTURE_CONTINUOUS_INTERRUPTED');
  return errors;
}

/** Distinct IDs are required within a block, but may be reused across the three blocks.
 * Every existing dose/shape bound admits a positive minimal dose. Continuous formats
 * admit one set without rest; this checks existence without constructing a session.
 */
export function isStructureSatisfiable(structure: WorkoutStructure | undefined, movementIds: readonly string[]): boolean {
  if (!structure) return false;
  return new Set(movementIds).size >= (structureSemantics(structure).exactMainMovements ?? 1);
}
