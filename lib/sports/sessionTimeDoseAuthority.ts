/** Temporal dose mechanics. Domain bands belong to explicit versioned policies, not this resolver. */
export type AvailableSessionTime = { minimumSeconds: number | null; maximumSeconds: number | null; source: string | null; status: string };
export type TimeDosePolicy = {
  id: string; provenance: string;
  targetMinSeconds: number; targetMaxSeconds: number; minimumUsefulSeconds: number;
  /** Extra seconds above target allowed by this policy, always bounded by availability. */
  overTargetToleranceSeconds: number;
};
export type SessionTimeDoseAuthority = {
  version: 1;
  availableTime: AvailableSessionTime;
  hardMaximumSeconds: number | null;
  targetDuration: { minimumSeconds: number; maximumSeconds: number } | null;
  minimumUsefulDurationSeconds: number | null;
  overTargetToleranceSeconds: number;
  policyId: string | null;
  provenance: string | null;
  resolution: 'UNRESOLVED' | 'TARGET_SATISFIED' | 'FEASIBLE_CLAMPED' | 'UNDER_TARGET_ALLOWED' | 'INFEASIBLE';
};
export function resolveSessionTimeDoseAuthority(available: AvailableSessionTime, policy?: TimeDosePolicy): SessionTimeDoseAuthority {
  const base: SessionTimeDoseAuthority = { version: 1, availableTime: { ...available }, hardMaximumSeconds: available.maximumSeconds,
    targetDuration: null, minimumUsefulDurationSeconds: null, overTargetToleranceSeconds: 0, policyId: null, provenance: null, resolution: 'UNRESOLVED' };
  if (!policy) return base;
  if (![policy.targetMinSeconds, policy.targetMaxSeconds, policy.minimumUsefulSeconds].every(n => Number.isFinite(n) && n > 0)
    || policy.minimumUsefulSeconds > policy.targetMinSeconds || policy.targetMinSeconds > policy.targetMaxSeconds
    || !Number.isFinite(policy.overTargetToleranceSeconds) || policy.overTargetToleranceSeconds < 0) throw new Error('TIME_DOSE_POLICY_INVALID');
  const hard = available.maximumSeconds;
  const upper = hard === null ? policy.targetMaxSeconds : Math.min(hard, policy.targetMaxSeconds);
  return { ...base, policyId: policy.id, provenance: policy.provenance, minimumUsefulDurationSeconds: policy.minimumUsefulSeconds,
    overTargetToleranceSeconds: policy.overTargetToleranceSeconds,
    targetDuration: { minimumSeconds: Math.min(policy.targetMinSeconds, upper), maximumSeconds: upper },
    resolution: upper < policy.minimumUsefulSeconds ? 'INFEASIBLE' : upper < policy.targetMinSeconds ? 'UNDER_TARGET_ALLOWED'
      : upper < policy.targetMaxSeconds ? 'FEASIBLE_CLAMPED' : 'TARGET_SATISFIED' };
}
export type SessionDurationEstimate = { minimumSeconds: number; maximumSeconds: number | null; expectedSeconds: number | null };
/** JSON storage may reorder keys. Equality is semantic, including all authority fields. */
export function sameSessionTimeDoseAuthority(actual: SessionTimeDoseAuthority, expected: SessionTimeDoseAuthority): boolean {
  const ordered = (value: unknown): unknown => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(ordered) : Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]))
    : value;
  return JSON.stringify(ordered(actual)) === JSON.stringify(ordered(expected));
}
/** Expected is an operational point estimate, never a measured duration or evidence of adaptation. */
export function validateSessionTimeDose(authority: SessionTimeDoseAuthority, estimate: SessionDurationEstimate): string[] {
  const errors: string[] = [];
  if (authority.hardMaximumSeconds !== null) {
    if (estimate.maximumSeconds === null) errors.push('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET');
    else if (estimate.maximumSeconds > authority.hardMaximumSeconds) errors.push('SESSION_BUDGET_EXCEEDED');
  }
  if (authority.resolution === 'INFEASIBLE') errors.push('SESSION_DOSE_TIME_INFEASIBLE');
  if (authority.targetDuration) {
    if (estimate.expectedSeconds === null) errors.push('SESSION_DOSE_DURATION_UNRESOLVED');
    else {
      if (estimate.expectedSeconds < authority.minimumUsefulDurationSeconds!) errors.push('SESSION_DOSE_UNDERDOSED');
      else if (estimate.expectedSeconds < authority.targetDuration.minimumSeconds) errors.push('SESSION_DOSE_UNDER_TARGET');
      if (estimate.expectedSeconds > authority.targetDuration.maximumSeconds + authority.overTargetToleranceSeconds) errors.push('SESSION_DOSE_OVER_TARGET');
    }
  }
  return errors;
}
