import type {
  PlanMutationValidator, LegacyValidationInput as ValidationInput, ValidationIssue, ValidatorExecution,
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

/** Hyphenated UUID syntax, all versions; uniqueness is case-insensitive. */
export function isPrescriptionSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function isPlanRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
/** Persisted candidates are plain JSON, not mutable Date/Map/class instances or cycles. */
function isPlainPlanData(value: unknown, ancestors: readonly object[] = []): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.includes(value)) return false;
  const prototype: object | null = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
  const values = Array.isArray(value) ? [...value] : Object.values(value);
  return values.every(child => isPlainPlanData(child, [...ancestors, value]));
}
/** Plain JSON comparison, independent of object key ordering. No semantic matching. */
export function samePlanData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, index) => samePlanData(value, b[index]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && samePlanData(left[key], right[key]));
}

/** Mandatory in the strict entry. The internal content pipeline alone cannot authorize persistence. */
export const prescriptionRevisionValidator: PlanMutationValidator = {
  id: 'prescription_revision', version: '1', critical: true,
  operationTypes: candidateStructureValidator.operationTypes,
  validate({ command, context, candidate }) {
    const issues: ValidationIssue[] = [];
    const add = (code: string, path: string) => issues.push({ code, path,
      validatorId: 'prescription_revision', severity: 'hard', message: code });
    if (!isPlainPlanData(candidate)) add('NON_JSON_PLAN_DATA', 'candidate');
    const validSessions = (value: unknown, path: string): boolean => {
      if (!Array.isArray(value)) { add('INVALID_SESSION_IDENTITIES', path); return false; }
      const used = new Set<string>();
      let valid = true;
      value.forEach((session: unknown, index: number) => {
        const id = session && typeof session === 'object' && !Array.isArray(session)
          ? (session as Record<string, unknown>).session_id : undefined;
        if (!isPrescriptionSessionId(id) || used.has(id.toLowerCase())) {
          add('INVALID_SESSION_ID', `${path}.${index}.session_id`); valid = false;
        } else used.add(id.toLowerCase());
      });
      return valid;
    };
    const candidateIdsValid = validSessions(candidate?.sessions, 'candidate.sessions');
    if (command.operationType === 'create_week') {
      if (candidate.revision !== 1) add('INVALID_INITIAL_REVISION', 'candidate.revision');
      if (context.existingPlan || candidate.id !== undefined || candidate.user_codigo !== undefined
        || 'expectedRevision' in command) add('INVALID_CREATE_IDENTITY', 'candidate');
      return issues;
    }
    const existing = context.existingPlan;
    if (!existing) { add('MISSING_PLAN_SNAPSHOT', 'context.existingPlan'); return issues; }
    if (!isPlainPlanData(existing)) add('NON_JSON_PLAN_DATA', 'context.existingPlan');
    if (!isPlanRevision(command.expectedRevision)) add('INVALID_EXPECTED_REVISION', 'command.expectedRevision');
    if (!isPlanRevision(existing.revision) || command.expectedRevision !== existing.revision)
      add('SNAPSHOT_REVISION_MISMATCH', 'context.existingPlan.revision');
    if (candidate.revision !== existing.revision) add('CANDIDATE_REVISION_CHANGED', 'candidate.revision');
    if (isPlanRevision(command.expectedRevision) && !Number.isSafeInteger(command.expectedRevision + 1))
      add('REVISION_OVERFLOW', 'command.expectedRevision');
    if (typeof existing.id !== 'string' || !existing.id.trim() || existing.user_codigo !== command.target.userCodigo
      || existing.week_start !== command.target.weekStart || candidate.id !== existing.id
      || candidate.user_codigo !== existing.user_codigo) add('PLAN_IDENTITY_MISMATCH', 'candidate');
    const snapshotIdsValid = validSessions(existing.sessions, 'context.existingPlan.sessions');
    if (!candidateIdsValid || !snapshotIdsValid) return issues;
    if (command.operationType === 'regenerate_week') {
      for (const session of existing.sessions) {
        if (session.completada === true && !candidate.sessions.some(s => samePlanData(s, session)))
          add('COMPLETED_PRESCRIPTION_NOT_PRESERVED', 'candidate.sessions');
      }
    } else {
      // Positional preservation is an invariant, never calendar-based matching.
      if (candidate.sessions.length !== existing.sessions.length || candidate.sessions.some((s, i) =>
        (s as unknown as Record<string, unknown>).session_id
          !== (existing.sessions[i] as unknown as Record<string, unknown>)?.session_id))
        add('PRESCRIPTION_IDENTITY_CHANGED', 'candidate.sessions');
      if (command.operationType === 'set_week_summary' && !samePlanData(candidate.sessions, existing.sessions))
        add('SUMMARY_CHANGED_SESSIONS', 'candidate.sessions');
    }
    return issues;
  },
};
