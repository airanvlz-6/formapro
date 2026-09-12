import { createHash } from 'node:crypto';
import { runningEventMethodAllowed } from './runningEventPreparation';
import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { DoseIntensity } from './sessionDose';
import type { StructuredSessionProposal } from './structuredSession';
import { checkDoseExtension } from './sessionDose';
import { prescriptionGenerationOptions } from './prescriptionDataSufficiency';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { runningIntensityPolicy, runningIntensityChoices, INTENSITY_DIAGNOSTICS, type IntensityDiagnostic } from './runningIntensityPolicies';

export type IntensityEvidence = {
  zoneCompatibility?: { zoneSystemId: string; sourceZone: string; policyId: string; version: number;
    range: { min: number; max: number }; origin: string; proposalDigest: string };
  kind: 'DIRECT' | 'DERIVED' | 'ESTIMATED' | 'SUBJECTIVE';
  resolution: 'RESOLVED' | 'UNRESOLVED';
  confidence: 'declared' | 'recorded' | 'estimated' | 'unknown';
  measurementBasis: 'MEASURED' | 'ESTIMATED' | 'DECLARED' | 'UNKNOWN';
  source: string;
  inputs: { referenceId: string; source: string; containsEstimatedData: boolean }[];
  algorithm: { id: string; version: number } | null;
  containsEstimatedData: boolean;
};
export type IntensityTarget = { movementId: string; primary: DoseIntensity; evidence: IntensityEvidence;
  secondary?: { metric: 'rpe' | 'rir'; value: number; max?: number; purpose: 'perception_guide'; evidence: IntensityEvidence } };
/** Domain expression candidates retain exact references. Historical contracts impose complete targets;
 * coach contracts publish metric choices and treat subjective bands as guidance. Main scope is explicit. */
export type MethodIntensityPolicy = { id: string; version: number; methodId: string; scope: 'main'; targets: IntensityTarget[] };
export type MethodIntensityAuthority = { version: 1 | 2; methodId: string | null; scope: 'main'; sourceDigest: string;
  decisionAuthority?: 'coach'; choices?: IntensityTarget[];
  diagnostics?: IntensityDiagnostic[] } & (
  { status: 'UNRESOLVED'; reason: 'NO_METHOD_POLICY' | 'POLICY_NOT_EXECUTABLE'; policy: null; targets: [] }
  | { status: 'RESOLVED'; reason: 'AUTHORIZED_POLICY'; policy: { id: string; version: number }; targets: IntensityTarget[] });

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceDigest = (c: AllowedTrainingContract, version: 1 | 2 = 1) => digest({ intent: c.intent ?? null, movements: c.allowedMovementIds,
  references: c.doseContext?.references ?? [], signals: c.doseContext?.sufficiency ?? null,
  ...(c.runningEventPreparation ? {weeklyEligibility:c.runningEventPreparation.constraints,decisionDigest:c.runningEventPreparation.decisionDigest} : {}),
  ...(version === 2 ? { structures: c.allowedStructureIds, referenceResolution: c.doseContext?.referenceResolution ?? null } : {}) });

function validEvidence(e: IntensityEvidence): boolean {
  return !!e && ['DIRECT', 'DERIVED', 'ESTIMATED', 'SUBJECTIVE'].includes(e.kind)
    && ['RESOLVED', 'UNRESOLVED'].includes(e.resolution) && ['declared', 'recorded', 'estimated', 'unknown'].includes(e.confidence)
    && ['MEASURED', 'ESTIMATED', 'DECLARED', 'UNKNOWN'].includes(e.measurementBasis)
    && typeof e.source === 'string' && typeof e.containsEstimatedData === 'boolean'
    && Array.isArray(e.inputs) && e.inputs.every(i => typeof i.referenceId === 'string' && typeof i.source === 'string' && typeof i.containsEstimatedData === 'boolean')
    && (e.algorithm === null || !!e.algorithm && typeof e.algorithm.id === 'string' && Number.isSafeInteger(e.algorithm.version) && e.algorithm.version > 0)
    && (e.kind !== 'DERIVED' || !!e.algorithm && e.inputs.length > 0)
    && (e.kind !== 'ESTIMATED' || e.containsEstimatedData)
    && (e.measurementBasis !== 'ESTIMATED' || e.containsEstimatedData)
    && (!e.inputs.some(i => i.containsEstimatedData) || e.containsEstimatedData);
}
function executable(c: AllowedTrainingContract, target: IntensityTarget): boolean {
  if (!target || !c.allowedMovementIds.includes(target.movementId) || !target.primary || checkDoseExtension({ intensity: target.primary }).length
    || !validEvidence(target.evidence) || target.evidence.resolution !== 'RESOLVED') return false;
  const i = target.primary;
  const cyclic = ['run', 'cyclic'].includes(MOVEMENT_LIBRARY[target.movementId]?.movement_pattern);
  if (i.kind === 'rir' && cyclic) return false;
  if ('referenceId' in i) {
    const dc = c.doseContext;
    if (!dc?.sufficiency) return false;
    const options = prescriptionGenerationOptions(dc.sufficiency, dc.references, [target.movementId], c.discipline)[0];
    const ref = dc.references.find(r => r.id === i.referenceId);
    if (!options.executableReferenceIds.includes(i.referenceId) || (i.kind === 'percent_1rm' ? ref?.kind !== '1rm' : ref?.kind !== 'running')) return false;
  }
  const secondary = target.secondary;
  return !secondary || ['rpe', 'rir'].includes(secondary.metric) && !(cyclic && secondary.metric === 'rir') && secondary.purpose === 'perception_guide'
    && !checkDoseExtension({ intensity: { kind: secondary.metric, value: secondary.value, ...(secondary.max === undefined ? {} : { max: secondary.max }) } }).length
    && validEvidence(secondary.evidence) && secondary.evidence.kind === 'SUBJECTIVE' && secondary.evidence.resolution === 'RESOLVED';
}
/** Optional policy argument is a server/domain composition boundary, never a Builder input. */
export function resolveMethodIntensity(c: AllowedTrainingContract, policy?: MethodIntensityPolicy): MethodIntensityAuthority {
  const methodId = c.intent?.kind === 'adaptation' ? c.intent.methodId : null;
  const domain = policy ? null : runningIntensityPolicy(c);
  const candidate = policy ?? domain?.policy;
  const selected = candidate && c.runningEventPreparation?.constraints.longRun === 'FORBIDDEN'
    ? {...candidate,targets:candidate.targets.filter(t=>t.movementId!=='rodaje_largo')} : candidate;
  const version = domain ? 2 as const : 1 as const;
  const base = { version, methodId, scope: 'main' as const, sourceDigest: sourceDigest(c, version),
    ...(c.doseContext?.sessionDecisionAuthority === 'coach' && domain ? { decisionAuthority: 'coach' as const, choices: runningIntensityChoices(c)
      .filter(t => c.runningEventPreparation?.constraints.longRun !== 'FORBIDDEN' || t.movementId !== 'rodaje_largo') } : {}),
    ...(domain ? { diagnostics: domain.diagnostics } : {}) };
  if(c.runningEventPreparation && c.discipline==='carrera' && (!methodId || !runningEventMethodAllowed(c.runningEventPreparation,methodId)))
    return {...base,status:'UNRESOLVED',reason:'POLICY_NOT_EXECUTABLE',policy:null,targets:[]};
  if (!selected) return { ...base, status: 'UNRESOLVED', reason: domain ? 'POLICY_NOT_EXECUTABLE' : 'NO_METHOD_POLICY', policy: null, targets: [] };
  if (selected.methodId !== methodId || selected.scope !== 'main' || !selected.id || !Number.isSafeInteger(selected.version) || selected.version < 1
    || !selected.targets.length || new Set(selected.targets.map(t => t.movementId)).size !== selected.targets.length || !selected.targets.every(t => executable(c, t)))
    return { ...base, ...(domain ? { diagnostics: ['METHOD_INTENSITY_POLICY_UNRESOLVED'] as IntensityDiagnostic[] } : {}),
      status: 'UNRESOLVED', reason: 'POLICY_NOT_EXECUTABLE', policy: null, targets: [] };
  return { ...base, status: 'RESOLVED', reason: 'AUTHORIZED_POLICY', policy: { id: selected.id, version: selected.version },
    targets: structuredClone(base.decisionAuthority ? selected.targets.map(({ secondary: _guide, ...target }) => target) : selected.targets) };
}
export function validMethodIntensity(c: AllowedTrainingContract): boolean {
  const a = c.intensityAuthority;
  if (a === undefined) return true; // Historical receipts have no C1 extension.
  if (a?.decisionAuthority === 'coach' && (c.doseContext?.sessionDecisionAuthority !== 'coach'
    || digest(a) !== digest(resolveMethodIntensity(c)))) return false;
  if (a?.choices && a.decisionAuthority !== 'coach') return false;
  if (!a || ![1, 2].includes(a.version) || a.scope !== 'main' || a.sourceDigest !== sourceDigest(c, a.version)
    || a.methodId !== (c.intent?.kind === 'adaptation' ? c.intent.methodId : null)) return false;
  if (a.version === 2 && (!Array.isArray(a.diagnostics) || !a.diagnostics.length || a.diagnostics.length > INTENSITY_DIAGNOSTICS.length
    || a.diagnostics.some(code => !INTENSITY_DIAGNOSTICS.includes(code)))) return false;
  if (a.status === 'UNRESOLVED') return ['NO_METHOD_POLICY', 'POLICY_NOT_EXECUTABLE'].includes(a.reason) && a.policy === null && Array.isArray(a.targets) && a.targets.length === 0;
  return a.status === 'RESOLVED' && a.reason === 'AUTHORIZED_POLICY' && !!a.methodId && !!a.policy?.id && Number.isSafeInteger(a.policy.version) && a.policy.version > 0
    && Array.isArray(a.targets) && a.targets.length > 0 && new Set(a.targets.map(t => t.movementId)).size === a.targets.length && a.targets.every(t => executable(c, t));
}
export function validateMethodIntensity(c: AllowedTrainingContract, p: StructuredSessionProposal): string[] {
  if (!validMethodIntensity(c)) return ['METHOD_INTENSITY_AUTHORITY_INVALID'];
  const a = c.intensityAuthority;
  if (!a || a.status === 'UNRESOLVED') return [];
  return p.blocks.filter(b => b.blockType === a.scope).flatMap(b => b.movements.flatMap(m => {
    const expected = a.targets.find(t => t.movementId === m.movementId)?.primary;
    const actual = m.prescription.intensity;
    if (a.decisionAuthority === 'coach') {
      const compatible = a.choices?.filter(t => t.movementId === m.movementId) ?? [];
      return actual && compatible.some(t => actual.kind === 'rpe' ? t.primary.kind === 'rpe'
        && !checkDoseExtension({ intensity: actual }).length : Object.keys(t.primary).length === Object.keys(actual).length
          && Object.entries(t.primary).every(([key, value]) => (actual as unknown as Record<string, unknown>)[key] === value))
        ? [] : ['METHOD_INTENSITY_OUTSIDE_DOMAIN'];
    }
    const same = expected && actual && Object.keys(expected).length === Object.keys(actual).length
      && Object.entries(expected).every(([k, v]) => (actual as unknown as Record<string, unknown>)[k] === v);
    return same ? [] : ['METHOD_INTENSITY_OUTSIDE_DOMAIN'];
  }));
}
