import { canonicalDigest } from '../execution/executionIntegrity';

export type DevelopmentEvidence = { sourceType: 'conversation_turn'; sourceId: string; sourceRevision?: number;
  occurredAt?: string; recordedAt: string; quoteOrFieldRef: string; evidenceKind: 'reported' };
export type DevelopmentArea = {
  schemaVersion: 2; areaId: string; revision: number; status: 'candidate' | 'active' | 'rejected';
  title: string; objective: string; scope: { disciplines: string[]; focus?: string }; priority: 'high' | 'medium' | 'low';
  strategy: { approach: string; suggestedMethods?: string[]; adaptations?: string[]; restrictionRefs?: string[] };
  evidenceRefs: DevelopmentEvidence[]; explanation: string;
  confirmation: { status: 'pending' | 'accepted' | 'rejected'; proposedTurnId: string; respondedTurnId?: string;
    confirmedAt?: string; responseQuote?: string };
  review: { criteria?: string[]; reviewWhen?: string; lastAssessment?: never };
  createdAt: string; updatedAt: string;
  provenance: { athleteId: string; operationId: string; proposalDigest: string; responseOperationId?: string; responseDigest?: string };
};
export const isDevelopmentV2 = (v: any): v is DevelopmentArea => !!v && (v.schemaVersion === 2 || Object.hasOwn(v, 'areaId'));
export const developmentText = (v: unknown, max = 1600): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
export const developmentObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const developmentKeys = (v: unknown, allowed: string[]) => developmentObject(v) && Object.keys(v).every(k => allowed.includes(k));
const strings = (v: unknown, max = 8) => Array.isArray(v) && v.length <= max && v.every(x => developmentText(x, 400));
export function validDevelopmentProposal(v: any): boolean {
  return developmentKeys(v, ['title','objective','scope','priority','strategy','evidenceRefs','explanation','review'])
    && developmentText(v.title, 200) && developmentText(v.objective, 800) && developmentText(v.explanation)
    && ['high','medium','low'].includes(v.priority)
    && developmentKeys(v.scope, ['disciplines','focus']) && strings(v.scope.disciplines) && v.scope.disciplines.length > 0
    && (v.scope.focus === undefined || developmentText(v.scope.focus, 400))
    && developmentKeys(v.strategy, ['approach','suggestedMethods','adaptations','restrictionRefs'])
    && developmentText(v.strategy.approach, 1600)
    && ['suggestedMethods','adaptations','restrictionRefs'].every(k => v.strategy[k] === undefined || strings(v.strategy[k]))
    && Array.isArray(v.evidenceRefs) && v.evidenceRefs.length > 0 && v.evidenceRefs.length <= 8
    && (v.review === undefined || developmentKeys(v.review, ['criteria','reviewWhen'])
      && (v.review.criteria === undefined || strings(v.review.criteria))
      && (v.review.reviewWhen === undefined || developmentText(v.review.reviewWhen, 400)));
}
export function confirmedDevelopment(v: any): v is DevelopmentArea {
  return isDevelopmentV2(v) && v.schemaVersion === 2 && v.status === 'active' && Number.isSafeInteger(v.revision) && v.revision >= 2
    && developmentText(v.areaId) && v.confirmation?.status === 'accepted' && developmentText(v.confirmation.respondedTurnId)
    && v.confirmation.respondedTurnId !== v.confirmation.proposedTurnId && developmentText(v.confirmation.confirmedAt)
    && developmentText(v.provenance?.athleteId) && developmentText(v.provenance?.responseOperationId)
    && validDevelopmentProposal(Object.fromEntries(['title','objective','scope','priority','strategy','evidenceRefs','explanation','review'].map(k => [k, (v as any)[k]])))
    && v.evidenceRefs.every(e => e.sourceType === 'conversation_turn' && e.evidenceKind === 'reported'
      && developmentText(e.sourceId) && developmentText(e.quoteOrFieldRef) && developmentText(e.recordedAt));
}
/** Full confirmed strategy; no scoring, inferred consent, or prescribed exposure. */
export function developmentPlanningSnapshot(rows: unknown) {
  const areas = (Array.isArray(rows) ? rows : []).filter(confirmedDevelopment).map(a => ({
    areaId: a.areaId, revision: a.revision, title: a.title, objective: a.objective, scope: a.scope, priority: a.priority,
    strategy: a.strategy, evidenceRefs: a.evidenceRefs, confirmation: a.confirmation, review: a.review,
    authority: 'athlete_confirmed_development' as const,
  })).sort((a, b) => a.areaId.localeCompare(b.areaId));
  return { version: 2 as const, semantics: 'CONFIRMED_DEVELOPMENT_NOT_EXECUTION' as const,
    areas: structuredClone(areas), digest: canonicalDigest(areas) };
}
export type DevelopmentSnapshot = ReturnType<typeof developmentPlanningSnapshot>;
export const DEVELOPMENT_PLANNING_INSTRUCTION = `PLANNING HIERARCHY: athlete goals, time horizon, actual available days and session duration, disciplines and planning mode, longitudinal history/state, restrictions/safety, accredited capabilities/references and known physiology (HRmax, threshold, zones, pace), load/exposure/recovery, and block/week coherence remain the foundation of planning. Confirmed development areas are an ADDITIONAL layer to help achieve those goals, never the main planning authority. They do not replace the primary goal or block strategy, override availability/restrictions, or replace accredited physiological references. Let their athlete-agreed objectives and strategies influence programming reasonably according to priority, opportunity and strategy. Not every session should work on a weakness. You decide the sporting programming and how to apply them; suggestedMethods are optional, never exercise requirements. Legacy/unverified areas have no confirmed consent. Known accredited athlete facts prevail over invented or freely estimated substitutes, including equipment and actually executed sessions. Missing necessary information remains uncertain: reason with uncertainty when appropriate or ask, never present an estimate as a known fact. Forge enforces known reality; the Coach and athlete make new decisions, whose confirmed persisted versions inform coherent planning. Prescription intent is not executed exposure or improvement.`;
export type DevelopmentIntent = { areaId: string; areaRevision: number; intendedRole: string; rationale: string };
/** Referential integrity only. No judgment of exercise choice or sporting coverage. */
export function validateDevelopmentIntent(value: unknown, snapshot: DevelopmentSnapshot): DevelopmentIntent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > snapshot.areas.length || new Set(value.map(v => v?.areaId)).size !== value.length
    || value.some(v => !developmentKeys(v, ['areaId','areaRevision','intendedRole','rationale'])
      || !snapshot.areas.some(a => a.areaId === v.areaId && a.revision === v.areaRevision)
      || !developmentText(v.intendedRole, 100) || !developmentText(v.rationale, 800))) throw new Error('DEVELOPMENT_INTENT_INVALID');
  return structuredClone(value);
}
export const DEVELOPMENT_INTENT_INSTRUCTION = `${DEVELOPMENT_PLANNING_INSTRUCTION}\nWhen this session is intended to work on a confirmed area, include optional top-level developmentIntent:[{areaId,areaRevision,intendedRole,rationale}]. CONTRACT.developmentAreas.areas is the ONLY authority for these references: reference only entries present in that list. Copy areaId EXACTLY from area.areaId and areaRevision EXACTLY from area.revision, preserving types. Never invent IDs or use a null revision. source, legacy paths, indices, weaknesses, history and recommendations are NOT authorized identities; never use a legacy source as areaId. If CONTRACT.developmentAreas.areas is empty ([]), omit developmentIntent or return []. Omit or use [] when not applicable. These authority rules apply unchanged during retries. This records PRESCRIPTION INTENT ONLY; never execution, improvement or progress.`;
