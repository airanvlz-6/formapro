import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { IntensityEvidence, IntensityTarget, MethodIntensityPolicy } from './methodIntensityAuthority';
import { prescriptionGenerationOptions } from './prescriptionDataSufficiency';
import { MOVEMENT_LIBRARY } from './movementLibrary';

type Metric = 'hr' | 'pace' | 'rpe';
export type IntensityDiagnostic = 'METHOD_INTENSITY_RESOLVED' | 'METHOD_INTENSITY_NO_CAPABILITY'
  | 'METHOD_INTENSITY_NO_REFERENCE' | 'METHOD_INTENSITY_REFERENCE_CONFLICT'
  | 'METHOD_INTENSITY_FALLBACK_RPE' | 'METHOD_INTENSITY_POLICY_UNRESOLVED';
export const INTENSITY_DIAGNOSTICS: readonly IntensityDiagnostic[] = ['METHOD_INTENSITY_RESOLVED',
  'METHOD_INTENSITY_NO_CAPABILITY', 'METHOD_INTENSITY_NO_REFERENCE', 'METHOD_INTENSITY_REFERENCE_CONFLICT',
  'METHOD_INTENSITY_FALLBACK_RPE', 'METHOD_INTENSITY_POLICY_UNRESOLVED'];
type DomainPolicy = {
  id: string; version: number; methodId: string; domain: string;
  compatiblePrimaryMetrics: readonly Metric[]; orderedMetricPreference: readonly Metric[];
  compatibleReferenceTypes: { hr: readonly string[]; pace: readonly string[] };
  perception: { value: number; max: number } | null;
  fallback: 'RPE' | 'UNRESOLVED'; structures: readonly string[];
  goalVariants?: Readonly<Record<string, { pace: readonly string[]; perception: { value: number; max: number } }>>;
  requirements: readonly string[]; provenance: readonly string[];
};
const requirements = ['canonical_resolved_reference', 'available_measurement_capability', 'exact_reference_no_range_derivation'] as const;
const provenance = ['olympiatoppen_2024_v2', 'hofmann_tschakert_2017', 'forge_c2_domain_decision_v1'] as const;
/** Sports knowledge lives here, never in the exact-target validator. See docs/c2-running-intensity-policies.md.
 * RPE bands are prescription guides, not measured thresholds or inferred personal zones. */
export const RUNNING_INTENSITY_POLICIES: readonly DomainPolicy[] = [
  { id: 'running_base_intensity', version: 1, methodId: 'running_base', domain: 'easy_aerobic',
    compatiblePrimaryMetrics: ['hr', 'pace', 'rpe'], orderedMetricPreference: ['hr', 'pace', 'rpe'],
    compatibleReferenceTypes: { hr: ['easyHr'], pace: ['easyPace'] }, perception: { value: 2, max: 3 },
    fallback: 'RPE', structures: ['continuo_carrera'], requirements, provenance },
  { id: 'running_threshold_intensity', version: 1, methodId: 'running_threshold', domain: 'individual_threshold',
    compatiblePrimaryMetrics: ['pace', 'hr', 'rpe'], orderedMetricPreference: ['pace', 'hr', 'rpe'],
    compatibleReferenceTypes: { hr: ['thresholdHr'], pace: ['thresholdPace'] }, perception: { value: 6, max: 7 },
    fallback: 'RPE', structures: ['intervalos_carrera', 'tempo_continuo'], requirements, provenance },
  { id: 'running_specific_intensity', version: 2, methodId: 'running_specific', domain: 'goal_specific_endurance',
    compatiblePrimaryMetrics: ['pace', 'rpe'], orderedMetricPreference: ['pace', 'rpe'],
    compatibleReferenceTypes: { hr: [], pace: [] }, perception: null, fallback: 'RPE', structures: ['continuo_carrera'],
    goalVariants: { '10k': { pace: ['10k'], perception: { value: 6, max: 7 } },
      half_marathon: { pace: ['halfMarathon'], perception: { value: 4, max: 5 } } }, requirements, provenance },
  { id: 'running_vo2_intensity', version: 1, methodId: 'running_vo2', domain: 'high_aerobic_interval',
    compatiblePrimaryMetrics: ['rpe'], orderedMetricPreference: ['rpe'],
    compatibleReferenceTypes: { hr: [], pace: [] }, perception: { value: 8, max: 9 },
    fallback: 'RPE', structures: ['intervalos_carrera'], requirements, provenance },
  { id: 'running_recovery_intensity', version: 1, methodId: 'running_recovery', domain: 'very_light_recovery',
    compatiblePrimaryMetrics: ['rpe'], orderedMetricPreference: ['rpe'],
    compatibleReferenceTypes: { hr: [], pace: [] }, perception: { value: 1, max: 2 },
    fallback: 'RPE', structures: ['continuo_regenerativo'], requirements, provenance },
  { id: 'running_economy_intensity', version: 1, methodId: 'running_economy', domain: 'technical_coordination',
    compatiblePrimaryMetrics: [], orderedMetricPreference: [], compatibleReferenceTypes: { hr: [], pace: [] },
    perception: null, fallback: 'UNRESOLVED', structures: ['tecnica_carrera'],
    requirements: ['movement_and_bout_semantics_required'], provenance },
];

const subjective = (id: string): IntensityEvidence => ({ kind: 'SUBJECTIVE', resolution: 'RESOLVED', confidence: 'declared',
  measurementBasis: 'UNKNOWN', source: id, inputs: [], algorithm: null, containsEstimatedData: false });
const evidenceRank = (e?: IntensityEvidence) => !e ? 3 : e.containsEstimatedData ? 2 : e.kind === 'DIRECT' ? 0 : e.kind === 'DERIVED' ? 1 : 3;
export function runningIntensityPolicy(c: AllowedTrainingContract): { policy?: MethodIntensityPolicy; diagnostics: IntensityDiagnostic[] } | null {
  if (c.intent?.kind !== 'adaptation' || c.discipline !== 'carrera') return null;
  const methodId = c.intent.methodId;
  const domain = RUNNING_INTENSITY_POLICIES.find(p => p.methodId === methodId);
  if (!domain) return null;
  const unresolved = { diagnostics: ['METHOD_INTENSITY_POLICY_UNRESOLVED'] as IntensityDiagnostic[] };
  const variant = domain.goalVariants?.[c.intent.goalId];
  const perception = variant?.perception ?? domain.perception;
  if (domain.fallback === 'UNRESOLVED' || !perception || (domain.goalVariants && !variant)
    || !c.allowedStructureIds.length || c.allowedStructureIds.some(id => !domain.structures.includes(id))) return unresolved;
  const movements = c.allowedMovementIds.filter(id => MOVEMENT_LIBRARY[id]?.movement_pattern === 'run').sort();
  if (!movements.length) return unresolved;
  const refs = c.doseContext?.references ?? [];
  const signals = c.doseContext?.sufficiency;
  const diagnostics = new Set<IntensityDiagnostic>();
  const targets: IntensityTarget[] = movements.map(movementId => {
    const executableIds = signals ? prescriptionGenerationOptions(signals, refs, [movementId], c.discipline)[0].executableReferenceIds : [];
    for (const metric of domain.orderedMetricPreference) {
      if (metric === 'rpe') break;
      const types = metric === 'pace' && variant ? variant.pace : domain.compatibleReferenceTypes[metric];
      const capability = metric === 'hr' ? 'capability.canMeasureHeartRate' : 'capability.canMeasurePace';
      if (types.length && signals?.signals[capability]?.state !== 'available') diagnostics.add('METHOD_INTENSITY_NO_CAPABILITY');
      for (const type of types) {
        const state = c.doseContext?.referenceResolution?.running[type];
        if (state === 'conflict') { diagnostics.add('METHOD_INTENSITY_REFERENCE_CONFLICT'); continue; }
        const ref = refs.filter(r => r.kind === 'running' && r.metric === type && r.unit === (metric === 'hr' ? 'bpm' : 'seconds_per_km')
          && (!r.intensityEvidence || r.intensityEvidence.resolution === 'RESOLVED'))
          .sort((a, b) => evidenceRank(a.intensityEvidence) - evidenceRank(b.intensityEvidence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
        if (!ref || state === 'unknown') { diagnostics.add('METHOD_INTENSITY_NO_REFERENCE'); continue; }
        if (!executableIds.includes(ref.id)) continue;
        return { movementId, primary: { kind: 'reference', referenceId: ref.id },
          evidence: structuredClone(ref.intensityEvidence ?? { kind: 'DIRECT', resolution: 'RESOLVED', confidence: 'unknown',
            measurementBasis: 'UNKNOWN', source: ref.source, inputs: [], algorithm: null, containsEstimatedData: false }),
          secondary: { metric: 'rpe', ...perception, purpose: 'perception_guide', evidence: subjective(domain.id) } };
      }
    }
    diagnostics.add('METHOD_INTENSITY_FALLBACK_RPE');
    if (!domain.orderedMetricPreference.some(m => m !== 'rpe') || variant?.pace.length === 0) diagnostics.add('METHOD_INTENSITY_NO_REFERENCE');
    return { movementId, primary: { kind: 'rpe', ...perception }, evidence: subjective(domain.id) };
  });
  diagnostics.add('METHOD_INTENSITY_RESOLVED');
  return { policy: { id: domain.id, version: domain.version, methodId: domain.methodId, scope: 'main', targets },
    diagnostics: [...diagnostics].sort() };
}
