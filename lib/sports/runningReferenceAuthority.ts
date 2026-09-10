import { createHash } from 'node:crypto';
import { admittedHrZones, type HrZoneSystem } from '../athlete/hrZoneBootstrap';
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
  hrZoneSystem?: HrZoneSystem;
  entries: RunningReferenceEntry[]; references: DoseReference[]; sourceDigest: string;
  limitations: readonly string[] };
type Input = { running: { byMetric: Record<string, Resolution<RunningReference>> }; prescriptionSignals: { maxHrMethod: string }; hrZoneBootstrap?: unknown };
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
  const hrZoneSystem = admittedHrZones(input.running, input.hrZoneBootstrap);
  const references = compileReferences(entries, hrZoneSystem ?? undefined);
  return { version: 1, policy: 'running_reference_v1', entries, references, sourceDigest: hash(entries),
    ...(hrZoneSystem ? { hrZoneSystem } : {}),
    limitations: ['race_recency_and_current_vs_personal_best_not_established', 'no_race_prediction_policy',
      'hrr_requires_confirmed_zone_system', 'no_hrmax_estimation', 'economy_requires_execution_guidance'] };
}
function compileReferences(entries: RunningReferenceEntry[], system?: HrZoneSystem): DoseReference[] {
  const refs: DoseReference[] = entries.flatMap(e => {
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
  // Explicit running_base compatibility; generic Z2 is never renamed easyHr.
  if (system) refs.push({ id: 'running:confirmedBaseZone', kind: 'running', metric: 'confirmedBaseZone', unit: 'bpm',
    value: { min: system.zones[1].lower, max: system.zones[1].upper }, source: `hr_zone_system:${system.origin}:${system.proposalDigest}`,
    observedAt: system.confirmedAt, intensityEvidence: { kind: system.containsEstimatedData ? 'ESTIMATED' : 'DIRECT', resolution: 'RESOLVED',
      confidence: system.containsEstimatedData ? 'estimated' : 'declared', measurementBasis: system.containsEstimatedData ? 'ESTIMATED' : 'DECLARED',
      source: system.origin, inputs: [{ referenceId: system.zoneSystemId, source: system.inputDigest, containsEstimatedData: system.containsEstimatedData }],
      algorithm: { id: 'running_base_zone2_compatibility', version: 1 }, containsEstimatedData: system.containsEstimatedData,
      zoneCompatibility: { zoneSystemId: system.zoneSystemId, sourceZone: 'Z2', policyId: 'running_base_zone2_compatibility', version: 1,
        range: { min: system.zones[1].lower, max: system.zones[1].upper }, origin: system.origin, proposalDigest: system.proposalDigest } } });
  return refs;
}
/** Recheck arithmetic/projection and binding on the authenticated snapshot, never against new athlete data. */
export function validRunningReferenceAuthority(a: RunningReferenceAuthority, references: DoseReference[]): boolean {
  if (a?.hrZoneSystem) {
    if (!Array.isArray(a.entries) || a.entries.some(e => !e)) return false;
    const running = { byMetric: Object.fromEntries(a.entries.map(e => [e.type, { reason: e.status === 'RESOLVED' ? 'resolved' : 'unknown',
      resolved: e.evidence ? { value: { value: e.value }, source: e.evidence.source } : null }])) };
    const admitted = admittedHrZones(running, a.hrZoneSystem);
    if (!admitted || JSON.stringify(admitted) !== JSON.stringify(a.hrZoneSystem)) return false;
  }
  return !!a && a.version === 1 && a.policy === 'running_reference_v1' && Array.isArray(a.entries)
    && a.entries.length === RUNNING_REFERENCE_METRICS.length
    && a.entries.every((e, i) => e.type === RUNNING_REFERENCE_METRICS[i] && e.referenceId === `running:evidence:${e.type}`
      && ['RESOLVED', 'UNRESOLVED', 'CONFLICT'].includes(e.status)
      && (e.status === 'RESOLVED' ? !!e.evidence && e.value !== null : e.evidence === null && e.value === null))
    && a.sourceDigest === hash(a.entries) && JSON.stringify(a.references) === JSON.stringify(compileReferences(a.entries, a.hrZoneSystem))
    && JSON.stringify(references.filter(r => r.kind === 'running')) === JSON.stringify(a.references);
}
