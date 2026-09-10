/** Frozen rejected pre-production v1 constants. Compatibility only. */
/** NEW Forge B.3.2B product policies, not physiological thresholds or catalog typical durations.
 * Fractions allocate MAIN work only from a declared/observed quantity of the SAME unit.
 * No time/pace conversion and no claim of complete weekly load. See the policy decision table
 * in docs/b32b-running-method-dose-authority.md before changing any number. */
const definitions = [
  { methodId: 'running_base', share: 0.12, maximumSeconds: 1800, maximumMeters: 5000,
    structures: ['continuo_carrera'], interval: null, metric: 'volume' },
  { methodId: 'running_recovery', share: 0.06, maximumSeconds: 900, maximumMeters: 2500,
    structures: ['continuo_regenerativo'], interval: null, metric: 'volume' },
  { methodId: 'running_threshold', share: 0.04, maximumSeconds: 600, maximumMeters: 2000,
    structures: ['tempo_continuo', 'intervalos_carrera'], interval: { minimumSets: 2, maximumSets: 4, minimumRestSeconds: 60, maximumRestSeconds: 120 }, metric: 'work' },
  { methodId: 'running_vo2', share: 0.03, maximumSeconds: 480, maximumMeters: 1600,
    structures: ['intervalos_carrera'], interval: { minimumSets: 3, maximumSets: 5, minimumRestSeconds: 120, maximumRestSeconds: 180 }, metric: 'work' },
  { methodId: 'running_specific', share: 0.10, maximumSeconds: 1500, maximumMeters: 4000,
    structures: ['continuo_carrera'], interval: null, metric: 'volume' },
  { methodId: 'running_economy', share: null, maximumSeconds: null, maximumMeters: null,
    structures: ['tecnica_carrera'], interval: { minimumSets: 4, maximumSets: 6, minimumRestSeconds: 60, maximumRestSeconds: 120 }, metric: 'repetitions' },
] as const;
export const RUNNING_DOSE_POLICY_VERSION = 1;
export const RUNNING_METHOD_DOSE_POLICIES = definitions.map(policy => ({ ...policy,
  policyId: `${policy.methodId}_dose_v1`, version: RUNNING_DOSE_POLICY_VERSION,
  supportedEvidence: ['OBSERVED', 'DECLARED'] as const, fallback: 'UNRESOLVED' as const }));
export const RUNNING_DOSE_TARGET_LOWER_FRACTION = 0.8;
export const RUNNING_PREPARATION_MAXIMUM_SECONDS = 600;
export const RUNNING_ECONOMY_BOUT_SECONDS = { minimum: 10, maximum: 20 } as const;
