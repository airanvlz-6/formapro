import { createHash } from 'node:crypto';
import type { Evidence, Resolution, RunningReference } from '../athlete/athletePrescriptionContext';
import type { IntensityEvidence } from './methodIntensityAuthority';
import type { DoseReference } from './sessionDoseContext';

export const RUNNING_REFERENCE_METRICS = ['easyPace', 'thresholdPace', 'easyHr', 'thresholdHr', 'z1', 'z2', 'z3', 'z4', 'z5',
  '5k', '10k', 'halfMarathon', 'marathon', 'maxHr', 'restingHr', 'vo2max', 'weeklyDistance'] as const;
const distances: Readonly<Record<string, number>> = { '5k': 5, '10k': 10, halfMarathon: 21.0975, marathon: 42.195 };
const executableMetrics = new Set(['easyPace', 'thresholdPace', 'easyHr', 'thresholdHr', 'z1', 'z2', 'z3', 'z4', 'z5']);
export type RunningReferenceEntry = {
  referenceId: string; type: string; status: 'RESOLVED' | 'UNRESOLVED' | 'CONFLICT';
  value: RunningReference['value'] | null; unit: RunningReference['unit'] | null;
  performanceRole: RunningReference['performanceRole'] | 'NOT_PERFORMANCE';
  observedAt: string | null; freshness: 'NOT_ASSESSED'; evidence: IntensityEvidence | null;
};
export type RunningReferenceAuthority = { version: 1; policy: 'running_reference_v1';
  entries: RunningReferenceEntry[]; references: DoseReference[]; sourceDigest: string;
  limitations: readonly string[] };
type Input = { running: { byMetric: Record<string, Resolution<RunningReference>> }; prescriptionSignals: { maxHrMethod: string } };
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function directEvidence(e: Evidence<RunningReference>, estimated: boolean): IntensityEvidence {
  return { kind: estimated ? 'ESTIMATED' : 'DIRECT', resolution: 'RESOLVED', confidence: estimated ? 'estimated' : e.authority,
    measurementBasis: estimated ? 'ESTIMATED' : 'DECLARED', source: e.source, inputs: [], algorithm: null, containsEstimatedData: estimated };
}
/** Pure canonical evidence authority. No device, method, goal text, RPE, DB or observed-session inference. */
export function resolveRunningReferences(input: Input): RunningReferenceAuthority {
  const entries: RunningReferenceEntry[] = RUNNING_REFERENCE_METRICS.map(type => {
    const r = input.running.byMetric[type], e = r?.reason === 'resolved' ? r.resolved : null;
    return { referenceId: `running:evidence:${type}`, type,
      status: r?.reason === 'conflict' ? 'CONFLICT' : e ? 'RESOLVED' : 'UNRESOLVED', value: e?.value.value ?? null,
      unit: e?.value.unit ?? null, performanceRole: Object.hasOwn(distances, type) ? e?.value.performanceRole ?? 'UNCLASSIFIED_PERFORMANCE' : 'NOT_PERFORMANCE',
      observedAt: e?.observedAt ?? null, freshness: 'NOT_ASSESSED',
      evidence: e ? directEvidence(e, type === 'maxHr' && input.prescriptionSignals.maxHrMethod === 'estimated') : null };
  });
  const references = compileReferences(entries);
  return { version: 1, policy: 'running_reference_v1', entries, references, sourceDigest: hash(entries),
    limitations: ['race_recency_and_current_vs_personal_best_not_established', 'no_race_prediction_policy',
      'no_hrr_zone_policy', 'no_hrmax_estimation', 'economy_requires_execution_guidance'] };
}
function compileReferences(entries: RunningReferenceEntry[]): DoseReference[] {
  return entries.flatMap(e => {
    if (e.status !== 'RESOLVED' || !e.evidence || e.value === null || e.performanceRole === 'TARGET_PERFORMANCE') return [];
    const distance = distances[e.type];
    if (distance && e.unit === 'seconds' && typeof e.value === 'number') {
      return [{ id: `running:${e.type}`, kind: 'running' as const, metric: e.type, value: e.value / distance,
        unit: 'seconds_per_km' as const, source: e.evidence.source, observedAt: e.observedAt,
        intensityEvidence: { ...e.evidence, kind: 'DERIVED' as const,
          algorithm: { id: ['5k', '10k'].includes(e.type) ? 'race_time_divided_by_kilometres' : 'race_time_divided_by_distance', version: 1 },
          inputs: [{ referenceId: e.referenceId, source: e.evidence.source, containsEstimatedData: e.evidence.containsEstimatedData }] } }];
    }
    if (!executableMetrics.has(e.type) || !['bpm', 'seconds_per_km'].includes(e.unit!)) return [];
    return [{ id: `running:${e.type}`, kind: 'running' as const, metric: e.type, value: e.value,
      unit: e.unit as 'bpm' | 'seconds_per_km', source: e.evidence.source, observedAt: e.observedAt, intensityEvidence: e.evidence }];
  });
}
/** Recheck arithmetic/projection and binding on the authenticated snapshot, never against new athlete data. */
export function validRunningReferenceAuthority(a: RunningReferenceAuthority, references: DoseReference[]): boolean {
  return !!a && a.version === 1 && a.policy === 'running_reference_v1' && Array.isArray(a.entries)
    && a.entries.length === RUNNING_REFERENCE_METRICS.length
    && a.entries.every((e, i) => e.type === RUNNING_REFERENCE_METRICS[i] && e.referenceId === `running:evidence:${e.type}`
      && ['RESOLVED', 'UNRESOLVED', 'CONFLICT'].includes(e.status)
      && (e.status === 'RESOLVED' ? !!e.evidence && e.value !== null : e.evidence === null && e.value === null))
    && a.sourceDigest === hash(a.entries) && JSON.stringify(a.references) === JSON.stringify(compileReferences(a.entries))
    && JSON.stringify(references.filter(r => r.kind === 'running')) === JSON.stringify(a.references);
}
