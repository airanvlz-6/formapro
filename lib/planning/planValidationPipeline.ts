import type {
  LegacyPlanMutationValidationResult as PlanMutationValidationResult, PlanMutationValidator, LegacyValidationInput as ValidationInput,
} from './planMutationTypes';
import {
  candidateStructureValidator, immutableSnapshot, runPlanMutationValidators,
} from './planMutationValidators';

/** Internal content-validation pipeline. Only strict planMutation issues persistence receipts. */
export async function runPlanValidationPipeline(
  input: ValidationInput,
  validators: readonly PlanMutationValidator[] = [],
): Promise<PlanMutationValidationResult> {
  const base = {
    source: input.command.source,
    operationType: input.command.operationType,
  };
  try {
    const snapshot = immutableSnapshot(input);
    const executions = await runPlanMutationValidators(snapshot, [candidateStructureValidator, ...validators]);
    const issues = executions.flatMap(execution => execution.issues);
    const violations = issues.filter(issue => issue.severity === 'hard');
    const warnings = issues.filter(issue => issue.severity === 'warning');
    const result = { ...base, violations, warnings,
      metadata: { requestId: snapshot.command.requestId, validatorExecutions: executions } };
    if (executions.some(execution => execution.status === 'error'
      && execution.issues.some(issue => issue.severity === 'hard'))) {
      return { ...result, status: 'failed', valid: false, candidate: null };
    }
    if (violations.length) return { ...result, status: 'rejected', valid: false, candidate: null };
    return { ...result, status: 'ready_for_commit', valid: true, candidate: snapshot.candidate };
  } catch {
    return { ...base, status: 'failed', valid: false, candidate: null, warnings: [],
      violations: [{ code: 'PIPELINE_ERROR', validatorId: 'pipeline', severity: 'hard',
        message: 'Pipeline could not prepare or validate the candidate.' }],
      metadata: { requestId: input.command.requestId, validatorExecutions: [] },
    };
  }
}
