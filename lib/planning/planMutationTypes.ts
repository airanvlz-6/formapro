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

export type LegacyPlanSession = SessionPrescription & Readonly<{
  dia: string;
  completada?: boolean;
  titulo_real?: string;
  descripcion_real?: string;
}>;

/** Existing JSON fields are preserved without granting arbitrary patch authority. */
type PlanFields = Readonly<{
  week_start: string;
  week_number?: number;
  total_weeks_block?: number | null;
  block_name?: string;
  week_objective?: string | null;
  resumen_semana?: string;
  [field: string]: unknown;
}>;
export type LegacyPlanCandidate = PlanFields & Readonly<{ sessions: readonly LegacyPlanSession[] }>;

type WeekTarget = Readonly<{ userCodigo: string; weekStart: string }>;
type SessionTarget = WeekTarget & Readonly<{ day: string }>;
type Confirmation = Readonly<{ pendingId: string; confirmed: boolean }>;
type CommandBase = Readonly<{
  source: MutationSource;
  requestId?: string;
  idempotencyKey?: string;
}>;
type ExistingTarget = Readonly<{ expectedRevision?: string | number }>;

export type LegacyPlanMutationCommand = CommandBase & (
  | { operationType: 'create_week'; target: WeekTarget; proposal: LegacyPlanCandidate }
  | (ExistingTarget & { operationType: 'regenerate_week'; target: WeekTarget; proposal: LegacyPlanCandidate })
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

export type LegacyPlanMutationContext = Readonly<{
  existingPlan?: LegacyPlanCandidate | null;
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

export type LegacyValidationInput = Readonly<{
  command: LegacyPlanMutationCommand;
  context: LegacyPlanMutationContext;
  candidate: LegacyPlanCandidate;
  changeSet: PlanChangeSet;
}>;

export interface PlanMutationValidator {
  readonly id: string;
  readonly version: string;
  readonly operationTypes: readonly OperationType[];
  readonly requiredContext?: readonly (keyof LegacyPlanMutationContext)[];
  readonly critical: boolean;
  validate(input: LegacyValidationInput): readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;
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
export type LegacyPlanMutationValidationResult = ResultBase & (
  | { status: 'ready_for_commit'; valid: true; candidate: LegacyPlanCandidate }
  | { status: 'rejected' | 'failed'; valid: false; candidate: null }
);

/** Persistible contracts. Legacy-named types above describe unadmitted content for the internal validator pipeline; they cannot authorize persistence. */
export type PlanSession = LegacyPlanSession & Readonly<{ session_id: string }>;
export type PlanCandidate = PlanFields & Readonly<{
  sessions: readonly PlanSession[];
  /** Snapshot revision; the persistence adapter alone computes the next value. */
  revision: number;
  id?: string;
  user_codigo?: string;
}>;
export type ExistingPlanSnapshot = PlanCandidate & Readonly<{ id: string; user_codigo: string }>;

type StrictCommand<C> = C extends { operationType: 'create_week' }
  ? Omit<C, 'proposal'> & { proposal: PlanCandidate; expectedRevision?: never }
  : C extends { operationType: 'regenerate_week' }
    ? Omit<C, 'proposal' | 'expectedRevision'> & { proposal: PlanCandidate; expectedRevision: number }
    : Omit<C, 'expectedRevision'> & { expectedRevision: number };
export type PlanMutationCommand = StrictCommand<LegacyPlanMutationCommand>;
export type PlanMutationContext = Omit<LegacyPlanMutationContext, 'existingPlan'> & Readonly<{
  existingPlan?: ExistingPlanSnapshot | null;
  /** Opaque process-local attestation, never a field accepted from request JSON. */
  identityProof?: import('./prescriptionIdentity').PrescriptionIdentityProof;
}>;
export type ValidationInput = Readonly<{
  command: PlanMutationCommand;
  context: PlanMutationContext;
  candidate: PlanCandidate;
  changeSet: PlanChangeSet;
}>;

declare const validatedPlanMutation: unique symbol;
/** Also authenticated at runtime: structurally forged/JSON receipts cannot be persisted. */
export type ValidatedPlanMutation = Readonly<{
  [validatedPlanMutation]: true;
  command: PlanMutationCommand;
  candidate: PlanCandidate;
  existingPlan?: ExistingPlanSnapshot | null;
}>;
export type PlanMutationValidationResult = ResultBase & (
  | { status: 'ready_for_commit'; valid: true; candidate: PlanCandidate; mutation: ValidatedPlanMutation }
  | { status: 'rejected' | 'failed'; valid: false; candidate: null }
);
