import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlan, mutatePlanWithCAS } from './planPersistence';
import type { ExistingPlanSnapshot, PlanCandidate, PlanMutationCommand, PlanSession, ValidatedPlanMutation } from './planMutationTypes';

type Assert<T extends true> = T;
type ExistingCommand = Exclude<PlanMutationCommand, { operationType: 'create_week' }>;
type CreateCommand = Extract<PlanMutationCommand, { operationType: 'create_week' }>;

/** Compile-only assertions, checked by tsc; no top-level calls or credentials. */
export type PlanInfrastructureTypeChecks = [
  Assert<{} extends Pick<PlanSession, 'session_id'> ? false : true>,
  Assert<PlanSession['session_id'] extends string ? true : false>,
  Assert<{} extends Pick<PlanCandidate, 'revision'> ? false : true>,
  Assert<PlanCandidate['revision'] extends number ? true : false>,
  Assert<{} extends Pick<ExistingPlanSnapshot, 'id' | 'user_codigo'> ? false : true>,
  Assert<{} extends Pick<ExistingCommand, 'expectedRevision'> ? false : true>,
  Assert<ExistingCommand['expectedRevision'] extends number ? true : false>,
  Assert<{} extends Pick<CreateCommand, 'expectedRevision'> ? true : false>,
  Assert<{} extends ValidatedPlanMutation ? false : true>,
];

/** Never invoked. Typecheck call sites without expanding the entire generic surface. */
export function checkSupabaseCalls(db: SupabaseClient, receipt: ValidatedPlanMutation) {
  return [createPlan(db, receipt), mutatePlanWithCAS(db, receipt)];
}
