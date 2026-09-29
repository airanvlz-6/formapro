import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal } from './structuredSession';
import { validCoachingDescription, revisedGuidance } from '../planning/weeklyCoachingGuidance';
import { samePlanData } from '../planning/planMutationValidators';

/** Select only sporting fields. All factual authority remains the server's immutable snapshot. */
export function admitFinalDecision(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  if (c.contractVersion !== 5) return c;
  const d = p.finalDecision;
  if (!validCoachingDescription(d, 'session_decision') || !d || d.stimulus !== p.stimulusId)
    throw new Error('FINAL_SESSION_DECISION_INVALID');
  if (revisedGuidance(c.finalDecision ?? c.coachingGuidance!, d) && !d.reason)
    throw new Error('FINAL_SESSION_REVISION_REASON_REQUIRED');
  const date = new Date(Date.parse(c.targetWeekStart) + ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].indexOf(c.targetDay)*86400000).toISOString().slice(0,10);
  for (const [key, expected] of Object.entries({ day:c.targetDay, dia:c.targetDay, targetDay:c.targetDay,
    targetDate:date, targetWeekStart:c.targetWeekStart, discipline:c.discipline, tipo:c.discipline })) {
    if (Object.hasOwn(p,key) && !samePlanData((p as any)[key],expected)) throw new Error('SESSION_AUTHORIZATION_CHANGED');
  }
  return { ...c, stimulusId: d.stimulus, finalDecision: structuredClone(d) };
}
export function finalDecisionErrors(c: AllowedTrainingContract, p: StructuredSessionProposal): string[] {
  if (c.contractVersion !== 5) return []; // Historical opaque metadata retains its original semantics.
  try {
    const final = admitFinalDecision(c,p);
    return samePlanData(final.finalDecision,c.finalDecision) && final.stimulusId === c.stimulusId ? [] : ['FINAL_DECISION_NOT_ADMITTED'];
  } catch (e: any) { return [e.message]; }
}
export const FINAL_DECISION_INSTRUCTIONS = `Weekly coachingGuidance and sporting suggestions in weekStrategy are recommendation and provenance, not an immutable sporting identity. You decide the FINAL adaptation, stimulus, patterns, method and role using all athlete context and actual sibling sessions. You may keep or revise the guidance. Return finalDecision:{kind:"session_decision",version:1,stimulus:"your final readable stimulus",adaptation?,patterns?:string[],method?,role?,reason?}. Only these keys are allowed. kind must be "session_decision" and version must be the number 1. stimulus is required; adaptation, patterns, method and role are optional. Every present descriptive text (adaptation, stimulus, method, role, reason and each patterns item) must be a non-blank string of at most 400 characters (JavaScript string.length), without control characters U+0000–U+001F or U+007F. Omit optional fields instead of using null or empty text. patterns is an optional string[] with at most 18 items, each subject to the same text rules. Include a concise reason of at most 400 characters whenever adaptation, stimulus, patterns, method or role differs from the last admitted finalDecision, or otherwise from coachingGuidance. Adding or omitting an optional field or changing patterns order also counts as a revision. reason is optional otherwise, but must satisfy the same text rules if present. stimulusId must equal finalDecision.stimulus exactly, without trimming or case normalization. Dates, discipline, availability, protection, restrictions, resources, references and time remain server authority. Never change those facts. Do not map TurnPlanningIntent mechanically to dose.`;
