import { MOVEMENT_LIBRARY } from './movementLibrary';
import type { PrescriptionSignals, PrescriptionSignal } from '../athlete/prescriptionSignals';
import type { DoseReference } from './sessionDoseContext';

export type PrescriptionDataRequirement = { signal: string; reason: string; requiredFor: string;
  criticality: 'required' | 'preferred'; acceptableFallbacks: string[] };
export type PrescriptionQuestion = { id: string; signalIds: string[]; questionType: 'availability' | 'reference'; text: string };
export const referenceQuestionFields: Record<string, string> = {
  'reference.running:easyHr': 'fc_suave', 'reference.running:thresholdHr': 'umbral_fc',
  'reference.running:easyPace': 'ritmo_z2', 'reference.running:thresholdPace': 'ritmo_umbral',
  ...Object.fromEntries([1,2,3,4,5].map(n => [`reference.running:z${n}`, `z${n}_fc`])),
  ...Object.fromEntries(Object.keys(MOVEMENT_LIBRARY).map(id => [`reference.1rm:${id}`, `${id}_1rm`])),
};
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
const labels: Record<string, string> = { barra: 'barra con discos', rack: 'rack', mancuerna: 'mancuernas', banco: 'banco',
  barra_dominadas: 'barra de dominadas', ski_erg: 'SkiErg', remo: 'remo', canMeasureHeartRate: 'medir la frecuencia cardíaca',
  canMeasurePace: 'medir el ritmo', canMeasureDistance: 'medir la distancia', advanced: 'experiencia avanzada en esta disciplina' };
export function prescriptionQuestion(signals: string[]): PrescriptionQuestion {
  const ids = [...new Set(signals)].sort();
  if (ids.length === 1 && referenceQuestionFields[ids[0]]) return { id: `prescription:${ids[0]}`, signalIds: ids, questionType: 'reference',
    text: `Esta dosis necesita una referencia declarada de ${ids[0].replace('reference.', '').replaceAll('_', ' ')}. Indica el valor conocido con unidades (kg, ppm o min/km); si no lo conoces, indica «no lo sé» para solicitar otra dosis.` };
  return { id: `prescription:${ids.join('+')}`, signalIds: ids, questionType: 'availability',
    text: `Para ajustar esta sesión necesito confirmar: ${ids.map(s => labels[s.split('.').at(-1)!] || s.split('.').at(-1)!.replaceAll('_', ' ')).join(' y ')}. ¿Dispones habitualmente de ello?` };
}

/** One decision authority. No dose generation, invented references, scope expansion or profile score. */
export function resolvePrescriptionDataSufficiency(context: PrescriptionSignals, references: DoseReference[], request: SufficiencyRequest): PrescriptionDataSufficiency {
  const requirements: PrescriptionDataRequirement[] = [], resolvedSignals: PrescriptionDataSufficiency['resolvedSignals'] = [],
    missingSignals: PrescriptionDataSufficiency['missingSignals'] = [], fallbacks: PrescriptionDataSufficiency['fallbacks'] = [];
  const critical: string[] = [];
  const signal = (id: string) => context.signals[id] || unknown;
  const requireSignal = (id: string, reason: string) => {
    requirements.push({ signal: id, reason, requiredFor: request.movementId, criticality: 'required', acceptableFallbacks: [] });
    const s = signal(id);
    if (s.state === 'available') resolvedSignals.push({ signal: id, source: s.source });
    else { missingSignals.push({ signal: id, state: s.state, reason }); critical.push(id); }
  };
  const movement = MOVEMENT_LIBRARY[request.movementId];
  if (!movement || !movement.discipline.includes(request.discipline as 'box')) {
    critical.push('movement.authorized'); missingSignals.push({ signal: 'movement.authorized', state: 'unknown', reason: 'movement_not_authorized' });
  } else {
    for (const group of movement.equipmentRequirements || movement.equipment.map(id => [id])) {
      const selected = group.find(id => signal(`equipment.${id}`).state === 'available');
      if (selected) requireSignal(`equipment.${selected}`, 'movement_equipment');
      else {
        // Ask only for one viable ANY branch; never ask for every alternative implement.
        const id = group.find(id => signal(`equipment.${id}`).state !== 'unavailable') || group[0];
        requireSignal(`equipment.${id}`, 'movement_equipment');
      }
    }
    if (movement.technical_demand === 'alta' && (!movement.scalable || ['olympic_lift', 'inverted_locomotion'].includes(movement.movement_pattern)))
      requireSignal(`skill.${request.discipline}.advanced`, 'high_technical_demand_without_safe_unknown_level');
  }
  const usable = (kind: '1rm' | 'hr' | 'pace', id?: string) => references.find(r => (!id || r.id === id)
    && (kind === '1rm' ? r.kind === '1rm' && r.movementId === request.movementId : r.kind === 'running' && r.unit === (kind === 'hr' ? 'bpm' : 'seconds_per_km')));
  if (request.intensity && !['rpe', 'rir'].includes(request.intensity)) {
    const kind = request.intensity as '1rm' | 'hr' | 'pace', id = `reference.${request.referenceId || (kind === '1rm' ? `1rm:${request.movementId}` : kind === 'hr' ? 'running:easyHr' : 'running:easyPace')}`;
    const ref = usable(kind, request.referenceId), cap = kind === 'hr' ? 'capability.canMeasureHeartRate' : kind === 'pace' ? 'capability.canMeasurePace' : null;
    const known = !!ref && (!cap || signal(cap).state === 'available');
    requirements.push({ signal: id, reason: 'numeric_intensity', requiredFor: request.movementId, criticality: request.allowRpe || request.allowPace ? 'preferred' : 'required',
      acceptableFallbacks: [...(request.allowPace && kind === 'hr' ? ['pace'] : []), ...(request.allowRpe ? ['duration_rpe'] : [])] });
    if (known) { resolvedSignals.push({ signal: id, source: ref!.source }); if (cap) requireSignal(cap, 'measure_numeric_intensity'); }
    else {
      missingSignals.push({ signal: !ref ? id : cap!, state: !ref ? 'unknown' : signal(cap!).state, reason: 'numeric_intensity_not_executable' });
      // Only semantically corresponding pace references: no arbitrary threshold pace for easy work.
      const paceMetric = ref?.metric === 'thresholdHr' ? 'thresholdPace' : ['easyHr', 'z2'].includes(ref?.metric || '') ? 'easyPace' : null;
      const pace = paceMetric ? references.find(r => r.metric === paceMetric && r.unit === 'seconds_per_km') : undefined;
      if (kind === 'hr' && request.allowPace && pace && signal('capability.canMeasurePace').state === 'available')
        fallbacks.push({ signal: id, fallback: 'pace', referenceId: pace.id });
      else if (request.allowRpe) fallbacks.push({ signal: id, fallback: kind === '1rm' ? 'rpe' : 'duration_rpe' });
      else { if (!ref) critical.push(id); if (cap && signal(cap).state !== 'available') critical.push(cap); }
    }
  }
  if (request.distance) {
    const cap = signal('capability.canMeasureDistance');
    if (cap.state !== 'available' && request.allowRpe) {
      requirements.push({ signal: 'capability.canMeasureDistance', reason: 'distance_not_measurable', requiredFor: request.movementId,
        criticality: 'preferred', acceptableFallbacks: ['duration_rpe'] });
      missingSignals.push({ signal: 'capability.canMeasureDistance', state: cap.state, reason: 'distance_not_measurable' });
      fallbacks.push({ signal: 'capability.canMeasureDistance', fallback: 'duration_rpe' });
    } else requireSignal('capability.canMeasureDistance', 'distance_not_measurable');
  }
  if (critical.length && request.authorizedAlternatives?.length) {
    for (const id of request.authorizedAlternatives) {
      if (id === request.movementId || MOVEMENT_LIBRARY[id]?.movement_pattern !== movement?.movement_pattern) continue;
      const alternative = resolvePrescriptionDataSufficiency(context, references, { ...request, movementId: id, referenceId: undefined, authorizedAlternatives: [] });
      if (alternative.status !== 'missing_required_data') return { ...alternative, status: 'fallback_available',
        missingSignals: [...missingSignals, ...alternative.missingSignals],
        fallbacks: [{ signal: 'movement', fallback: 'authorized_equipment_or_skill_alternative', movementId: id }, ...alternative.fallbacks],
        diagnostics: [...alternative.diagnostics, { code: 'PRESCRIPTION_DATA_FALLBACK', signal: 'movement', reason: 'same_authorized_intent_and_pattern' }] };
    }
  }
  const status = critical.length ? 'missing_required_data' : fallbacks.length ? 'fallback_available' : 'sufficient';
  const askable = critical.filter(id => signal(id).state !== 'unavailable' && (id.startsWith('equipment.') || id.startsWith('capability.') || id.startsWith('skill.')));
  // Unknown numeric references cannot be safely represented as boolean answers.
  const missingReference = critical.find(id => referenceQuestionFields[id]);
  const questions = critical.some(id => signal(id).state === 'unavailable') ? [] : askable.length ? [prescriptionQuestion(askable)]
    : missingReference ? [prescriptionQuestion([missingReference])] : [];
  const diagnostics = [{ code: status === 'sufficient' ? 'PRESCRIPTION_DATA_SUFFICIENT' : status === 'fallback_available' ? 'PRESCRIPTION_DATA_FALLBACK' : 'PRESCRIPTION_DATA_MISSING', signal: 'prescription', reason: status },
    ...missingSignals.filter(s => s.state === 'ambiguous').map(s => ({ code: 'PRESCRIPTION_DATA_AMBIGUOUS', signal: s.signal, reason: s.reason })),
    ...questions.flatMap(q => q.signalIds).map(signal => ({ code: 'PRESCRIPTION_DATA_QUESTION_REQUIRED', signal, reason: 'no_authorized_fallback' }))];
  return { status, requirements, resolvedSignals, missingSignals, fallbacks, questions, diagnostics };
}

/** Explicit executable choices supplied to Builder; percentages/HR are preferred only when supported. */
export function prescriptionGenerationOptions(context: PrescriptionSignals, references: DoseReference[], movementIds: string[], discipline: string) {
  return movementIds.map(movementId => {
    const movement = MOVEMENT_LIBRARY[movementId];
    const running = ['run', 'cyclic'].includes(movement.movement_pattern);
    // Intensity remains a Builder choice within 3C. No new zone or adaptation-specific intensity is invented here.
    const decision = resolvePrescriptionDataSufficiency(context, references, { movementId, discipline,
      intensity: running ? 'rpe' : '1rm', allowRpe: true });
    const executableReferenceIds = references.filter(r => r.kind === '1rm' ? r.movementId === movementId
      : running && context.signals[r.unit === 'bpm' ? 'capability.canMeasureHeartRate' : 'capability.canMeasurePace']?.state === 'available').map(r => r.id);
    return { movementId, decision, executableReferenceIds, distanceAvailable: context.signals['capability.canMeasureDistance']?.state === 'available' };
  });
}
