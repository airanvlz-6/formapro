const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const legacyDoseKeys = ['sets', 'reps', 'durationSeconds', 'distanceMeters', 'restSeconds'];
const modernDoseKeys = ['intensity', 'tempo', 'perSide', 'doseInstruction'];
export const movementShapeRules = {
  MOVEMENT_OBJECT_INVALID: 'Movement must be an object.',
  MOVEMENT_EXTRA_FIELD: 'Keep movementId and prescription at entry level (variant only for generated recipes). Do not hide extra work or facts in additional fields.',
  MOVEMENT_ID_MISSING: 'Supply movementId at entry level; id and canonicalMovementId are not identity aliases.',
  MOVEMENT_ID_TYPE_INVALID: 'movementId must be a nonempty string.',
  MOVEMENT_PRESCRIPTION_MISSING: 'Supply prescription at entry level; dose is not an alias.',
  MOVEMENT_PRESCRIPTION_SHAPE_INVALID: 'prescription must be an object with typed dose fields.',
  MOVEMENT_LEGACY_DOSE_FIELDS: 'This proposal selected the legacy schema. Modern dose fields require schemaVersion:2; keep intensity, restSeconds and perSide inside prescription.',
} as const;
export type MovementShapeRule = keyof typeof movementShapeRules;
/** This is the admission predicate itself, not a diagnostic approximation. */
export function movementShapeFailures(entry: unknown, modern: boolean): MovementShapeRule[] {
  if (!object(entry)) return ['MOVEMENT_OBJECT_INVALID'];
  const errors: MovementShapeRule[] = [];
  if (Object.keys(entry).some(k => !['movementId', 'prescription', ...(modern ? ['variant'] : [])].includes(k))) errors.push('MOVEMENT_EXTRA_FIELD');
  if (!Object.hasOwn(entry, 'movementId')) errors.push('MOVEMENT_ID_MISSING');
  else if (typeof entry.movementId !== 'string' || !entry.movementId) errors.push('MOVEMENT_ID_TYPE_INVALID');
  if (!Object.hasOwn(entry, 'prescription')) errors.push('MOVEMENT_PRESCRIPTION_MISSING');
  else if (!object(entry.prescription)) errors.push('MOVEMENT_PRESCRIPTION_SHAPE_INVALID');
  else if (!modern && Object.keys(entry.prescription).some(k => !legacyDoseKeys.includes(k))) errors.push('MOVEMENT_LEGACY_DOSE_FIELDS');
  return errors;
}

/** Promote only shapes that the old schema could not admit. Already valid historical
 * payloads retain their representation and render/receipt semantics. No explicit version
 * is overwritten, and no quantities, aliases, fields or athlete facts are inferred. */
export function needsModernSessionSchema(value: Record<string, unknown>): boolean {
  if (Object.hasOwn(value, 'schemaVersion') || !Array.isArray(value.blocks)) return false;
  return [1, 2].includes(value.blocks.length) || value.blocks.some(b => object(b) &&
    (Object.hasOwn(b, 'formatDose') || Array.isArray(b.movements) && b.movements.some(e => object(e) &&
      (Object.hasOwn(e, 'variant') || object(e.prescription) && modernDoseKeys.some(k => Object.hasOwn(e.prescription as object, k))))));
}

const safeType = (v: unknown) => v === undefined ? 'undefined' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
/** Known structural keys only; unknown names/values are never serialized. */
export function movementShapeSummary(entry: unknown) {
  const summarize = (value: unknown, known: string[]) => ({ type: safeType(value),
    fields: object(value) ? Object.fromEntries(known.filter(k => Object.hasOwn(value, k)).map(k => [k, safeType(value[k])])) : {},
    unknownFieldCount: object(value) ? Object.keys(value).filter(k => !known.includes(k)).length : 0 });
  const e = object(entry) ? entry : {};
  const doseFields = [...legacyDoseKeys, ...modernDoseKeys, 'role', 'rest', 'dose'];
  return { entry: summarize(entry, ['movementId','prescription','variant','id','canonicalMovementId','dose','intensity','rest','perSide','role','type']),
    prescription: summarize(e.prescription, doseFields), dose: summarize(e.dose, doseFields),
    intensity: summarize(object(e.prescription) ? e.prescription.intensity : undefined, ['kind','value','max','referenceId']) };
}
