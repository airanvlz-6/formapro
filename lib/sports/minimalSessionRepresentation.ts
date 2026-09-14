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
  if (!object(value) || !Array.isArray(value.blocks) || !value.blocks.length)
    return fail('PROPOSAL_STRUCTURE_UNINTERPRETABLE');
  const p = structuredClone(value);
  if (p.stimulusId == null) p.stimulusId = '';
  if (typeof p.stimulusId !== 'string') return fail('PROPOSAL_STRUCTURE_UNINTERPRETABLE');
  if (!p.structureId) p.structureId = 'Sesión';
  if (typeof p.structureId !== 'string') return fail('PROPOSAL_STRUCTURE_UNINTERPRETABLE');
  p.schemaVersion = 2;
  const seen = new Set<string>();
  for (const b of p.blocks) {
    if (object(b) && !['warmup','main','cooldown'].includes(b.blockType)) { b.title = typeof b.blockType === 'string' ? b.blockType : 'Bloque principal'; b.blockType = 'main'; }
    if (!object(b) || !['warmup','main','cooldown'].includes(b.blockType)
      || !Array.isArray(b.movements) || !b.movements.length) return fail('BLOCK_STRUCTURE_UNINTERPRETABLE');
    seen.add(b.blockType);
    if (typeof b.formatDose === 'string') { b.formatInstruction = b.formatDose; delete b.formatDose; }
    if (object(b.formatDose)) for (const [key, value] of Object.entries(b.formatDose)) {
      if (!['durationSeconds','timeCapSeconds','rounds','intervalSeconds','workSeconds','restSeconds'].includes(key) || typeof value === 'string') {
        b.formatInstruction = [b.formatInstruction, typeof value === 'string' ? value : `${key}: ${JSON.stringify(value)}`].filter(Boolean).join(' · ');
        delete b.formatDose[key];
      }
    }
    for (const e of b.movements) {
      if (!object(e)) return fail('MOVEMENT_OBJECT_INVALID');
      if (e.prescription === undefined && (object(e.dose) || typeof e.dose === 'string')) { e.prescription = e.dose; delete e.dose; }
      if (typeof e.prescription === 'string' && e.prescription.trim()) e.prescription = { doseInstruction: e.prescription };
      if (!object(e.prescription)) return fail('MOVEMENT_PRESCRIPTION_SHAPE_INVALID');
      if (typeof e.prescription.intensity === 'string') {
        e.prescription.doseInstruction = [e.prescription.doseInstruction,e.prescription.intensity].filter(Boolean).join(' · ');
        delete e.prescription.intensity;
      }
      // A known explicit alternative is identity evidence; no fuzzy name matching.
      if ((typeof e.movementId !== 'string' || !e.movementId.trim()) && known(e.canonicalMovementId)) e.movementId = e.canonicalMovementId;
      if ((!e.movementId || typeof e.movementId !== 'string') && typeof e.name === 'string') e.movementId = e.name;
      if (typeof e.movementId !== 'string' || !e.movementId.trim()) return fail('MOVEMENT_IDENTITY_UNRESOLVED');
      if (object(e.variant) && e.variant.version === undefined) e.variant.version = 1;
      for (const key of ['tempo','perSide']) if (typeof e.prescription[key] === 'string') {
        e.prescription.doseInstruction = [e.prescription.doseInstruction, `${key}: ${e.prescription[key]}`].filter(Boolean).join(' · ');
        delete e.prescription[key];
      }
      const doseLabels: Record<string,string> = {sets:'Series',reps:'Repeticiones',durationSeconds:'Segundos',distanceMeters:'Metros',restSeconds:'Descanso'};
      for (const [key,value] of Object.entries(e.prescription)) if (!['sets','reps','durationSeconds','distanceMeters','restSeconds','intensity','tempo','perSide','doseInstruction','referenceNotice','unresolvedReferenceInstruction'].includes(key)
        && (typeof value === 'string' && value.trim() || typeof value === 'number' && Number.isFinite(value))) {
        e.prescription.doseInstruction = [e.prescription.doseInstruction, `${key}: ${value}`].filter(Boolean).join(' · ');
        delete e.prescription[key];
      }
      for (const [key,label] of Object.entries(doseLabels)) if (typeof e.prescription[key] === 'string') {
        const text = e.prescription[key];
        if (!text.trim()) return fail('EXECUTION_TEXT_INVALID');
        e.prescription.doseInstruction = [e.prescription.doseInstruction, `${label}: ${text}`].filter(Boolean).join(' · ');
        delete e.prescription[key];
      }
      if (e.prescription.doseInstruction !== undefined && (typeof e.prescription.doseInstruction !== 'string' || !e.prescription.doseInstruction.trim())) return fail('EXECUTION_TEXT_INVALID');
      const d = resolveExecutableDose(e.prescription);
      if (d.ok) e.prescription = d.dose; // Unresolved work is assessed by substantive validation.
    }
  }
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
      if (known(alternative) && known(e.movementId) && alternative !== e.movementId) errors.push('MOVEMENT_IDENTITY_CONFLICT');
      checkExtras(e.prescription, [...DOSE_FIELDS,'doseInstruction']);
      return { ...pick(e, ['movementId','variant']), prescription: pick(e.prescription, [...DOSE_FIELDS,'doseInstruction']) };
    }) };
  }) };
  return { projection, errors };
}
