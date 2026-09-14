import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal, MovementDose } from './structuredSession';
import { resolvedMovement } from './movementVariants';
import { activeRestrictionFlags, evaluateMovementRestrictions } from './movementRestrictionPolicy';
import { canonicalDiscipline, normalizeTrainingKey } from './prescriptionScope';
import { resolvePrescriptionDataSufficiency } from './prescriptionDataSufficiency';
import { doseReference, estimateSessionDuration, referenceCompatibilityErrors } from './sessionDose';
import { resolveDoseInstruction } from './sessionExecution';

export const readable = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
/** A name is presentation, never a claim that a catalog descriptor or reference exists. */
export function coachMovementName(m: StructuredSessionProposal['blocks'][number]['movements'][number]) {
  return resolvedMovement(m)?.displayName ?? (readable(m.variant?.displayName) ? m.variant.displayName : readable((m as any).name) ? (m as any).name : readable(m.variant?.canonicalFamily) ? `${m.variant.canonicalFamily.replaceAll('_',' ')} · ${JSON.stringify(m.variant.modifiers ?? {})}` : m.movementId.replaceAll('_', ' '));
}
export function coachReferenceText(c: AllowedTrainingContract, d: MovementDose): string | null {
  const i = d.intensity;
  if (!i || !['percent_1rm', 'reference'].includes(i.kind) || doseReference(c, i)) return null;
  return i.kind === 'percent_1rm' ? `${i.value}% 1RM (sin conversión a kg: referencia no disponible)` : 'Referencia no disponible';
}

/** Preserve independently executable work when a numerical reference cannot be
 * resolved. The original expression is provenance, not a fabricated measurement. */
export function preserveWorkWithoutReference(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  for (const b of p.blocks) for (const m of b.movements) {
    const d = m.prescription, expression = resolveDoseInstruction(d.doseInstruction);
    if (d.intensity && (typeof d.intensity !== 'object' || Array.isArray(d.intensity))) continue;
    if (expression?.reference?.kind === 'percent_1rm') {
      const references = !m.variant ? c.doseContext?.references.filter(r=>r.kind==='1rm'&&r.movementId===m.movementId) ?? [] : [];
      if (!d.intensity && references.length === 1) d.intensity = {kind:'percent_1rm',referenceId:references[0].id,value:expression.reference.value};
      for (const [key,value] of Object.entries(expression.fields)) if (!Object.hasOwn(d,key)) (d as any)[key]=value;
    }
    if (!expression?.reference || expression.reference.kind === 'percent_1rm' || doseReference(c,d.intensity)) continue;
    if (!expression.fields.reps && !expression.fields.durationSeconds && !expression.fields.distanceMeters) continue;
    const original = d.doseInstruction!;
    // The complete parsed grammar proves that this is a trailing reference, not
    // arbitrary prose from which to remove sporting instructions heuristically.
    const work = original.replace(/\s*(?:(?:@|a|at)\s*)?(?:\d+(?:\.\d+)?\s*(?:ppm|bpm)|\d+:[0-5]\d\s*(?:min\/km|\/km))\s*$/i,'').trim();
    if (!work || work === original) continue;
    Object.assign(d, expression.fields, { doseInstruction:work, unresolvedReferenceInstruction:original,
      referenceNotice:'Referencia numérica no disponible; se conserva el trabajo sin convertirla en un dato objetivo.' });
    if (d.intensity?.kind === 'reference') delete d.intensity;
  }
}

/** The modern admission boundary is positive and factual. It does not run sporting
 * validators and then try to maintain an ever-growing list of exempt error codes. */
export function validateCoachExecution(c: AllowedTrainingContract, p: StructuredSessionProposal,
  observe?: (assessment: { blockIndex: number; movementOrdinal: number; family: string | null; category: string; state: string; evidenceSource: string }) => void) {
  const errors: string[] = [];
  if (p.stimulusId !== c.stimulusId) errors.push('STIMULUS_MISMATCH');
  if (Object.hasOwn(p, 'discipline') && (p as any).discipline !== c.discipline) errors.push('SESSION_DISCIPLINE_SCOPE_MISMATCH');
  const notes = [...c.restrictionsSnapshot.restrictions, ...c.restrictionsSnapshot.reassessments];
  const flags = activeRestrictionFlags(notes);
  if (notes.some(n => canonicalDiscipline(n.movement) === c.discipline)) errors.push('EXPLICIT_DISCIPLINE_RESTRICTED');
  for (const [blockIndex, b] of p.blocks.entries()) for (const [index, m] of b.movements.entries()) {
    if (b.formatDose != null && (typeof b.formatDose !== 'object' || Object.values(b.formatDose).some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0))) errors.push('EXECUTION_FORMAT_INVALID');
    const d = m.prescription, resolved = resolvedMovement(m);
    const family = !resolved && m.variant?.canonicalFamily ? resolvedMovement({movementId:m.variant.canonicalFamily}) : undefined;
    const descriptor = resolved?.descriptor ?? family?.descriptor;
    const hasWork = readable(d.doseInstruction) || ['reps','durationSeconds','distanceMeters'].some(k =>
      typeof (d as any)[k] === 'number' && (d as any)[k] > 0) || !!d.intensity;
    if (!hasWork) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE');
    // Invalid typed fields are technical ambiguity. Unstructured coaching belongs in
    // doseInstruction and never needs to conform to an internal dose grammar.
    for (const k of ['sets','reps','durationSeconds','distanceMeters','restSeconds']) {
      const n = (d as any)[k];
      if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) errors.push(`EXECUTION_NUMBER_INVALID:${k}`);
    }
    if (d.tempo !== undefined && (!Array.isArray(d.tempo) || d.tempo.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0))) errors.push('EXECUTION_TEMPO_INVALID');
    const expression = resolveDoseInstruction(d.doseInstruction);
    if (expression) for (const [key, value] of Object.entries(expression.fields)) {
      if (Object.hasOwn(d, key) && JSON.stringify((d as any)[key]) !== JSON.stringify(value)) errors.push('DOSE_INSTRUCTION_CONFLICT');
    }
    const i = d.intensity;
    if (i && (typeof i !== 'object' || !['rpe','rir','percent_1rm','reference'].includes(i.kind)
      || i.kind !== 'reference' && (!Number.isFinite(i.value) || i.max !== undefined && !Number.isFinite(i.max)))) errors.push('EXECUTION_INTENSITY_INVALID');
    if (errors.includes('EXECUTION_INTENSITY_INVALID')) continue;
    if (i && Object.keys(i).some(k => !['kind','referenceId','value','max'].includes(k)) || i?.kind === 'reference' && ('value' in i || 'max' in i)) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');
    const ref = doseReference(c, i);
    if (expression?.reference?.kind === 'percent_1rm' && i?.kind === 'percent_1rm' && expression.reference.value !== i.value) errors.push('NUMERIC_TRUTH:REFERENCE_EXPRESSION_CONFLICT');
    errors.push(...referenceCompatibilityErrors(c,m,i));
    // A missing RM may remain a symbolic percentage. A bare missing reference has
    // no usable intensity: preserve another explicit instruction, otherwise repair.
    if (i?.kind === 'reference' && !ref && !readable(d.doseInstruction) && !d.reps && !d.durationSeconds && !d.distanceMeters) errors.push('NUMERIC_REFERENCE_INSTRUCTION_REQUIRED');
    const pace = d.doseInstruction?.match(/(\d+):([0-5]\d)\s*(?:min\/km|\/km)/i);
    if (pace) {
      const value = Number(pace[1])*60+Number(pace[2]);
      const range = ref && (typeof ref.value === 'number' ? {min:ref.value,max:ref.value} : ref.value);
      if (ref && (ref.unit !== 'seconds_per_km' || !range || value < range.min || value > range.max)) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');
    }
    const numericText = d.doseInstruction?.match(/(\d+(?:\.\d+)?)\s*(kg|bpm|ppm)\b/i);
    if (numericText) {
      const n = Number(numericText[1]), unit = numericText[2].toLowerCase();
      const range = ref && (typeof ref.value === 'number' ? {min:ref.value,max:ref.value} : ref.value);
      if (ref && (!range || (unit === 'kg' ? i?.kind !== 'percent_1rm' || typeof ref.value !== 'number' || n < ref.value*i.value/100 || n > ref.value*(i.max??i.value)/100 : ref.unit !== 'bpm' || n < range.min || n > range.max))) errors.push('NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE');
    }
    if (notes.some(n => normalizeTrainingKey(n.movement) === normalizeTrainingKey(m.movementId))) errors.push(`MOVEMENT_RESTRICTED:${m.movementId}`);
    if (descriptor) {
      const r = evaluateMovementRestrictions(descriptor, flags, resolved?.restrictionProperties);
      if (r.incompatible.length || c.restrictionsSnapshot.areas.some(a => descriptor.avoid_with?.includes(a))) errors.push(`MOVEMENT_RESTRICTED:${m.movementId}`);
    }
    if (c.doseContext?.sufficiency) {
      const s = c.doseContext.sufficiency;
      if (s.signals[`skill.movement.${m.movementId}`]?.state === 'unavailable') errors.push(`FACTUAL_REQUIREMENT_UNAVAILABLE:skill.movement.${m.movementId}`);
      const decision = resolvePrescriptionDataSufficiency(s, c.doseContext.references, { movementId:family?.descriptor.id ?? m.movementId,
        ...(m.variant && !family ? {variant:m.variant} : {}), discipline:c.discipline, openDesign:true, distance:!!d.distanceMeters,
        ...(i?.kind === 'reference' && ref ? {intensity:ref.unit==='bpm'?'hr' as const:'pace' as const,referenceId:ref.id} : {}) });
      for (const signal of decision.resolvedSignals) {
        try { observe?.({blockIndex,movementOrdinal:index+1,family:resolved?.canonicalFamily??null,category:signal.signal.split('.')[0],state:'AVAILABLE',evidenceSource:signal.source?.includes('training_environment')?'training_environment':'explicit_profile'}); } catch { /* Observation only. */ }
      }
      for (const missing of decision.missingSignals) {
        const evidence = s.signals[missing.signal];
        // Beginner/intermediate classification is not an explicit inability.
        const explicit = evidence?.source && !/nivel|training_environment/.test(evidence.source);
        if (missing.state === 'unavailable' && explicit && /^(equipment|skill|capability)\./.test(missing.signal)) errors.push(`FACTUAL_REQUIREMENT_UNAVAILABLE:${missing.signal}`);
        try { observe?.({blockIndex,movementOrdinal:index+1,family:resolved?.canonicalFamily??null,category:missing.signal.split('.')[0],
          state:missing.state==='unavailable'&&explicit?'UNAVAILABLE':'UNKNOWN',evidenceSource:explicit?'explicit_profile':'unresolved'}); } catch { /* Observation only. */ }
      }
    }
  }
  // Only the athlete's explicit time ceiling; unknown analytics do not veto work.
  if (errors.length) return [...new Set(errors)];
  const estimate = estimateSessionDuration(c,p), maximum = c.doseContext?.timeBudget.maximumSeconds;
  if (maximum != null && (estimate.minimumSeconds > maximum || 'minimumExceedsNumericRange' in estimate && estimate.minimumExceedsNumericRange)) errors.push('SESSION_BUDGET_EXCEEDED');
  return [...new Set(errors)];
}
