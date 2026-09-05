import type {
  PlanMutationValidationResult, PlanMutationValidator, ValidationInput, ValidatedPlanMutation,
} from './planMutationTypes';
import {
  immutableSnapshot, prescriptionRevisionValidator,
} from './planMutationValidators';
import { hasPrescriptionIdentityProof } from './prescriptionIdentity';
import { runPlanValidationPipeline as runPipeline } from './planValidationPipeline';

const validated = new WeakSet<ValidatedPlanMutation>();
/** JSON or structurally forged receipts cannot authorize the persistence adapter. */
export function isValidatedPlanMutation(value: ValidatedPlanMutation): boolean { return validated.has(value); }

/** Strict infrastructure entry: no DB writes, UUID generation, auth or idempotency.
 * All known sports writers use this entry.
 */
export async function validatePlanMutation(
  input: ValidationInput,
  validators: readonly PlanMutationValidator[] = [],
): Promise<PlanMutationValidationResult> {
  const base = {
    source: input.command.source,
    operationType: input.command.operationType,
  };
  try {
    const needsProof = ['create_week', 'regenerate_week'].includes(input.command.operationType);
    const hasProof = !needsProof || hasPrescriptionIdentityProof(input.context.identityProof,
      input.candidate.sessions, input.context.existingPlan);
    const snapshot = immutableSnapshot(input);
    const authority: PlanMutationValidator = {
      id: 'prescription_authority', version: '1', critical: true,
      operationTypes: prescriptionRevisionValidator.operationTypes,
      validate: () => hasProof ? [] : [{ code: 'UNACCREDITED_PRESCRIPTION_IDENTITY',
        validatorId: 'prescription_authority', severity: 'hard', message: 'Server identity proof is required.' }],
    };
    const result = await runPipeline(snapshot, [prescriptionRevisionValidator, authority, ...validators]);
    if (result.status !== 'ready_for_commit') return result;
    const mutation = Object.freeze({ command: snapshot.command, candidate: snapshot.candidate,
      existingPlan: snapshot.context.existingPlan }) as ValidatedPlanMutation;
    validated.add(mutation);
    return { ...result, candidate: snapshot.candidate, mutation };
  } catch {
    return { ...base, status: 'failed', valid: false, candidate: null, warnings: [],
      violations: [{ code: 'PIPELINE_ERROR', validatorId: 'pipeline', severity: 'hard',
        message: 'Pipeline could not prepare or validate the candidate.' }],
      metadata: { requestId: input.command.requestId, validatorExecutions: [] },
    };
  }
}
