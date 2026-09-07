import { MOVEMENT_LIBRARY } from './movementLibrary';
import { resolveDataSufficiency, type SufficiencyInput, type RequirementCheck, type SignalEvidence } from '../prescription/dataSufficiency';
import { referenceQuestionFields } from './prescriptionReferenceFields';
import { prescriptionQuestion } from './prescriptionQuestionRenderer';
export { referenceQuestionFields } from './prescriptionReferenceFields';
export { prescriptionQuestion } from './prescriptionQuestionRenderer';
import type { PrescriptionSignals, PrescriptionSignal } from '../athlete/prescriptionSignals';
import type { DoseReference } from './sessionDoseContext';

export type PrescriptionDataRequirement = { signal: string; reason: string; requiredFor: string;
  criticality: 'required' | 'preferred'; acceptableFallbacks: string[] };
export type PrescriptionQuestion = { id: string; signalIds: string[]; questionType: 'availability' | 'reference'; text: string };
export type PrescriptionDataSufficiency = { status: 'sufficient' | 'fallback_available' | 'missing_required_data';
  requirements: PrescriptionDataRequirement[]; resolvedSignals: { signal: string; source: string | null }[];
  missingSignals: { signal: string; state: string; reason: string }[];
  fallbacks: { signal: string; fallback: string; movementId?: string; referenceId?: string }[];
  questions: PrescriptionQuestion[]; diagnostics: { code: string; signal: string; reason: string }[] };
export type SufficiencyRequest = { movementId: string; discipline: string; intensity?: '1rm' | 'hr' | 'pace' | 'rpe' | 'rir';
  referenceId?: string; distance?: boolean; allowRpe?: boolean; allowPace?: boolean;
  /** IDs already restricted by scope, restrictions AND the same immutable intent/pattern. */
  authorizedAlternatives?: string[] };
const unknown: PrescriptionSignal = { state: 'unknown', source: null, updatedAt: null };

/** Adapter for the currently admitted movement/dose catalogs, NOT a closed enumeration in the core. */
export function movementPrescriptionRequirements(context: PrescriptionSignals, references: DoseReference[], request: SufficiencyRequest): SufficiencyInput {
  const checks: RequirementCheck[] = [];
  const evidence = (signal: string): SignalEvidence => ({ signal, ...(context.signals[signal] || unknown), answerType: 'availability' });
  const requireSignal = (signal: string, reason: string) => checks.push({
    requirement: { signal, reason, requiredFor: request.movementId, criticality: 'required', acceptableFallbacks: [] }, evidence: [evidence(signal)] });
  const movement = MOVEMENT_LIBRARY[request.movementId];
  if (!movement || !movement.discipline.some(discipline => discipline === request.discipline)) {
    checks.push({ requirement: { signal: 'movement.authorized', reason: 'movement_not_authorized', requiredFor: request.movementId,
      criticality: 'required', acceptableFallbacks: [] }, evidence: [{ signal: 'movement.authorized', ...unknown }] });
  } else {
    for (const group of movement.equipmentRequirements || movement.equipment.map(id => [id])) {
      const selected = group.find(id => evidence(`equipment.${id}`).state === 'available')
        || group.find(id => evidence(`equipment.${id}`).state !== 'unavailable') || group[0];
      requireSignal(`equipment.${selected}`, 'movement_equipment');
    }
    if (movement.technical_demand === 'alta' && (!movement.scalable || ['olympic_lift', 'inverted_locomotion'].includes(movement.movement_pattern)))
      requireSignal(`skill.${request.discipline}.advanced`, 'high_technical_demand_without_safe_unknown_level');
  }
  if (request.intensity && !['rpe', 'rir'].includes(request.intensity)) {
    const kind = request.intensity as '1rm' | 'hr' | 'pace';
    const id = `reference.${request.referenceId || (kind === '1rm' ? `1rm:${request.movementId}` : kind === 'hr' ? 'running:easyHr' : 'running:easyPace')}`;
    const ref = references.find(r => (!request.referenceId || r.id === request.referenceId) && (kind === '1rm'
      ? r.kind === '1rm' && r.movementId === request.movementId : r.kind === 'running' && r.unit === (kind === 'hr' ? 'bpm' : 'seconds_per_km')));
    const cap = kind === 'hr' ? 'capability.canMeasureHeartRate' : kind === 'pace' ? 'capability.canMeasurePace' : null;
    const referenceEvidence: SignalEvidence = { signal: id, state: ref ? 'available' : 'unknown', source: ref?.source || null,
      updatedAt: ref?.observedAt || null, ...(referenceQuestionFields[id] ? { answerType: 'reference' as const } : {}) };
    const known = !!ref && (!cap || evidence(cap).state === 'available');
    const fallbackOptions: NonNullable<RequirementCheck['fallbackOptions']> = [];
    // Domain knowledge: only corresponding intensities can replace one another, never an arbitrary pace.
    const paceMetric = ref?.metric === 'thresholdHr' ? 'thresholdPace' : ['easyHr', 'z2'].includes(ref?.metric || '') ? 'easyPace' : null;
    const pace = paceMetric ? references.find(r => r.metric === paceMetric && r.unit === 'seconds_per_km') : undefined;
    if (kind === 'hr' && request.allowPace && pace) fallbackOptions.push({ fallback: { signal: id, fallback: 'pace', referenceId: pace.id },
      evidence: [evidence('capability.canMeasurePace')] });
    if (request.allowRpe) fallbackOptions.push({ fallback: { signal: id, fallback: kind === '1rm' ? 'rpe' : 'duration_rpe' }, evidence: [] });
    checks.push({ requirement: { signal: id, reason: 'numeric_intensity', requiredFor: request.movementId,
      criticality: request.allowRpe || request.allowPace ? 'preferred' : 'required',
      acceptableFallbacks: [...(request.allowPace && kind === 'hr' ? ['pace'] : []), ...(request.allowRpe ? ['duration_rpe'] : [])] },
      evidence: [referenceEvidence, ...(!known && cap ? [evidence(cap)] : [])], fallbackOptions,
      reportFirstMissingOnly: true, missingReason: 'numeric_intensity_not_executable' });
    // Preserve existing public diagnostics/receipt representation for known measurement requirements.
    if (known && cap) requireSignal(cap, 'measure_numeric_intensity');
  }
  if (request.distance) {
    const id = 'capability.canMeasureDistance', missing = evidence(id).state !== 'available';
    if (missing && request.allowRpe) checks.push({ requirement: { signal: id, reason: 'distance_not_measurable', requiredFor: request.movementId,
      criticality: 'preferred', acceptableFallbacks: ['duration_rpe'] }, evidence: [evidence(id)],
      fallbackOptions: [{ fallback: { signal: id, fallback: 'duration_rpe' }, evidence: [] }] });
    else requireSignal(id, 'distance_not_measurable');
  }
  return { checks, alternatives: (request.authorizedAlternatives || [])
    .filter(id => id !== request.movementId && MOVEMENT_LIBRARY[id]?.movement_pattern === movement?.movement_pattern)
    .map(id => ({ fallback: { signal: 'movement', fallback: 'authorized_equipment_or_skill_alternative', movementId: id },
      reason: 'same_authorized_intent_and_pattern',
      input: movementPrescriptionRequirements(context, references, { ...request, movementId: id, referenceId: undefined, authorizedAlternatives: [] }) })) };
}

/** Backwards-compatible sports API. All sufficiency decisions execute through the shared core. */
export function resolvePrescriptionDataSufficiency(context: PrescriptionSignals, references: DoseReference[], request: SufficiencyRequest): PrescriptionDataSufficiency {
  const decision = resolveDataSufficiency(movementPrescriptionRequirements(context, references, request));
  return { status: decision.status,
    requirements: decision.requirements.filter(r => r.signal !== 'movement.authorized'),
    resolvedSignals: decision.resolvedSignals.map(e => ({ signal: e.signal, source: e.source })),
    missingSignals: decision.missingSignals, fallbacks: decision.fallbacks,
    questions: decision.questionRequirements.map(q => prescriptionQuestion(q.signalIds)), diagnostics: decision.diagnostics };
}

/** Explicit executable choices supplied to Builder; percentages/HR are preferred only when supported. */
export function prescriptionGenerationOptions(context: PrescriptionSignals, references: DoseReference[], movementIds: string[], discipline: string) {
  return movementIds.map(movementId => {
    const movement = MOVEMENT_LIBRARY[movementId];
    const enduranceDose = ['run', 'cyclic'].includes(movement.movement_pattern);
    // Intensity remains a Builder choice within 3C. No new zone or adaptation-specific intensity is invented here.
    const decision = resolvePrescriptionDataSufficiency(context, references, { movementId, discipline,
      intensity: enduranceDose ? 'rpe' : '1rm', allowRpe: true });
    const executableReferenceIds = references.filter(r => r.kind === '1rm' ? r.movementId === movementId
      : enduranceDose && context.signals[r.unit === 'bpm' ? 'capability.canMeasureHeartRate' : 'capability.canMeasurePace']?.state === 'available').map(r => r.id);
    return { movementId, decision, executableReferenceIds, distanceAvailable: context.signals['capability.canMeasureDistance']?.state === 'available' };
  });
}
