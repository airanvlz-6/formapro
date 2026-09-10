import type { PrescriptionIntent } from './prescriptionIntent';
import { runningEventMethodAllowed, type RunningEventPreparationDecisionV1 } from './runningEventPreparation';
import type { CanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import type { ExposureReport } from './exposureEngine';
import type { PrescriptionScope } from './prescriptionScope';
import type { RestrictionFlag } from './movementRestrictionPolicy';
import { evaluateTrainingFeasibility, feasibilityInputErrors, resolveTrainingStimulus } from './trainingFeasibility';
import { validateDoseContext, type SessionDoseContext } from './sessionDoseContext';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';
import { sameSessionTimeDoseAuthority } from './sessionTimeDoseAuthority';
import { validMethodIntensity, type MethodIntensityAuthority } from './methodIntensityAuthority';
import { validRunningMethodDose, type AuthorizedRunningMethodDose } from './runningMethodDoseAuthority';

export { STRUCTURES_BY_STIMULUS } from './workoutStructureLibrary';
export { resolveTrainingStimulus, type StimulusResolution } from './trainingFeasibility';
export type ExternalLoadContext = {
  source: 'server_training_sources_and_records';
  policy: 'read_only_context';
  activities: { discipline: string; days: string[] }[];
  records: { fecha: string; disciplina: string; duracion?: number | null; intensidad_percibida?: number | null; fatiga_post?: number | null }[];
};
export type ContractInput = {
  runningEventPreparation?: RunningEventPreparationDecisionV1;
  prescriptionScope: PrescriptionScope;
  targetWeekStart: string;
  targetDay: string;
  discipline: string;
  stimulus: unknown;
  /** Server-owned canonical input only; never inferred from title/focus. */
  intent?: PrescriptionIntent;
  doseContext?: SessionDoseContext;
  restrictionsSnapshot: CanonicalRestrictions;
  externalLoadContext: ExternalLoadContext;
  exposureContext: { source: 'legacy_completed_weekly_rows'; report: ExposureReport; limitations: readonly string[] };
  availableDays: string[] | null;
  source: 'weekly_session_builder';
};
export type AllowedTrainingContract = Omit<ContractInput, 'stimulus'> & {
  intensityAuthority?: MethodIntensityAuthority;
  runningMethodDose?: AuthorizedRunningMethodDose;
  contractVersion: 1 | 2 | 3;
  stimulusId: string;
  allowedMovementIds: string[];
  allowedStructureIds: string[];
  rankedCandidates: { movementId: string; recentExposures: number }[];
  restrictionFiltering: { movementId: string; incompatible: RestrictionFlag[]; unknown: RestrictionFlag[] }[];
  gaps: readonly string[];
};
export type ContractResult = { ok: true; contract: AllowedTrainingContract } | { ok: false; errors: string[] };
export const EXPOSURE_LIMITATIONS = ['last_four_rows_not_date_window', 'textual_completed_sessions', 'pattern_modality_counts_not_unique_sessions', 'parallel_week_not_reserved'] as const;
export function buildAllowedTrainingContract(input: ContractInput): ContractResult {
  try { return buildContract(input); }
  catch { return { ok: false, errors: ['CONTRACT_INPUT_MALFORMED'] }; }
}
function buildContract(input: ContractInput): ContractResult {
  const pool = evaluateTrainingFeasibility(input);
  if (!pool.resolved || !pool.feasible) return { ok: false, errors: pool.errors };
  const { stimulus: _intent, ...context } = input;
  const contract: AllowedTrainingContract = structuredClone({ ...context, contractVersion: input.doseContext ? 3 : Object.hasOwn(input, 'intent') ? 2 : 1, stimulusId: pool.stimulusId,
    allowedMovementIds: pool.allowedMovementIds, allowedStructureIds: pool.allowedStructureIds,
    rankedCandidates: pool.rankedCandidates,
    restrictionFiltering: pool.restrictionFiltering,
    gaps: ['external_load_context_only_no_physiological_rule', input.doseContext?.sufficiency ? 'equipment_plate_increments_unknown' : input.doseContext ? 'equipment_inventory_and_skill_not_enforced' : 'equipment_skill_and_dose_not_enforced'] });
  const validation = validateAllowedTrainingContract(contract);
  return validation.ok ? { ok: true, contract } : validation;
}
/** Validates the contract, not the generated session. Recomputes membership; metadata is not a receipt. */
export function validateAllowedTrainingContract(contract: AllowedTrainingContract): { ok: true } | { ok: false; errors: string[] } {
  try {
    const input: ContractInput = { ...contract, stimulus: contract.stimulusId };
    const errors = feasibilityInputErrors(input);
    if (contract.runningEventPreparation && contract.discipline === 'carrera') {
      if (contract.intent?.kind !== 'adaptation' || !runningEventMethodAllowed(contract.runningEventPreparation,contract.intent.methodId)) errors.push('D3_METHOD_FORBIDDEN');
      const index=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].indexOf(contract.targetDay);
      const date=new Date(Date.parse(contract.targetWeekStart)+index*86400000).toISOString().slice(0,10);
      if(date===contract.runningEventPreparation.constraints.protectedDate) errors.push('D3_EVENT_DATE_PROTECTED');
    }
    if (!validMethodIntensity(contract)) errors.push('METHOD_INTENSITY_AUTHORITY_INVALID');
    if (!validRunningMethodDose(contract)) errors.push('RUNNING_METHOD_DOSE_AUTHORITY_INVALID');
    if (![1, 2, 3].includes(contract.contractVersion)) errors.push('CONTRACT_VERSION_INVALID');
    if (contract.contractVersion === 3 ? !validateDoseContext(contract.doseContext!) : Object.hasOwn(contract, 'doseContext')) errors.push('DOSE_CONTEXT_VERSION_INVALID');
    if (contract.doseContext?.timeAuthority && !sameSessionTimeDoseAuthority(contract.doseContext.timeAuthority,
      timeAuthorityForIntent(contract.doseContext.timeBudget, contract.intent))) errors.push('SESSION_DOSE_AUTHORITY_MISMATCH');
    if (contract.contractVersion === 1 && Object.hasOwn(contract, 'intent')) errors.push('INTENT_VERSION_MISMATCH');
    if (contract.contractVersion === 2 && !Object.hasOwn(contract, 'intent')) errors.push('INTENT_REQUIRED');
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
    const pool = evaluateTrainingFeasibility(input);
    if (!pool.resolved) return { ok: false, errors: pool.errors };
    const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!same(contract.allowedMovementIds, pool.allowedMovementIds)) errors.push('MOVEMENT_POOL_MISMATCH');
    if (!same(contract.allowedStructureIds, pool.allowedStructureIds)) errors.push('STRUCTURE_POOL_MISMATCH');
    if (JSON.stringify(contract.rankedCandidates) !== JSON.stringify(pool.rankedCandidates)) errors.push('RANKING_MISMATCH');
    if (JSON.stringify(contract.restrictionFiltering) !== JSON.stringify(pool.restrictionFiltering)) errors.push('RESTRICTION_FILTERING_MISMATCH');
    if (!errors.length && !pool.feasible) errors.push(...pool.errors);
    return errors.length ? { ok: false, errors } : { ok: true };
  } catch { return { ok: false, errors: ['CONTRACT_MALFORMED'] }; }
}
