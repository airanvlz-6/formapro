import type { CanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY, rankearCandidatos } from './movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY, STRUCTURES_BY_STIMULUS } from './workoutStructureLibrary';
import type { ExposureReport } from './exposureEngine';
import { normalizeTrainingKey, validatePrescriptionScope, type PrescriptionScope } from './prescriptionScope';
import { activeRestrictionFlags, evaluateMovementRestrictions, type RestrictionFlag } from './movementRestrictionPolicy';

export { STRUCTURES_BY_STIMULUS } from './workoutStructureLibrary';
export type StimulusResolution = { status: 'resolved'; stimulusId: string } | { status: 'unresolved'; reason: string };
export function resolveTrainingStimulus(discipline: string, value: unknown): StimulusResolution {
  if (typeof value !== 'string' || !value.trim()) return { status: 'unresolved', reason: 'STIMULUS_UNRESOLVED' };
  const id = normalizeTrainingKey(value);
  const stimulus = Object.hasOwn(STIMULUS_LIBRARY, id) ? STIMULUS_LIBRARY[id] : undefined;
  return stimulus?.discipline === discipline ? { status: 'resolved', stimulusId: id }
    : { status: 'unresolved', reason: 'STIMULUS_UNKNOWN_OR_WRONG_DISCIPLINE' };
}
export type ExternalLoadContext = {
  source: 'server_training_sources_and_records';
  policy: 'read_only_context';
  activities: { discipline: string; days: string[] }[];
  records: { fecha: string; disciplina: string; duracion?: number | null; intensidad_percibida?: number | null; fatiga_post?: number | null }[];
};
export type ContractInput = {
  prescriptionScope: PrescriptionScope;
  targetWeekStart: string;
  targetDay: string;
  discipline: string;
  stimulus: unknown;
  restrictionsSnapshot: CanonicalRestrictions;
  externalLoadContext: ExternalLoadContext;
  exposureContext: { source: 'legacy_completed_weekly_rows'; report: ExposureReport; limitations: readonly string[] };
  availableDays: string[] | null;
  source: 'weekly_session_builder';
};
export type AllowedTrainingContract = Omit<ContractInput, 'stimulus'> & {
  contractVersion: 1;
  stimulusId: string;
  allowedMovementIds: string[];
  allowedStructureIds: string[];
  rankedCandidates: { movementId: string; recentExposures: number }[];
  restrictionFiltering: { movementId: string; incompatible: RestrictionFlag[]; unknown: RestrictionFlag[] }[];
  gaps: readonly string[];
};
export type ContractResult = { ok: true; contract: AllowedTrainingContract } | { ok: false; errors: string[] };
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const EXPOSURE_LIMITATIONS = ['last_four_rows_not_date_window', 'textual_completed_sessions', 'pattern_modality_counts_not_unique_sessions', 'parallel_week_not_reserved'] as const;
const dateValid = (s: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

function inputErrors(input: ContractInput): string[] {
  const errors = validatePrescriptionScope(input.prescriptionScope);
  const scope = input.prescriptionScope;
  if (errors.length) return errors;
  if (!scope.prescriptionAllowed) errors.push('PRESCRIPTION_NOT_ALLOWED');
  if (!scope.managedDisciplines.includes(input.discipline) || scope.externalDisciplines.includes(input.discipline)) errors.push('DISCIPLINE_OUTSIDE_MANAGED_SCOPE');
  if (!['box', 'carrera'].includes(input.discipline)) errors.push('DISCIPLINE_UNSUPPORTED');
  if (!dateValid(input.targetWeekStart) || new Date(input.targetWeekStart).getUTCDay() !== 1) errors.push('TARGET_WEEK_INVALID');
  if (!DAYS.includes(input.targetDay)) errors.push('TARGET_DAY_INVALID');
  if (input.availableDays !== null && (!Array.isArray(input.availableDays) || input.availableDays.some(d => !DAYS.includes(d)) || !input.availableDays.includes(input.targetDay))) errors.push('DAY_NOT_AVAILABLE');
  const r = input.restrictionsSnapshot;
  if (!r || !dateValid(r.asOfDate) || !Array.isArray(r.areas) || !Array.isArray(r.restrictions) || !Array.isArray(r.reassessments)) return [...errors, 'RESTRICTIONS_INVALID'];
  // Flags are evaluated per candidate; unresolved free-text-only restrictions still reject.
  for (const n of [...r.restrictions, ...r.reassessments]) {
    if (!activeRestrictionFlags([n]).length && !Object.hasOwn(MOVEMENT_LIBRARY, normalizeTrainingKey(n.movement))) errors.push('RESTRICTION_UNRESOLVED');
  }
  if (r.areas.some(area => !Object.values(MOVEMENT_LIBRARY).some(m => m.avoid_with?.includes(area)))) errors.push('RESTRICTION_AREA_UNSUPPORTED');
  if (r.state && r.state.estado !== 'normal' && !r.areas.length && !r.restrictions.length && !r.reassessments.length) errors.push('RESTRICTION_UNRESOLVED');
  const external = input.externalLoadContext;
  if (!external || external.policy !== 'read_only_context' || external.source !== 'server_training_sources_and_records'
    || !Array.isArray(external.activities) || !Array.isArray(external.records)) errors.push('EXTERNAL_CONTEXT_INVALID');
  else if (external.activities.some(a => !scope.externalDisciplines.includes(a.discipline) || !Array.isArray(a.days) || a.days.some(d => !DAYS.includes(d)))
    || external.records.some(r => !scope.externalDisciplines.includes(r.disciplina) || !dateValid(r.fecha))) errors.push('EXTERNAL_CONTEXT_OUTSIDE_SCOPE');
  const exposure = input.exposureContext;
  if (!exposure || exposure.source !== 'legacy_completed_weekly_rows' || exposure.report?.disciplina !== input.discipline || !Array.isArray(exposure.report?.exposiciones)
    || exposure.report.exposiciones.some(e => !Object.hasOwn(MOVEMENT_LIBRARY, e.movementId) || !Number.isSafeInteger(e.vecesUltimas4Semanas) || e.vecesUltimas4Semanas < 0)) errors.push('EXPOSURE_INVALID');
  if (input.source !== 'weekly_session_builder') errors.push('CONTRACT_SOURCE_INVALID');
  return [...new Set(errors)];
}
function pools(input: ContractInput, stimulusId: string) {
  const excluded = new Set([...input.restrictionsSnapshot.restrictions, ...input.restrictionsSnapshot.reassessments].map(n => normalizeTrainingKey(n.movement)));
  const flags = activeRestrictionFlags([...input.restrictionsSnapshot.restrictions, ...input.restrictionsSnapshot.reassessments]);
  const candidates = rankearCandidatos(stimulusId, input.discipline, input.restrictionsSnapshot.areas, input.exposureContext.report.exposiciones).filter(m => !excluded.has(m.id));
  const evaluated = candidates.map(m => ({ movement: m, ...evaluateMovementRestrictions(m, flags) }));
  const movements = evaluated.filter(e => e.allowed).map(e => e.movement);
  const restrictionFiltering = evaluated.filter(e => !e.allowed).map(e => ({ movementId: e.movement.id, incompatible: e.incompatible, unknown: e.unknown }));
  const structures = (STRUCTURES_BY_STIMULUS[stimulusId] || []).filter(id => WORKOUT_STRUCTURE_LIBRARY[id]?.discipline === input.discipline);
  return { movements, structures, restrictionFiltering };
}
export function buildAllowedTrainingContract(input: ContractInput): ContractResult {
  try { return buildContract(input); }
  catch { return { ok: false, errors: ['CONTRACT_INPUT_MALFORMED'] }; }
}
function buildContract(input: ContractInput): ContractResult {
  const errors = inputErrors(input);
  const stimulus = resolveTrainingStimulus(input.discipline, input.stimulus);
  if (stimulus.status === 'unresolved') errors.push(stimulus.reason);
  if (errors.length || stimulus.status !== 'resolved') return { ok: false, errors: [...new Set(errors)] };
  const pool = pools(input, stimulus.stimulusId);
  const { stimulus: _intent, ...context } = input;
  const contract: AllowedTrainingContract = structuredClone({ ...context, contractVersion: 1, stimulusId: stimulus.stimulusId,
    allowedMovementIds: pool.movements.map(m => m.id).sort(), allowedStructureIds: [...pool.structures].sort(),
    rankedCandidates: pool.movements.map(m => ({ movementId: m.id, recentExposures: m.vecesExpuestoReciente })),
    restrictionFiltering: pool.restrictionFiltering,
    gaps: ['generated_session_not_validated_until_2E2', 'external_load_context_only_no_physiological_rule', 'equipment_skill_and_dose_not_enforced'] });
  const validation = validateAllowedTrainingContract(contract);
  return validation.ok ? { ok: true, contract } : validation;
}
/** Validates the contract, not the generated session. Recomputes membership; metadata is not a receipt. */
export function validateAllowedTrainingContract(contract: AllowedTrainingContract): { ok: true } | { ok: false; errors: string[] } {
  try {
    const input: ContractInput = { ...contract, stimulus: contract.stimulusId };
    const errors = inputErrors(input);
    if (contract.contractVersion !== 1) errors.push('CONTRACT_VERSION_INVALID');
    const stimulus = resolveTrainingStimulus(contract.discipline, contract.stimulusId);
    if (stimulus.status !== 'resolved') errors.push(stimulus.reason);
    for (const [ids, library, kind] of [[contract.allowedMovementIds, MOVEMENT_LIBRARY, 'MOVEMENT'], [contract.allowedStructureIds, WORKOUT_STRUCTURE_LIBRARY, 'STRUCTURE']] as const) {
      if (!Array.isArray(ids) || !ids.length) errors.push(`${kind}_POOL_EMPTY`);
      else {
        if (new Set(ids).size !== ids.length) errors.push(`${kind}_IDS_DUPLICATED`);
        if (ids.some(id => typeof id !== 'string' || !Object.hasOwn(library, id))) errors.push(`${kind}_ID_UNKNOWN`);
      }
    }
    if (errors.length) return { ok: false, errors: [...new Set(errors)] };
    const pool = pools(input, contract.stimulusId);
    const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!same(contract.allowedMovementIds, pool.movements.map(m => m.id))) errors.push('MOVEMENT_POOL_MISMATCH');
    if (!same(contract.allowedStructureIds, [...pool.structures])) errors.push('STRUCTURE_POOL_MISMATCH');
    if (JSON.stringify(contract.rankedCandidates) !== JSON.stringify(pool.movements.map(m => ({ movementId: m.id, recentExposures: m.vecesExpuestoReciente })))) errors.push('RANKING_MISMATCH');
    if (JSON.stringify(contract.restrictionFiltering) !== JSON.stringify(pool.restrictionFiltering)) errors.push('RESTRICTION_FILTERING_MISMATCH');
    return errors.length ? { ok: false, errors } : { ok: true };
  } catch { return { ok: false, errors: ['CONTRACT_MALFORMED'] }; }
}
