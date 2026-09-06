import { validateStructureSemantics } from './structureSemantics';
import { validateAllowedTrainingContract, type AllowedTrainingContract } from './allowedTrainingContract';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { activeRestrictionFlags, evaluateMovementRestrictions } from './movementRestrictionPolicy';
import { normalizeTrainingKey } from './prescriptionScope';

export type MovementDose = { sets?: number; reps?: number; durationSeconds?: number; distanceMeters?: number; restSeconds?: number };
export type StructuredSessionProposal = {
  stimulusId: string;
  structureId: string;
  blocks: { blockType: 'warmup' | 'main' | 'cooldown'; movements: { movementId: string; prescription: MovementDose }[] }[];
  explanation?: string;
};
export type SessionValidation = { ok: true; proposal: StructuredSessionProposal } | { ok: false; violations: string[] };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const doseKeys = ['sets', 'reps', 'durationSeconds', 'distanceMeters', 'restSeconds'];
/** GENERATION_SAFETY_BOUND: representation sanity only, not optimal or clinical dosing.
 * Canonical duration ranges are typical, not authorized maxima. Do not reinterpret them. */
export const GENERATION_SAFETY_BOUNDS: Record<string, number> = {
  sets: 100, reps: 1000, durationSeconds: 28800, distanceMeters: 100000, restSeconds: 3600,
};

/** No extraction from prose, ID repair, aliases, fuzzy matching or extra executable fields. */
export function checkSessionShape(value: unknown): SessionValidation {
  const violations: string[] = [];
  if (!object(value) || !keys(value, ['stimulusId', 'structureId', 'blocks', 'explanation'])
    || !['stimulusId', 'structureId', 'blocks'].every(k => Object.hasOwn(value, k))
    || typeof value.stimulusId !== 'string' || !value.stimulusId || typeof value.structureId !== 'string' || !value.structureId
    || (value.explanation !== undefined && (typeof value.explanation !== 'string' || value.explanation.length > 2000))
    || !Array.isArray(value.blocks) || value.blocks.length !== 3) return { ok: false, violations: ['PROPOSAL_SHAPE_INVALID'] };
  const blockTypes = ['warmup', 'main', 'cooldown'];
  value.blocks.forEach((block: unknown, index: number) => {
    if (!object(block) || !keys(block, ['blockType', 'movements']) || block.blockType !== blockTypes[index]
      || !['blockType', 'movements'].every(k => Object.hasOwn(block, k))
      || !Array.isArray(block.movements) || !block.movements.length || block.movements.length > 30) {
      violations.push(`BLOCK_INVALID:${index}`); return;
    }
    const seen = new Set<string>();
    block.movements.forEach((entry: unknown) => {
      if (!object(entry) || !keys(entry, ['movementId', 'prescription']) || typeof entry.movementId !== 'string' || !entry.movementId
        || !['movementId', 'prescription'].every(k => Object.hasOwn(entry, k))
        || !object(entry.prescription) || !keys(entry.prescription, doseKeys)) { violations.push(`MOVEMENT_SHAPE_INVALID:${index}`); return; }
      if (seen.has(entry.movementId)) violations.push(`DUPLICATE_MOVEMENT:${index}:${entry.movementId}`);
      seen.add(entry.movementId);
      const dose = entry.prescription;
      if (!['reps', 'durationSeconds', 'distanceMeters'].some(k => Object.hasOwn(dose, k))) violations.push('DOSE_REQUIRED');
      for (const [k, n] of Object.entries(dose)) {
        if (typeof n !== 'number' || !Number.isFinite(n) || (k === 'restSeconds' ? n < 0 : n <= 0)
          || (['sets', 'reps'].includes(k) && !Number.isSafeInteger(n))) violations.push(`DOSE_INVALID:${k}`);
        else if (n > GENERATION_SAFETY_BOUNDS[k]) violations.push(`DOSE_SAFETY_BOUND:${k}`);
      }
      const sets = typeof dose.sets === 'number' ? dose.sets : 1;
      if (typeof dose.reps === 'number' && sets * dose.reps > 10000) violations.push('DOSE_TOTAL_REPS_BOUND');
      if (typeof dose.durationSeconds === 'number' && sets * dose.durationSeconds > 28800) violations.push('DOSE_TOTAL_DURATION_BOUND');
      if (typeof dose.distanceMeters === 'number' && sets * dose.distanceMeters > 100000) violations.push('DOSE_TOTAL_DISTANCE_BOUND');
    });
  });
  if (!violations.length) {
    const entries = (value as StructuredSessionProposal).blocks.flatMap(b => b.movements);
    for (const [field, max] of [['reps', 10000], ['durationSeconds', 28800], ['distanceMeters', 100000]] as const) {
      if (entries.reduce((sum, m) => sum + (m.prescription.sets ?? 1) * (m.prescription[field] ?? 0), 0) > max)
        violations.push(`DOSE_SESSION_TOTAL_BOUND:${field}`);
    }
  }
  return violations.length ? { ok: false, violations } : { ok: true, proposal: value as StructuredSessionProposal };
}

export function parseStructuredSession(raw: unknown): SessionValidation {
  if (typeof raw !== 'string' || raw.length > 64000) return { ok: false, violations: ['JSON_REQUIRED'] };
  let text = raw.trim();
  // Only a complete enclosing JSON fence is trivial syntax; surrounding prose is never searched.
  if (text.startsWith('```json\n') && text.endsWith('\n```')) text = text.slice(8, -4).trim();
  try { return checkSessionShape(JSON.parse(text)); }
  catch { return { ok: false, violations: ['JSON_INVALID'] }; }
}

export function validateSessionAgainstTrainingContract(contract: AllowedTrainingContract, value: unknown): SessionValidation {
  const checked = checkSessionShape(value);
  if (!checked.ok) return checked;
  const authority = validateAllowedTrainingContract(contract);
  if (!authority.ok) return { ok: false, violations: authority.errors.map(e => `CONTRACT:${e}`) };
  const p = checked.proposal;
  const violations: string[] = [];
  if (p.stimulusId !== contract.stimulusId) violations.push('STIMULUS_MISMATCH');
  const structure = Object.hasOwn(WORKOUT_STRUCTURE_LIBRARY, p.structureId) ? WORKOUT_STRUCTURE_LIBRARY[p.structureId] : undefined;
  if (!structure || !contract.allowedStructureIds.includes(p.structureId) || structure.discipline !== contract.discipline) violations.push('STRUCTURE_NOT_ALLOWED');
  const main = p.blocks[1].movements;
  violations.push(...validateStructureSemantics(structure, main));
  const restrictions = contract.restrictionsSnapshot;
  const notes = [...restrictions.restrictions, ...restrictions.reassessments];
  const flags = activeRestrictionFlags(notes);
  for (const block of p.blocks) for (const entry of block.movements) {
    const m = Object.hasOwn(MOVEMENT_LIBRARY, entry.movementId) ? MOVEMENT_LIBRARY[entry.movementId] : undefined;
    if (!m) { violations.push(`MOVEMENT_UNKNOWN:${entry.movementId}`); continue; }
    if (!contract.allowedMovementIds.includes(m.id)) violations.push(`MOVEMENT_OUTSIDE_POOL:${m.id}`);
    if (!m.discipline.includes(contract.discipline as 'box' | 'carrera' | 'fuerza')) violations.push(`MOVEMENT_DISCIPLINE:${m.id}`);
    if (!evaluateMovementRestrictions(m, flags).allowed || restrictions.areas.some(a => m.avoid_with?.includes(a))
      || notes.some(n => normalizeTrainingKey(n.movement) === m.id)) violations.push(`MOVEMENT_RESTRICTED:${m.id}`);
  }
  return violations.length ? { ok: false, violations } : checked;
}

const label = (id: string) => id.replaceAll('_', ' ');
/** Rendering revalidates; untrusted explanation is deliberately not executable or persisted. */
export function renderContractSession(contract: AllowedTrainingContract, proposal: StructuredSessionProposal) {
  const validation = validateSessionAgainstTrainingContract(contract, proposal);
  if (!validation.ok) throw new Error(`SESSION_CONTRACT_INVALID:${validation.violations.join(',')}`);
  const headings = { warmup: 'Calentamiento', main: 'Bloque principal', cooldown: 'Vuelta a la calma' };
  const units: Record<string, string> = { sets: 'series', reps: 'repeticiones', durationSeconds: 'segundos', distanceMeters: 'metros', restSeconds: 'segundos de descanso' };
  return { dia: contract.targetDay, tipo: contract.discipline, titulo: `${label(proposal.stimulusId)} · ${label(proposal.structureId)}`,
    por_que: `Estímulo programado: ${label(contract.stimulusId)}.`, debilidad_relacionada: null,
    descripcion: `Estructura: ${label(proposal.structureId)}\n\n` + proposal.blocks.map(b => `**${headings[b.blockType]}**\n` + b.movements.map(m =>
      `- ${label(m.movementId)}: ${doseKeys.filter(k => Object.hasOwn(m.prescription, k)).map(k => `${m.prescription[k as keyof MovementDose]} ${units[k]}`).join(', ')}`).join('\n')).join('\n\n') };
}

export const STRUCTURED_SESSION_INSTRUCTIONS = `Devuelve SOLO un objeto JSON con stimulusId, structureId y blocks.
blocks son exactamente warmup, main, cooldown, en ese orden; cada bloque tiene blockType y movements no vacío.
Cada movimiento contiene exclusivamente movementId y prescription. prescription contiene números positivos: sets/reps enteros,
durationSeconds, distanceMeters; restSeconds puede ser cero. Debe haber reps, durationSeconds o distanceMeters.
No repetir un movementId dentro de un bloque. Puedes repetirlo en otro bloque.
No variantId, substitutionId, nombres libres, carga, intensidad ni texto deportivo adicional. explanation es opcional y no se renderiza.
Usa exactamente el stimulusId del contrato y structureId dentro de allowedStructureIds.
Do not output movement IDs outside this set: contract.allowedMovementIds. Esto incluye calentamiento y vuelta a la calma.
Límites de representación GENERATION_SAFETY_BOUND (no objetivos de entrenamiento): sets <=100, reps <=1000, durationSeconds <=28800, distanceMeters <=100000, restSeconds <=3600; sets*reps <=10000, sets*durationSeconds <=28800, sets*distanceMeters <=100000. Un formato continuo no admite series repetidas ni pausas en el bloque principal.
rankedCandidates son preferencias, no límites. Contexto externo es solo lectura. No reinterpretar restricciones.
Las duraciones típicas de la biblioteca NO son límites clínicos ni rangos autorizados de dosis.`;
