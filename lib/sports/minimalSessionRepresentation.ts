import type { StructuredSessionProposal, SessionValidation } from './structuredSession';
import { resolveExecutableDose } from './sessionExecution';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { DOSE_FIELDS } from './sessionDose';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const known = (v: unknown) => typeof v === 'string' && Object.hasOwn(MOVEMENT_LIBRARY, v);
const pick = (v: Record<string, any>, keys: readonly string[]) => Object.fromEntries(keys.filter(k => Object.hasOwn(v, k)).map(k => [k, v[k]]));

/** Extra representation is retained in the signed proposal but never rendered as work.
 * This function establishes traversal/identity/dose objects only. It grants no safety. */
export function minimalSessionRepresentation(value: unknown): SessionValidation {
  const fail = (code: string): SessionValidation => ({ ok: false, violations: [code] });
  if (!object(value) || !Array.isArray(value.blocks) || !value.blocks.length || value.blocks.length > 3
    || typeof value.stimulusId !== 'string' || !value.stimulusId || typeof value.structureId !== 'string' || !value.structureId)
    return fail('PROPOSAL_STRUCTURE_UNINTERPRETABLE');
  const p = structuredClone(value);
  p.schemaVersion = 2;
  const seen = new Set<string>();
  for (const b of p.blocks) {
    if (!object(b) || !['warmup','main','cooldown'].includes(b.blockType) || seen.has(b.blockType)
      || !Array.isArray(b.movements) || !b.movements.length || b.movements.length > 30) return fail('BLOCK_STRUCTURE_UNINTERPRETABLE');
    seen.add(b.blockType);
    for (const e of b.movements) {
      if (!object(e)) return fail('MOVEMENT_OBJECT_INVALID');
      if (!object(e.prescription)) return fail('MOVEMENT_PRESCRIPTION_SHAPE_INVALID');
      // A known explicit alternative is identity evidence; no fuzzy name matching.
      if ((!known(e.movementId) && !e.variant) && known(e.canonicalMovementId)) e.movementId = e.canonicalMovementId;
      if (typeof e.movementId !== 'string' || !e.movementId.trim()) return fail('MOVEMENT_IDENTITY_UNRESOLVED');
      if (object(e.variant) && e.variant.version === undefined) e.variant.version = 1;
      const d = resolveExecutableDose(e.prescription);
      if (d.ok) e.prescription = d.dose; // Unresolved work is assessed by substantive validation.
    }
  }
  if (!seen.has('main')) return fail('MAIN_STRUCTURE_REQUIRED');
  // Order is presentation, not a sporting decision. Existing valid order is unchanged.
  p.blocks.sort((a: any,b: any) => ['warmup','main','cooldown'].indexOf(a.blockType)-['warmup','main','cooldown'].indexOf(b.blockType));
  return { ok: true, proposal: p as StructuredSessionProposal };
}

/** Project only executable fields for validation/analytics. Original extras remain signed.
 * Simultaneous executable representations must not conceal conflicting or additional work. */
export function executableProjection(p: StructuredSessionProposal) {
  const errors: string[] = [];
  const ordered = (v: any): any => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])]))
    : Array.isArray(v) ? v.map(ordered) : v;
  const checkExtras = (v: Record<string, any>, core: string[]) => {
    for (const [k,x] of Object.entries(v)) if (!core.includes(k)) {
      const shadow = object(v.prescription) ? k === 'dose' ? v.prescription : k === 'rest' ? v.prescription.restSeconds
        : DOSE_FIELDS.includes(k as typeof DOSE_FIELDS[number]) ? v.prescription[k] : undefined : undefined;
      if (shadow !== undefined && JSON.stringify(ordered(x)) === JSON.stringify(ordered(shadow))) continue;
      if (k === 'kg' || k === 'dose' || k === 'intensity' || k === 'rest' || k === 'perSide' || DOSE_FIELDS.includes(k as typeof DOSE_FIELDS[number])
        || object(x) && ('movementId' in x || 'prescription' in x) || Array.isArray(x) && x.some(y => object(y) && ('movementId' in y || 'prescription' in y)))
        errors.push('HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION');
    }
  };
  checkExtras(p, ['schemaVersion','stimulusId','structureId','blocks','explanation']);
  const projection = { ...pick(p, ['schemaVersion','stimulusId','structureId']), blocks: p.blocks.map(b => {
    checkExtras(b, ['blockType','formatDose','movements']);
    return { ...pick(b, ['blockType','formatDose']), movements: b.movements.map(e => {
      checkExtras(e, ['movementId','variant','prescription','canonicalMovementId']);
      const alternative = (e as any).canonicalMovementId;
      if (known(alternative) && alternative !== e.movementId) errors.push('MOVEMENT_IDENTITY_CONFLICT');
      checkExtras(e.prescription, [...DOSE_FIELDS,'doseInstruction']);
      return { ...pick(e, ['movementId','variant']), prescription: pick(e.prescription, [...DOSE_FIELDS,'doseInstruction']) };
    }) };
  }) };
  return { projection, errors };
}
