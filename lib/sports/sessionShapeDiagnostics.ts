import { MOVEMENT_LIBRARY } from './movementLibrary';
import { variantShapeFailures } from './movementVariants';
import { resolveDoseInstruction } from './sessionExecution';
import { safeViolations } from './builderDiagnostics';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const canonical = (v: unknown) => typeof v === 'string' && Object.hasOwn(MOVEMENT_LIBRARY, v) ? v : null;
const type = (v: unknown) => v === undefined ? 'absent' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
/** No raw instruction, arbitrary key, label, ID, or reference value crosses this boundary.
 * Unknown prose cannot be classified as hidden work or executable by a token heuristic. */
export function sessionShapeDiagnostic(entry: unknown, blockIndex: number, blockType: string, movementIndex: number, errors: string[]) {
  const e = object(entry) ? entry : {}, d = object(e.prescription) ? e.prescription : {};
  const v = object(e.variant) ? e.variant : {}, mods = object(v.modifiers) ? v.modifiers : {};
  const instruction = resolveDoseInstruction(d.doseInstruction);
  const instructionResolutionCode = errors.includes('DOSE_INSTRUCTION_REFERENCE_REQUIRED') ? 'OBJECTIVE_REFERENCE_UNRESOLVED'
    : d.doseInstruction === undefined ? 'ABSENT' : typeof d.doseInstruction !== 'string' || !d.doseInstruction.trim()
      || d.doseInstruction.length > 180 || /[\u0000-\u001f\u007f]/.test(d.doseInstruction) ? 'MALFORMED_OUTPUT'
    : errors.includes('DOSE_INSTRUCTION_CONFLICT') ? 'STRUCTURED_CONFLICT'
    : instruction ? 'RESOLVED' : 'UNRECOGNIZED_GRAMMAR';
  return {
    blockIndex, blockType, movementOrdinal: movementIndex + 1,
    proposalPath: `blocks[${blockIndex}].movements[${movementIndex}]`,
    canonicalMovementId: canonical(e.movementId) ?? canonical(v.canonicalFamily),
    generatedVariant: e.variant === undefined ? null : {
      family: canonical(v.canonicalFamily), version: v.version === 1 ? 1 : 'invalid',
      modifiers: Object.fromEntries(['tempo', 'stance', 'direction', 'loadPosition'].filter(k => Object.hasOwn(mods, k)).map(k => [k,
        k === 'tempo' ? Array.isArray(mods[k]) && mods[k].length === 4 && mods[k].every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 60) ? mods[k] : 'invalid'
          : ({ stance: ['narrow','wide'], direction: ['reverse'], loadPosition: ['contralateral'] } as Record<string, string[]>)[k]?.includes(mods[k]) ? mods[k] : 'invalid'])),
      failedFields: variantShapeFailures(e),
      semanticFailures: errors.filter(x => /^GENERATED_SEMANTICS_UNRESOLVED:(canonicalFamily|tempo|stance|direction|loadPosition)$/.test(x)),
      displayNamePresent: Object.hasOwn(v, 'displayName'),
    },
    doseShape: Object.fromEntries(Object.entries({ sets: 'sets', reps: 'reps', duration: 'durationSeconds', distance: 'distanceMeters', intensity: 'intensity', perSide: 'perSide', instruction: 'doseInstruction', rest: 'restSeconds', tempo: 'tempo' })
      .map(([label, key]) => [`${label}Present`, Object.hasOwn(d, key)])),
    instructionSummary: { type: type(d.doseInstruction), length: typeof d.doseInstruction === 'string' ? Math.min(d.doseInstruction.length, 64001) : null,
      resolvedFields: instruction ? Object.keys(instruction.fields) : [], qualitative: instruction?.qualitative ?? null, referenceKind: instruction?.reference?.kind ?? null },
    instructionResolutionCode, violationCodes: safeViolations(errors),
    repair: 'Correct the indicated movement and failed fields within the same contract. Use the typed variant recipe and its derived display name; unknown operations need a resolvable recipe. Express dose as quantities, supported effort or bounded qualitative sets; preserve matching structured fields. Objective numbers require compatible authorized references. Do not add another movement or facts in doseInstruction. Exercise selection remains yours.',
  };
}
export type SessionShapeDiagnostic = ReturnType<typeof sessionShapeDiagnostic>;
