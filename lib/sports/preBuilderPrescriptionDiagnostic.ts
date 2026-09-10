import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY } from './movementLibrary';
import { TRANSFER_METHODS } from './goalTransferModel';
import { signalIds } from '../athlete/prescriptionSignals';
import { referenceQuestionFields } from './prescriptionReferenceFields';
import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { PrescriptionDataSufficiency, PrescriptionQuestion } from './prescriptionDataSufficiency';

export type PrescriptionCandidateObservation = { movementId: string; decision: PrescriptionDataSufficiency };
const limit = 32;
const errors = new Set(['MOVEMENT_POOL_EMPTY', 'INTENT_POOL_EMPTY', 'STRUCTURE_POOL_EMPTY', 'STRUCTURE_SPACE_UNSATISFIABLE',
  'CONTRACT_INPUT_MALFORMED', 'CONTRACT_MALFORMED', 'SESSION_DOSE_TIME_INFEASIBLE', 'STRATEGIC_METHOD_MISMATCH',
  'DISCIPLINE_OUTSIDE_MANAGED_SCOPE', 'DAY_NOT_AVAILABLE', 'RESTRICTIONS_INVALID', 'RESTRICTION_UNRESOLVED',
  'RESTRICTION_AREA_UNSUPPORTED', 'CONTRACT_SOURCE_INVALID', 'PRESCRIPTION_NOT_ALLOWED']);
const member = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value) ? value : null;
const catalogId = (value: unknown, catalog: object) => typeof value === 'string' && Object.hasOwn(catalog, value) ? value : null;
const requirement = (value: unknown) => member(value, signalIds) || (typeof value === 'string' && Object.hasOwn(referenceQuestionFields, value) ? value : 'UNKNOWN_REQUIREMENT');

/** Observation only: no evaluation, IO reads, counterfactuals or authority-bearing objects are serialized. */
export function emitPreBuilderPrescriptionDiagnostic(contract: AllowedTrainingContract, candidates: readonly PrescriptionCandidateObservation[],
  selected: PrescriptionCandidateObservation | undefined, question: PrescriptionQuestion | undefined, preparedErrors: readonly string[],
  planningRunId?: string, log: (line: string) => void = line => console.info(line)) {
  try {
    const bounded = <T,>(values: readonly T[]) => ({ values: values.slice(0, limit), totalCount: values.length, truncated: values.length > limit });
    const intent = contract.intent;
    const base = {
      planningRunId: typeof planningRunId === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(planningRunId) ? planningRunId : null,
      day: member(contract.targetDay, ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']),
      discipline: member(contract.discipline, ['box','carrera','fuerza']),
      managedDisciplines: bounded(contract.prescriptionScope.managedDisciplines.map(d => member(d, ['box','carrera','fuerza']))),
      intentKind: member(intent?.kind, ['stimulus_only','main_pattern','adaptation']),
      adaptationId: intent?.kind === 'adaptation' ? catalogId(intent.adaptationId, STIMULUS_LIBRARY) : null,
      methodId: intent?.kind === 'adaptation' ? member(intent.methodId, TRANSFER_METHODS.map(m => m.id)) : null,
      stimulusId: catalogId(contract.stimulusId, STIMULUS_LIBRARY),
      pattern: intent && intent.kind !== 'stimulus_only' ? member(intent.pattern, Object.values(MOVEMENT_LIBRARY).map(m => m.movement_pattern)) : null,
    };
    const emit = (event: string, fields: object) => { try { log(JSON.stringify({ event, ...base, ...fields })); } catch { /* Non-authoritative sink/serialization. */ } };
    emit('PRE_BUILDER_PRESCRIPTION_REJECTION', {
      stage: 'SESSION_CONTRACT_REBUILD_REJECTED', builderInvoked: false, doseAuthorityStage: 'NOT_EVALUATED',
      alternativeIntentViability: 'NOT_ESTABLISHED', globalEquipmentNecessity: 'NOT_ESTABLISHED',
      baseCandidateMovementIds: bounded(contract.allowedMovementIds.map(id => catalogId(id, MOVEMENT_LIBRARY))),
      preparedErrorCodes: bounded(preparedErrors.map(code => errors.has(code) ? code : 'UNKNOWN_PREPARED_ERROR')),
      selectedMovementId: catalogId(selected?.movementId, MOVEMENT_LIBRARY),
      selectedRequirementIds: bounded((question?.signalIds ?? []).map(requirement)),
      totalCount: candidates.length, emittedCount: Math.min(candidates.length, limit), truncated: candidates.length > limit,
    });
    for (const [index, candidate] of candidates.slice(0, limit).entries()) {
      emit('PRE_BUILDER_PRESCRIPTION_CANDIDATE', {
        index, movementId: catalogId(candidate.movementId, MOVEMENT_LIBRARY),
        sufficiencyStatus: member(candidate.decision.status, ['sufficient','fallback_available','missing_required_data']),
        missingRequirementIds: bounded(candidate.decision.missingSignals.map(s => requirement(s.signal))),
        signalStates: bounded(candidate.decision.missingSignals.map(s => ({ requirementId: requirement(s.signal),
          state: member(s.state, ['available','unavailable','unknown','ambiguous']) ?? 'UNKNOWN_STATE' }))),
      });
    }
  } catch { /* Malformed observation must never change the planning result. */ }
}
