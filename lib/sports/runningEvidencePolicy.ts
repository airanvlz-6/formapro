/** Reviewed claims and operational choices, not a table of universal workouts. */
export type EvidenceLevel = 'DIRECT_EVIDENCE' | 'EVIDENCE_INFORMED_POLICY' | 'COACHING_HEURISTIC' | 'UNSUPPORTED';
export type RunningEvidencePolicy = {
  id: string; version: number; status: 'APPROVED' | 'DRAFT'; discipline: 'carrera';
  goals: readonly string[]; population: readonly string[]; exclusions: readonly string[];
  evidenceLevel: EvidenceLevel; sources: readonly { id: string; url: string; claim: string; limitations: string }[];
  methods: readonly { id: string; role: 'FOUNDATIONAL' | 'COMPLEMENTARY' | 'CONTEXTUAL'; structures: readonly string[];
    dimensions: readonly string[]; intensityOwner: 'C2' | 'EXISTING_SUPPORT_CONTRACT' }[];
  operationalDecisions: readonly string[]; missingData: string; limitations: readonly string[];
};
export const HM_EVIDENCE_POLICY_V1: RunningEvidencePolicy = {
  id: 'hm_evidence_policy', version: 1, status: 'APPROVED', discipline: 'carrera', goals: ['half_marathon'],
  population: ['running_experience_preserved', 'individual_applicability_required'],
  exclusions: ['incompatible_restrictions', 'unsupported_numeric_derivation'], evidenceLevel: 'EVIDENCE_INFORMED_POLICY',
  sources: [
    { id: 'PMID:23752040', url: 'https://pubmed.ncbi.nlm.nih.gov/23752040/', claim: 'Low-intensity-emphasized distribution is relevant to endurance preparation.',
      limitations: 'Recreational runners, 10K outcome; not an exact HM distribution or first-dose prescription.' },
    { id: 'PMID:37163550', url: 'https://pubmed.ncbi.nlm.nih.gov/37163550/', claim: 'Endurance taper evidence includes <=21 days and 41–60% volume reduction with maintained intensity/frequency.',
      limitations: 'Aggregate endurance evidence; not an individual reduction selector, nor permission to infer baseline volume.' },
  ],
  methods: [
    { id: 'running_base', role: 'FOUNDATIONAL', structures: ['continuo_carrera'], dimensions: ['total_duration'], intensityOwner: 'C2' },
    { id: 'running_long_run', role: 'COMPLEMENTARY', structures: ['continuo_carrera'], dimensions: ['total_duration'], intensityOwner: 'C2' },
    { id: 'running_threshold', role: 'COMPLEMENTARY', structures: ['tempo_continuo', 'intervalos_carrera'], dimensions: ['main_work_duration', 'efforts', 'bout_duration', 'recovery_duration', 'recovery_mode'], intensityOwner: 'C2' },
    { id: 'running_vo2', role: 'COMPLEMENTARY', structures: ['intervalos_carrera'], dimensions: ['efforts', 'bout_duration', 'main_work_duration', 'recovery_duration', 'recovery_mode'], intensityOwner: 'C2' },
    { id: 'running_recovery', role: 'CONTEXTUAL', structures: ['continuo_regenerativo'], dimensions: ['total_duration'], intensityOwner: 'C2' },
    { id: 'runner_support_strength', role: 'COMPLEMENTARY', structures: ['fuerza_corredor_series'], dimensions: ['existing_support_contract'], intensityOwner: 'EXISTING_SUPPORT_CONTRACT' },
  ],
  operationalDecisions: ['low_intensity_predominant_no_fixed_percentage', 'quality_complementary_not_required_every_week',
    'vo2_optional_context_dependent', 'experience_is_not_numeric_coverage', 'confirmed_current_method_baseline_not_execution',
    'no_automatic_numeric_progression', 'recovery_running_easy_or_rest_context_dependent'],
  missingData: 'TARGETED_CURRENT_METHOD_BASELINE_OR_PRODUCT_POLICY_DECISION_REQUIRED',
  limitations: ['Source claims do not individually validate every listed method or operational choice.',
    'No first-dose selector for an athlete without a current baseline.', 'No readiness multipliers.',
    'No universal preparation or cooldown budget.', 'No numeric taper selector.'],
};
export function selectRunningEvidencePolicy(goal: string | null, eventGoal?: string | null,
  policies: readonly RunningEvidencePolicy[] = [HM_EVIDENCE_POLICY_V1]) {
  const matches = policies.filter(p => p.status === 'APPROVED' && p.evidenceLevel !== 'UNSUPPORTED'
    && p.discipline === 'carrera' && goal !== null && p.goals.includes(goal) && (!eventGoal || eventGoal === goal));
  return matches.length === 1 ? matches[0] : null;
}
export function runningPolicyGuidance(goal: string | null, phase: string, daysRemaining: number | null) {
  const policy = selectRunningEvidencePolicy(goal);
  return policy ? { policy: { id: policy.id, version: policy.version }, lowIntensity: 'PREDOMINANT' as const,
    quality: 'COMPLEMENTARY_NOT_REQUIRED' as const, numericProgressionAuthorized: false as const,
    taper: ['TAPER', 'RACE_WEEK'].includes(phase) && daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 21
      ? { evidenceVolumeReductionPercent: { minimum: 41, maximum: 60 }, selectedReduction: null,
        reason: 'INDIVIDUAL_BASELINE_AND_SELECTION_REQUIRED', preserveIntensity: true, preserveFrequencyWhenAppropriate: true } : null } : null;
}
