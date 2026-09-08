import { resolvePrescriptionIntent, intentMatchingMovementIds, type PrescriptionIntent } from './prescriptionIntent';
import type { ContractInput } from './allowedTrainingContract';
import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY, rankearCandidatos } from './movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY, STRUCTURES_BY_STIMULUS } from './workoutStructureLibrary';
import { normalizeTrainingKey, validatePrescriptionScope } from './prescriptionScope';
import { activeRestrictionFlags, evaluateMovementRestrictions } from './movementRestrictionPolicy';
import { isStructureSatisfiable } from './structureSemantics';
import { transferMethod } from './goalTransferModel';
import { resolvePrescriptionDataSufficiency } from './prescriptionDataSufficiency';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';

export type StimulusResolution = { status: 'resolved'; stimulusId: string } | { status: 'unresolved'; reason: string };
export function resolveTrainingStimulus(discipline: string, value: unknown): StimulusResolution {
  if (typeof value !== 'string' || !value.trim()) return { status: 'unresolved', reason: 'STIMULUS_UNRESOLVED' };
  const id = normalizeTrainingKey(value);
  const stimulus = Object.hasOwn(STIMULUS_LIBRARY, id) ? STIMULUS_LIBRARY[id] : undefined;
  return stimulus?.discipline === discipline ? { status: 'resolved', stimulusId: id }
    : { status: 'unresolved', reason: 'STIMULUS_UNKNOWN_OR_WRONG_DISCIPLINE' };
}
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const dateValid = (s: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function feasibilityInputErrors(input: ContractInput): string[] {
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
  if (Object.hasOwn(input, 'intent')) {
    const intent = resolvePrescriptionIntent(input.intent);
    if (!intent.ok) errors.push(...intent.errors);
    else if (intent.intent.kind === 'adaptation') {
      const method = transferMethod(intent.intent.methodId)!;
      if (method.discipline !== input.discipline || method.stimulusId !== input.stimulus) errors.push('STRATEGIC_METHOD_MISMATCH');
    }
  }
  if (input.source !== 'weekly_session_builder') errors.push('CONTRACT_SOURCE_INVALID');
  if (input.doseContext?.timeAuthority && timeAuthorityForIntent(input.doseContext.timeBudget, input.intent).resolution === 'INFEASIBLE')
    errors.push('SESSION_DOSE_TIME_INFEASIBLE');
  return [...new Set(errors)];
}
function evaluatePools(input: ContractInput, stimulusId: string) {
  const excluded = new Set([...input.restrictionsSnapshot.restrictions, ...input.restrictionsSnapshot.reassessments].map(n => normalizeTrainingKey(n.movement)));
  const flags = activeRestrictionFlags([...input.restrictionsSnapshot.restrictions, ...input.restrictionsSnapshot.reassessments]);
  const candidates = rankearCandidatos(stimulusId, input.discipline, input.restrictionsSnapshot.areas, input.exposureContext.report.exposiciones).filter(m => !excluded.has(m.id));
  const evaluated = candidates.map(m => ({ movement: m, ...evaluateMovementRestrictions(m, flags) }));
  const movements = evaluated.filter(e => e.allowed).map(e => e.movement).filter(m => !input.doseContext?.sufficiency ||
    resolvePrescriptionDataSufficiency(input.doseContext.sufficiency, input.doseContext.references,
      { movementId: m.id, discipline: input.discipline }).status !== 'missing_required_data');
  const restrictionFiltering = evaluated.filter(e => !e.allowed).map(e => ({ movementId: e.movement.id, incompatible: e.incompatible, unknown: e.unknown }));
  const structures = (STRUCTURES_BY_STIMULUS[stimulusId] || []).filter(id => WORKOUT_STRUCTURE_LIBRARY[id]?.discipline === input.discipline);
  return { candidates, movements, structures, restrictionFiltering };
}

export type TrainingFeasibility =
  | { resolved: false; feasible: false; errors: string[] }
  | ({ resolved: true; feasible: boolean; errors: string[]; discipline: string; stimulusId: string;
      intent: PrescriptionIntent; intentMovementIds: string[]; allowedMovementIds: string[]; allowedStructureIds: string[]; satisfiableStructureIds: string[];
      rankedCandidates: { movementId: string; recentExposures: number }[] } & ReturnType<typeof evaluatePools>);

/** Pure evaluation of already loaded canonical context. No clock, IO, session or policy decisions.
 * Reuse the context across days/stimuli; exposure and availability remain discipline-specific.
 * Compatible structures retain the public contract pool; satisfiable structures express existence.
 */
export function evaluateTrainingFeasibility(input: ContractInput): TrainingFeasibility {
  try {
    const errors = feasibilityInputErrors(input);
    const stimulus = resolveTrainingStimulus(input.discipline, input.stimulus);
    if (stimulus.status === 'unresolved') errors.push(stimulus.reason);
    if (errors.length || stimulus.status !== 'resolved') return { resolved: false, feasible: false, errors: [...new Set(errors)] };
    const admittedIntent = resolvePrescriptionIntent(Object.hasOwn(input, 'intent') ? input.intent : { kind: 'stimulus_only' });
    if (!admittedIntent.ok) return { resolved: false, feasible: false, errors: admittedIntent.errors };
    const intent = admittedIntent.intent;
    const pool = evaluatePools(input, stimulus.stimulusId);
    const allowedMovementIds = pool.movements.map(m => m.id).sort();
    const allowedStructureIds = [...pool.structures].sort();
    const intentMovementIds = intentMatchingMovementIds(intent, allowedMovementIds);
    // Any matching ID can occupy a main slot; the remaining distinct slots may be accessories.
    const satisfiableStructureIds = allowedStructureIds.filter(id => intentMovementIds.length > 0
      && isStructureSatisfiable(WORKOUT_STRUCTURE_LIBRARY[id], allowedMovementIds));
    if (!allowedMovementIds.length) errors.push('MOVEMENT_POOL_EMPTY');
    else if (!intentMovementIds.length) errors.push('INTENT_POOL_EMPTY');
    if (!allowedStructureIds.length) errors.push('STRUCTURE_POOL_EMPTY');
    else if (intentMovementIds.length && !satisfiableStructureIds.length) errors.push('STRUCTURE_SPACE_UNSATISFIABLE');
    return { resolved: true, feasible: !errors.length, errors, discipline: input.discipline, stimulusId: stimulus.stimulusId,
      ...pool, intent, intentMovementIds, allowedMovementIds, allowedStructureIds, satisfiableStructureIds,
      rankedCandidates: pool.movements.map(m => ({ movementId: m.id, recentExposures: m.vecesExpuestoReciente })) };
  } catch { return { resolved: false, feasible: false, errors: ['CONTRACT_INPUT_MALFORMED'] }; }
}
