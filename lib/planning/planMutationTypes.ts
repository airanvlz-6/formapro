/** Account code reassignment and account deletion belong to Account Management.
 * Their existing weekly_plan writes remain external until that authority is migrated.
 */
export type OperationType =
  | 'create_week' | 'regenerate_week' | 'patch_session' | 'replace_session'
  | 'record_completion' | 'complete_past_rest_days' | 'set_week_summary';

export type MutationSource =
  | 'weekly_orchestrator' | 'legacy_plan_tag_frontend' | 'legacy_plan_tag_backend' | 'legacy_week_save'
  | 'direct_session_update' | 'pending_confirmation' | 'explicit_completion'
  | 'deterministic_completion' | 'coach_completion' | 'week_close' | 'week_summary';

export type SessionPrescription = Readonly<{
  tipo: string;
  titulo: string;
  descripcion: string;
  por_que?: string;
  debilidad_relacionada?: string | null;
}>;

export type PlanSession = SessionPrescription & Readonly<{
  dia: string;
  completada?: boolean;
  titulo_real?: string;
  descripcion_real?: string;
}>;

/** Existing JSON fields are preserved without granting arbitrary patch authority. */
export type PlanCandidate = Readonly<{
  week_start: string;
  sessions: readonly PlanSession[];
  week_number?: number;
  total_weeks_block?: number | null;
  block_name?: string;
  week_objective?: string | null;
  resumen_semana?: string;
  [field: string]: unknown;
}>;

type WeekTarget = Readonly<{ userCodigo: string; weekStart: string }>;
type SessionTarget = WeekTarget & Readonly<{ day: string }>;
type Confirmation = Readonly<{ pendingId: string; confirmed: boolean }>;
type CommandBase = Readonly<{
  source: MutationSource;
  requestId?: string;
  idempotencyKey?: string;
}>;
type ExistingTarget = Readonly<{ expectedRevision?: string }>;

export type PlanMutationCommand = CommandBase & (
  | { operationType: 'create_week'; target: WeekTarget; proposal: PlanCandidate }
  | (ExistingTarget & { operationType: 'regenerate_week'; target: WeekTarget; proposal: PlanCandidate })
  | (ExistingTarget & { operationType: 'patch_session'; target: SessionTarget;
      proposal: { changes: Partial<SessionPrescription>; reason?: string; confidence?: number };
      confirmation?: Confirmation })
  | (ExistingTarget & { operationType: 'replace_session'; target: SessionTarget;
      proposal: { session: SessionPrescription; reason?: string }; confirmation?: Confirmation })
  | (ExistingTarget & { operationType: 'record_completion'; target: SessionTarget;
      proposal: { title: string; description: string } })
  | (ExistingTarget & { operationType: 'complete_past_rest_days'; target: WeekTarget;
      proposal: { asOfDate: string } })
  | (ExistingTarget & { operationType: 'set_week_summary'; target: WeekTarget;
      proposal: { summary: string; adherence?: string } })
);

export type PlanMutationContext = Readonly<{
  existingPlan?: PlanCandidate | null;
  normalizedWeekStart?: string;
  mode?: string;
  cycle?: Readonly<Record<string, unknown>>;
  restrictions?: readonly Readonly<Record<string, unknown>>[];
  readiness?: Readonly<Record<string, unknown>>;
  sports?: Readonly<Record<string, unknown>>;
  pending?: Readonly<{ id: string; status: string; revision?: string }>;
}>;

export type PlanChangeSet = Readonly<{
  operationType: OperationType;
  affectedDays: readonly string[];
  changedFields: readonly string[];
}>;

export interface ValidationIssue {
  code: string;
  validatorId: string;
  severity: 'hard' | 'warning';
  message: string;
  path?: string;
}

export interface ValidatorExecution {
  validatorId: string;
  version: string;
  status: 'passed' | 'failed' | 'not_applicable' | 'error';
  issues: readonly ValidationIssue[];
}

export type ValidationInput = Readonly<{
  command: PlanMutationCommand;
  context: PlanMutationContext;
  candidate: PlanCandidate;
  changeSet: PlanChangeSet;
}>;

export interface PlanMutationValidator {
  readonly id: string;
  readonly version: string;
  readonly operationTypes: readonly OperationType[];
  readonly requiredContext?: readonly (keyof PlanMutationContext)[];
  readonly critical: boolean;
  validate(input: ValidationInput): readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;
}

interface ResultBase {
  source: MutationSource;
  operationType: OperationType;
  violations: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
  metadata: {
    requestId?: string;
    validatorExecutions: readonly ValidatorExecution[];
  };
}

/** Validation is neither authorization nor persistence. */
export type PlanMutationValidationResult = ResultBase & (
  | { status: 'ready_for_commit'; valid: true; candidate: PlanCandidate }
  | { status: 'rejected' | 'failed'; valid: false; candidate: null }
);
