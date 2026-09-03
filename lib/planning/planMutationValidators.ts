import type {
  PlanMutationValidator, ValidationInput, ValidationIssue, ValidatorExecution,
} from './planMutationTypes';

function freezeDeep(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  Object.freeze(value);
}

/** Inputs must be plain data. Each validator receives an isolated frozen snapshot. */
export function immutableSnapshot<T>(value: T): T {
  const snapshot = structuredClone(value);
  freezeDeep(snapshot);
  return snapshot;
}

function isIssue(value: unknown): value is ValidationIssue {
  if (!value || typeof value !== 'object') return false;
  const issue = value as Record<string, unknown>;
  return typeof issue.code === 'string' && typeof issue.validatorId === 'string'
    && typeof issue.message === 'string'
    && (issue.severity === 'hard' || issue.severity === 'warning')
    && (issue.path === undefined || typeof issue.path === 'string');
}

export async function runPlanMutationValidators(
  input: ValidationInput,
  validators: readonly PlanMutationValidator[],
): Promise<ValidatorExecution[]> {
  const executions: ValidatorExecution[] = [];
  const ids = new Set<string>();
  for (const validator of validators) {
    if (ids.has(validator.id)) throw new Error('Duplicate validator id');
    ids.add(validator.id);
    const base = { validatorId: validator.id, version: validator.version };
    if (!validator.operationTypes.includes(input.command.operationType)) {
      executions.push({ ...base, status: 'not_applicable', issues: [] });
      continue;
    }
    try {
      const missing = (validator.requiredContext || []).filter(
        key => input.context[key] === undefined || input.context[key] === null,
      );
      if (missing.length) throw new Error(`Missing required context: ${missing.join(', ')}`);
      const issues = await validator.validate(immutableSnapshot(input));
      if (!Array.isArray(issues) || !issues.every(isIssue)) {
        throw new Error('Invalid validator result');
      }
      const normalized = issues.map(issue => ({ ...issue, validatorId: validator.id }));
      executions.push({ ...base,
        status: normalized.some(issue => issue.severity === 'hard') ? 'failed' : 'passed',
        issues: immutableSnapshot(normalized),
      });
    } catch {
      executions.push({ ...base, status: 'error', issues: [{
        code: 'VALIDATOR_EXECUTION_ERROR', validatorId: validator.id,
        severity: validator.critical ? 'hard' : 'warning',
        message: 'Validator could not complete, returned invalid output, or lacked required context.',
      }] });
    }
  }
  return executions;
}

/** Infrastructure only: no sports policies, week quotas, or seven-day requirement. */
export const candidateStructureValidator: PlanMutationValidator = {
  id: 'candidate_structure', version: '1', critical: true,
  operationTypes: ['create_week', 'regenerate_week', 'patch_session', 'replace_session',
    'record_completion', 'complete_past_rest_days', 'set_week_summary'],
  validate({ command, candidate, context, changeSet }) {
    const issues: ValidationIssue[] = [];
    const add = (path: string, message: string) => issues.push({
      code: 'INVALID_CANDIDATE', validatorId: 'candidate_structure', severity: 'hard', path, message,
    });
    if (!command.target.userCodigo || !command.target.weekStart) add('target', 'Target is required.');
    if (!candidate || candidate.week_start !== command.target.weekStart) {
      add('candidate.week_start', 'Candidate must belong to the target week.');
    }
    if (context.normalizedWeekStart !== undefined && context.normalizedWeekStart !== command.target.weekStart) {
      add('context.normalizedWeekStart', 'Normalized week must match the target.');
    }
    if (changeSet.operationType !== command.operationType) add('changeSet.operationType', 'Operation mismatch.');
    if (!candidate || !Array.isArray(candidate.sessions)) {
      add('candidate.sessions', 'Sessions must be an array.');
    } else {
      candidate.sessions.forEach((session, index) => {
        if (!session || ['dia', 'tipo', 'titulo', 'descripcion'].some(
          field => typeof (session as unknown as Record<string, unknown>)[field] !== 'string',
        )) add(`candidate.sessions.${index}`, 'Session fields must be strings.');
      });
    }
    return issues;
  },
};
