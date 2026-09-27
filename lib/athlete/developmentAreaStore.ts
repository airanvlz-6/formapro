import { canonicalDigest } from '../execution/executionIntegrity';
import { samePlanData } from '../planning/planMutationValidators';
import { getCanonicalRestrictions } from './getCanonicalRestrictions';
import { developmentKeys, developmentText, isDevelopmentV2, validDevelopmentProposal, type DevelopmentArea, type DevelopmentEvidence } from './developmentAreas';

type Source = { turnId: string; messageId: string; message: string; timestamp: string; operationId: string };
async function read(db: any, user: string) {
  const r = await db.from('usuarios').select('athlete_development,historial,perfil').eq('codigo', user).single();
  if (r.error || !r.data || r.data.athlete_development != null && !Array.isArray(r.data.athlete_development)) throw new Error('DEVELOPMENT_READ_FAILED');
  return r.data;
}
async function save(db: any, user: string, before: any, next: any[]) {
  try {
    let q = db.from('usuarios').update({ athlete_development: next }).eq('codigo', user);
    q = before == null ? q.is('athlete_development', null) : q.eq('athlete_development', JSON.stringify(before));
    const saved = await q.select('codigo');
    if (saved.error) return { status: 'unknown', code: 'DEVELOPMENT_WRITE_UNCONFIRMED' };
    if (!saved.data?.length) return { status: 'conflict', code: 'DEVELOPMENT_CAS_CONFLICT' };
    if (!samePlanData((await read(db, user)).athlete_development, next)) return { status: 'unknown', code: 'DEVELOPMENT_READBACK_UNCONFIRMED' };
    return { status: 'committed' };
  } catch { return { status: 'unknown', code: 'DEVELOPMENT_WRITE_UNCONFIRMED' }; }
}
export async function readDevelopmentAreas(db: any, user: string) {
  const rows = (await read(db, user)).athlete_development ?? [];
  return { areas: rows.map((a: any) => isDevelopmentV2(a) ? a : { ...a, authority: 'legacy_unverified' }),
    semantics: 'CANDIDATE_IS_NOT_CONSENT_REJECTED_IS_NOT_ACTIVE' };
}
/** Narrow legacy CAS: preserve every V2 object byte-for-byte, never create V2 authority. */
export async function saveLegacyDevelopment(db: any, user: string, before: any, next: any[]) {
  if (!samePlanData((before ?? []).filter(isDevelopmentV2), next.filter(isDevelopmentV2)))
    return { ok: false, status: 'rejected', code: 'DEVELOPMENT_V2_PROTECTED' };
  const r = await save(db, user, before, next);
  return { ...r, ok: r.status === 'committed' };
}
export async function mutateDevelopmentArea(db: any, user: string, kind: 'propose' | 'respond', a: any, source: Source) {
  const reject = (code: string) => ({ status: 'rejected', code });
  const row = await read(db, user), before = row.athlete_development, rows: any[] = before ?? [];
  if (row.perfil?.coach_first_turns?.[source.turnId]?.status !== 'claimed') return reject('DEVELOPMENT_TURN_REQUIRED');
  let area: DevelopmentArea, index = -1;
  const digest = canonicalDigest(a);
  if (kind === 'propose') {
    if (!validDevelopmentProposal(a)) return reject('DEVELOPMENT_PROPOSAL_INVALID');
    const existing = rows.find(r => isDevelopmentV2(r) && r.provenance.operationId === source.operationId);
    if (existing) return existing.provenance.proposalDigest === digest
      ? { status: 'already_applied', receipt: { verified: true, areaId: existing.areaId, revision: existing.revision, state: existing.status }, area: existing }
      : { status: 'conflict', code: 'DEVELOPMENT_OPERATION_CONFLICT' };
    if (rows.filter(isDevelopmentV2).length >= 64) return reject('DEVELOPMENT_CAP');
    const evidenceRefs: DevelopmentEvidence[] = [];
    for (const e of a.evidenceRefs) {
      if (!developmentKeys(e, ['sourceType','sourceId','quoteOrFieldRef','evidenceKind']) || e.sourceType !== 'conversation_turn'
        || e.evidenceKind !== 'reported' || !developmentText(e.quoteOrFieldRef) || !developmentText(e.sourceId)) return reject('DEVELOPMENT_EVIDENCE_INVALID');
      const current = e.sourceId === source.turnId || e.sourceId === source.messageId;
      const message = current ? source.message : row.historial?.find((m: any) => m.role === 'user' && m.turnId === e.sourceId)?.content;
      if (typeof message !== 'string' || !message.includes(e.quoteOrFieldRef)) return reject('DEVELOPMENT_EVIDENCE_NOT_OWNED');
      evidenceRefs.push({ ...e, sourceId: current ? source.turnId : e.sourceId, recordedAt: source.timestamp,
        ...(current ? { occurredAt: source.timestamp } : {}) });
    }
    if (a.strategy.restrictionRefs?.length) {
      const r = await getCanonicalRestrictions(db, user);
      const ids = [r.state?.id, ...r.restrictions.map(x => x.id), ...r.reassessments.map(x => x.id)];
      if (a.strategy.restrictionRefs.some((id: string) => !ids.includes(id))) return reject('DEVELOPMENT_RESTRICTION_NOT_OWNED');
    }
    area = { ...structuredClone(a), schemaVersion: 2, areaId: canonicalDigest([user, source.operationId]), revision: 1,
      status: 'candidate', evidenceRefs, review: a.review ?? {}, confirmation: { status: 'pending', proposedTurnId: source.turnId },
      createdAt: source.timestamp, updatedAt: source.timestamp,
      provenance: { athleteId: user, operationId: source.operationId, proposalDigest: digest } };
  } else {
    if (!developmentKeys(a, ['candidateId','expectedRevision','decision','responseTurnId','responseQuote'])
      || !developmentText(a.candidateId) || !Number.isSafeInteger(a.expectedRevision)
      || !['accept','reject'].includes(a.decision) || ![source.turnId, source.messageId].includes(a.responseTurnId)
      || !developmentText(a.responseQuote) || !source.message.includes(a.responseQuote)) return reject('DEVELOPMENT_RESPONSE_INVALID');
    index = rows.findIndex(r => isDevelopmentV2(r) && r.areaId === a.candidateId && r.provenance.athleteId === user);
    if (index < 0) return reject('DEVELOPMENT_CANDIDATE_NOT_OWNED');
    const prior: DevelopmentArea = rows[index];
    if (prior.provenance.responseOperationId === source.operationId) return prior.provenance.responseDigest === digest
      ? { status: 'already_applied', receipt: { verified: true, areaId: prior.areaId, revision: prior.revision, state: prior.status }, area: prior }
      : { status: 'conflict', code: 'DEVELOPMENT_OPERATION_CONFLICT' };
    if (prior.revision !== a.expectedRevision) return { status: 'conflict', code: 'DEVELOPMENT_REVISION_CONFLICT' };
    if (prior.status !== 'candidate' || prior.confirmation.status !== 'pending') return reject('DEVELOPMENT_NOT_PENDING');
    const proposed = row.perfil?.coach_first_turns?.[prior.confirmation.proposedTurnId];
    if (prior.confirmation.proposedTurnId === source.turnId || proposed?.status !== 'completed' || proposed?.persisted !== true)
      return reject('DEVELOPMENT_PROPOSAL_NOT_PRESENTED');
    area = { ...prior, revision: prior.revision + 1, status: a.decision === 'accept' ? 'active' : 'rejected',
      confirmation: { ...prior.confirmation, status: a.decision === 'accept' ? 'accepted' : 'rejected',
        respondedTurnId: source.turnId, responseQuote: a.responseQuote, ...(a.decision === 'accept' ? { confirmedAt: source.timestamp } : {}) },
      updatedAt: source.timestamp, provenance: { ...prior.provenance, responseOperationId: source.operationId, responseDigest: digest } };
  }
  const next = [...rows]; if (index < 0) next.push(area); else next[index] = area;
  const saved = await save(db, user, before, next);
  return { ...saved, ...(saved.status === 'committed' ? { area, receipt: {
    verified: true, areaId: area.areaId, revision: area.revision, state: area.status, operationId: source.operationId } } : {}) };
}
/** Development write outcomes are server-rendered; provider prose cannot turn rejection into success. */
export function developmentWriteAnswer(results: any[]): string | null {
  const writes = results.filter(r => ['propose_development_area','respond_development_proposal'].includes(r.name));
  if (!writes.length) return null;
  return writes.map(r => {
    if (!['committed','already_applied'].includes(r.status) || !r.receipt?.verified || !r.area)
      return 'No se ha confirmado el guardado del área de desarrollo. No puedo afirmar que esté activa.';
    const a = r.area;
    if (a.status === 'candidate') return [
      `Propuesta guardada, pendiente de tu aceptación: ${a.title}.`,
      `Objetivo: ${a.objective}`, `Ámbito: ${a.scope.disciplines.join(', ')}${a.scope.focus ? ' — ' + a.scope.focus : ''}`,
      `Prioridad: ${a.priority}`, `Estrategia: ${a.strategy.approach}`,
      ...(a.strategy.suggestedMethods?.length ? [`Métodos opcionales: ${a.strategy.suggestedMethods.join('; ')}`] : []),
      ...(a.strategy.adaptations?.length ? [`Adaptaciones: ${a.strategy.adaptations.join('; ')}`] : []),
      ...(a.review.criteria?.length ? [`Criterios de revisión: ${a.review.criteria.join('; ')}`] : []),
      ...(a.review.reviewWhen ? [`Revisión: ${a.review.reviewWhen}`] : []),
      `Evidencia reportada: ${a.evidenceRefs.map((e: DevelopmentEvidence) => e.quoteOrFieldRef).join('; ')}`,
      a.explanation, '¿Quieres incorporarla como área de desarrollo?',
    ].join('\n');
    return a.status === 'active' ? `Área confirmada y activa: ${a.title}.\nObjetivo: ${a.objective}\nEstrategia acordada: ${a.strategy.approach}`
      : `Propuesta rechazada: ${a.title}. No se ha activado.`;
  }).join('\n\n');
}
