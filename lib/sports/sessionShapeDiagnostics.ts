import { movementShapeFailures, movementShapeRules, movementShapeSummary } from './sessionMovementShape';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { variantShapeFailures } from './movementVariants';
import { resolveDoseInstruction } from './sessionExecution';
import { safeViolations } from './builderDiagnostics';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const canonical = (v: unknown) => typeof v === 'string' && Object.hasOwn(MOVEMENT_LIBRARY, v) ? v : null;
const type = (v: unknown) => v === undefined ? 'absent' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
/** No raw instruction, arbitrary key, label, ID, or reference value crosses this boundary.
 * Unknown prose cannot be classified as hidden work or executable by a token heuristic. */
export function sessionShapeDiagnostic(entry: unknown, blockIndex: number, blockType: string, movementIndex: number, errors: string[], schema?: { modern: boolean; sourceSchema: unknown; schemaNormalized: boolean }) {
  const e = object(entry) ? entry : {}, d = object(e.prescription) ? e.prescription : {};
  const v = object(e.variant) ? e.variant : {}, mods = object(v.modifiers) ? v.modifiers : {};
  const instruction = resolveDoseInstruction(d.doseInstruction);
  const instructionResolutionCode = errors.includes('DOSE_INSTRUCTION_REFERENCE_REQUIRED') ? 'OBJECTIVE_REFERENCE_UNRESOLVED'
    : d.doseInstruction === undefined ? 'ABSENT' : typeof d.doseInstruction !== 'string' || !d.doseInstruction.trim()
      || d.doseInstruction.length > 180 || /[\u0000-\u001f\u007f]/.test(d.doseInstruction) ? 'MALFORMED_OUTPUT'
    : errors.includes('DOSE_INSTRUCTION_CONFLICT') ? 'STRUCTURED_CONFLICT'
    : instruction ? 'RESOLVED' : 'UNRECOGNIZED_GRAMMAR';
  const failedPredicates = errors.some(e => e.startsWith('MOVEMENT_SHAPE_INVALID:')) ? movementShapeFailures(entry, schema?.modern ?? true) : [];
  const repairs: string[] = failedPredicates.map(rule => movementShapeRules[rule]);
  if (errors.some(e => e.startsWith('GENERATED_'))) repairs.push('Repair the indicated typed variant fields and recipe name; no safety or reference claims.');
  if (errors.some(e => /^(DOSE_|EXECUTION_)/.test(e))) repairs.push('Repair the indicated prescription fields. Express a resolvable quantity, effort or bounded qualitative instruction for this movement only; structured fields must agree and objective references need authority.');
  if (errors.some(e => e.startsWith('DUPLICATE_MOVEMENT:'))) repairs.push('Use one entry per movement within this block; preserve explicit quantities.');
  return {
    failedPredicates,
    receivedShape: movementShapeSummary(entry),
    representation: { mode: schema?.modern === false ? 'legacy' : 'modern', sourceSchema: schema?.sourceSchema === 2 ? 2 : schema?.sourceSchema === undefined ? 'absent' : 'invalid', normalized: schema?.schemaNormalized ?? false },
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
    repair: repairs.join(' ') + ' Keep the same contract; exercise selection remains yours.',
  };
}
export type SessionShapeDiagnostic = ReturnType<typeof sessionShapeDiagnostic>;

/** Structural-only observation of the minimal representation rejection. Never retry input. */
export function prescriptionShapeDiagnostic(entry: Record<string, unknown>, received: unknown,
  blockIndex: number, blockType: unknown, movementIndex: number) {
  const fieldNames = new Set(['movementId','canonicalMovementId','id','name','variant','prescription','dose',
    'sets','reps','durationSeconds','distanceMeters','restSeconds','intensity','tempo','perSide','doseInstruction',
    'referenceNotice','unresolvedReferenceInstruction','kind','value','max','referenceId','role','rest','load','weight','kg',
    'duration','distance','description','instructions','exercise','exerciseId','repetitions','rounds']);
  const keys = (v: unknown) => object(v) ? Object.keys(v).slice(0, 32).map(k => fieldNames.has(k) ? k : '[redacted-key]') : [];
  const summary = (v: unknown) => ({ typeof: typeof v, isNull: v === null, isArray: Array.isArray(v),
    keys: keys(v), keyCount: object(v) ? Object.keys(v).length : 0,
    ...(Array.isArray(v) ? { length: v.length, itemTypes: v.slice(0, 8).map(type) } : {}),
    ...(typeof v === 'string' ? { length: v.length, blank: !v.trim() } : {}) });
  return {
    code: 'MOVEMENT_PRESCRIPTION_SHAPE_INVALID', stage: 'minimalSessionRepresentation',
    blockIndex, blockType: ['warmup','main','cooldown'].includes(String(blockType)) ? blockType : 'other', movementIndex,
    proposalPath: `blocks[${blockIndex}].movements[${movementIndex}].prescription`,
    expected: 'non_null_non_array_object',
    movementId: canonical(entry.movementId) ?? canonical(entry.canonicalMovementId),
    movementIdentity: { movementId: summary(entry.movementId), canonicalMovementId: summary(entry.canonicalMovementId),
      name: summary(entry.name), id: summary(entry.id) },
    parentKeys: keys(entry), parentKeyCount: Object.keys(entry).length,
    parentFieldTypes: Object.entries(entry).slice(0, 32).map(([key, value]) => ({ key: fieldNames.has(key) ? key : '[redacted-key]', type: type(value) })),
    originalPrescription: summary(entry.prescription), originalDose: summary(entry.dose), received: summary(received),
    limits: { keys: 32, arrayItems: 8, unknownKeys: 'redacted', freeTextIdentity: 'type_only' },
  };
}
export type PrescriptionShapeDiagnostic = ReturnType<typeof prescriptionShapeDiagnostic>;
