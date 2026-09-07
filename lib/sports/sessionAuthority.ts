import { calendarState } from '../planning/weeklyCalendar';
import { samePlanData } from '../planning/planMutationValidators';
import { assertFreshWeeklyAuthority, resolveWeeklySlot, verifyWeeklyCalendarReceipt, weeklyDigest } from '../planning/weeklyCalendarAuthority';
import type { PrescriptionIntent } from './prescriptionIntent';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { prepareSessionTrainingContract } from './prepareSessionTrainingContract';
import { buildAllowedTrainingContract } from './allowedTrainingContract';
import type { BuilderCompletion } from './builderDiagnostics';
import { generateContractSession } from './sessionGeneration';
import { renderContractSession, parseStructuredSession, validateSessionAgainstTrainingContract } from './structuredSession';
import { canonicalDiscipline, normalizeTrainingKey, buildPrescriptionScope, resolveProfileDisciplines } from './prescriptionScope';
import { loadAthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import { buildSessionDoseContext } from './sessionDoseContext';
import { resolvePrescriptionDataSufficiency } from './prescriptionDataSufficiency';
import { intentMatchingMovementIds } from './prescriptionIntent';
import { issuePrescriptionQuestion } from '../athlete/prescriptionAnswers';

const PROFILE = 'modo_entrada,distribucion_semanal,especialidad,categoria';
const domain = 'forge-session-contract-v1:';
const prescriptionDate = (week: string, day: string) => new Date(Date.parse(week) +
  ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].indexOf(day) * 86400000).toISOString().slice(0, 10);
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SESSION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update(domain + payload).digest('base64url');
}
type Request = { targetWeekStart: string; day: string; discipline: string; stimulus: unknown; intent?: PrescriptionIntent; state?: 'TRAIN' | 'RECOVERY';
  weekly?: { receipt: unknown; generationToken: unknown; optionId: unknown; claims?: Record<string, any> } };

/** One repair proposal under the original authenticated authority; never widen pools or replace intent. */
export function verifiedRepairContract(session:Record<string,any>,codigo:string,week:string,calendarReceipt:string){
  verifySessionReceipt(session.sessionReceipt,session,codigo,week,calendarReceipt);
  return JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0],'base64url').toString()).contract;
}
export async function repairSessionWithinReceipt(session: Record<string, any>, codigo: string, week: string, calendarReceipt: string,
  diagnostics: unknown, siblings: unknown, complete: (prompt: string) => Promise<string>, stage:'local'|'targeted'='local') {
  verifySessionReceipt(session.sessionReceipt, session, codigo, week, calendarReceipt);
  const evidence = JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0], 'base64url').toString());
  const weekly=verifyWeeklyCalendarReceipt(calendarReceipt,codigo,week,true);
  const raw = await complete(`${stage==='local'?'Repair the implicated composition locally.':'Targeted regeneration: compose a fresh alternative; the local pass was insufficient.'} Return only proposal JSON inside the UNCHANGED signed contract. No titles or authority changes.\nSTAGE:${stage}\nCONTRACT:\n${JSON.stringify(evidence.contract)}\nWEEK_STRATEGY:\n${JSON.stringify(weekly.strategy||null)}\nREJECTED_PROPOSAL:\n${JSON.stringify(evidence.proposal)}\nWHOLE_WEEK_DIAGNOSTICS:\n${JSON.stringify(diagnostics)}\nSIBLING_PROPOSALS:\n${JSON.stringify(siblings)}`);
  const parsed = parseStructuredSession(raw);
  if (!parsed.ok) throw new Error('WEEK_REPAIR_PROPOSAL_INVALID');
  const checked = validateSessionAgainstTrainingContract(evidence.contract, parsed.proposal);
  if (!checked.ok) throw new Error('WEEK_REPAIR_CONTRACT_INVALID');
  const rendered = renderContractSession(evidence.contract, checked.proposal);
  const payload = Buffer.from(JSON.stringify({...evidence,proposal:checked.proposal})).toString('base64url');
  return {...rendered,sessionReceipt:`${payload}.${signature(payload)}`};
}
/** Only this server adapter issues receipts, after both sports and duplication checks. */
export async function generateTrainingSession(db: any, userCodigo: string, request: Request,
  complete: (prompt: string) => Promise<string | BuilderCompletion>, context = '', planningRunId?: string) {
  try {
    let weekly: { calendarReceipt: string; optionId: string } | undefined;
    let weeklyContext: any;
    let strategicWeek: any = null, neighbours: any[] = [];
    if (Object.hasOwn(request, 'weekly')) {
      const proof = request.weekly!;
      const fresh = await assertFreshWeeklyAuthority(db, userCodigo, request.targetWeekStart, proof.receipt, proof.generationToken);
      const slot = resolveWeeklySlot(fresh.evidence, { ...request, optionId: proof.optionId });
      if (proof.claims) resolveWeeklySlot(fresh.evidence, { ...proof.claims, day: request.day, optionId: proof.optionId });
      weekly = { calendarReceipt: proof.receipt as string, optionId: slot.optionId };
      weeklyContext = fresh.contexts[slot.discipline];
      strategicWeek = fresh.evidence.strategy || null;
      const ordered = fresh.evidence.admittedSlots, index = ordered.findIndex((s: any) => s.day === slot.day);
      neighbours = [ordered[index - 1], ordered[index + 1]].filter(Boolean).map((s: any) => ({ day: s.day,
        adaptationId: s.intent?.kind === 'adaptation' ? s.intent.adaptationId : null, state: s.state }));
      request = { targetWeekStart: fresh.evidence.week, day: slot.day, discipline: slot.discipline,
        stimulus: slot.stimulusId, intent: slot.intent, state: slot.state };
    }
    if (Object.hasOwn(request, 'state') && (!['TRAIN', 'RECOVERY'].includes(request.state!)
      || request.state !== calendarState({ tipo: canonicalDiscipline(request.discipline), stimulusId: request.stimulus })))
      return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: ['SESSION_STATE_MISMATCH'] };
    const { data: profile, error } = await db.from('usuarios')
      .select(`${PROFILE},perfil,marcas_especificas,ciclo_actual,athlete_development,datos_entrenamiento`).eq('codigo', userCodigo).single();
    if (error || !profile) return { ok: false as const, code: 'CONTRACT_PROFILE_READ_FAILED' };
    const restrictions = await getCanonicalRestrictions(db, userCodigo);
    // Reuse the freshly loaded weekly context; only restrictions are reread at the existing session boundary.
    const base = weeklyContext ? buildAllowedTrainingContract({ ...weeklyContext, targetDay: request.day,
      stimulus: request.stimulus, intent: request.intent, restrictionsSnapshot: restrictions })
      : await prepareSessionTrainingContract(db, userCodigo, profile, request, restrictions);
    if (!base.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: base.errors };
    const canonical = await loadAthletePrescriptionContext(db, userCodigo, { asOfDate: restrictions.asOfDate,
      prescriptionDate: prescriptionDate(request.targetWeekStart, request.day) });
    const doseContext = buildSessionDoseContext(canonical, base.contract.intent, strategicWeek, neighbours, true);
    const prepared = buildAllowedTrainingContract({ ...base.contract, stimulus: base.contract.stimulusId, doseContext });
    if (!prepared.ok) {
      const ids = intentMatchingMovementIds(base.contract.intent || { kind: 'stimulus_only' }, base.contract.allowedMovementIds);
      const decisions = ids.map(movementId => resolvePrescriptionDataSufficiency(doseContext.sufficiency!, doseContext.references,
        { movementId, discipline: base.contract.discipline })).filter(d => d.status === 'missing_required_data')
        .sort((a, b) => Number(!a.questions.length) - Number(!b.questions.length) || a.missingSignals.length - b.missingSignals.length);
      const sufficiency = decisions[0], question = sufficiency?.questions[0];
      return { ok: false as const, code: 'PRESCRIPTION_DATA_MISSING', errors: prepared.errors, sufficiency, question,
        questionToken: question ? issuePrescriptionQuestion(userCodigo, base.contract.discipline, question) : undefined };
    }
    if (weekly && (weeklyDigest(prepared.contract.restrictionsSnapshot) !== weeklyDigest(weeklyContext.restrictionsSnapshot)
      || weeklyDigest(prepared.contract.prescriptionScope) !== weeklyDigest(weeklyContext.prescriptionScope)
      || weeklyDigest(prepared.contract.availableDays) !== weeklyDigest(weeklyContext.availableDays)))
      throw new Error('WEEKLY_CONTEXT_STALE');
    const history = await db.from('weekly_plan').select('sessions').eq('user_codigo', userCodigo).order('week_start', { ascending: false }).limit(2);
    if (history.error || !Array.isArray(history.data)) return { ok: false as const, code: 'SESSION_HISTORY_READ_FAILED' };
    const recent = history.data.flatMap((p: any) => Array.isArray(p.sessions) ? p.sessions.filter((s: any) => s.completada && s.descripcion_real)
      .map((s: any) => ({ titulo: s.titulo, descripcion_real: s.descripcion_real })) : []).slice(0, 5);
    const result = await generateContractSession(prepared.contract, recent, complete,
      JSON.stringify({ serverProfile: profile, requestContext: context }), planningRunId);
    if (!result.ok) return result;
    const payload = Buffer.from(JSON.stringify({ userCodigo, expiresAt: Date.now() + 30 * 60_000,
      contract: result.contract, proposal: result.proposal, ...(weekly ? { weekly } : {}) })).toString('base64url');
    const sessionReceipt = `${payload}.${signature(payload)}`;
    return { ok: true as const, trainingContract: result.contract, sesion: { ...result.session, sessionReceipt }, attempts: result.attempts, diagnostics: result.diagnostics };
  } catch (error: any) { return { ok: false as const, code: error.message?.startsWith('WEEKLY_') || error.message?.startsWith('CALENDAR_')
    ? error.message : 'SESSION_AUTHORITY_FAILED', errors: [error.message], retryable: false }; }
}

const fields = ['dia', 'tipo', 'titulo', 'por_que', 'descripcion', 'debilidad_relacionada'] as const;
/** Returned pools are never authoritative. Authenticate original A, then revalidate and rerender A. */
export function verifySessionReceipt(receipt: unknown, session: Record<string, any>, userCodigo: string, weekStart: string, expectedWeeklyReceipt?: string, restoreMissingMetadata = false) {
  if (typeof receipt !== 'string' || receipt.length > 200_000) throw new Error('SESSION_RECEIPT_REQUIRED');
  const [payload, mac, extra] = receipt.split('.');
  if (!payload || !mac || extra !== undefined) throw new Error('SESSION_RECEIPT_INVALID');
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(mac);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('SESSION_RECEIPT_INVALID');
  const evidence = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (evidence.userCodigo !== userCodigo || !Number.isFinite(evidence.expiresAt) || Date.now() > evidence.expiresAt
    || evidence.contract?.targetWeekStart !== weekStart) throw new Error('SESSION_RECEIPT_CONTEXT_MISMATCH');
  if (expectedWeeklyReceipt !== undefined && evidence.weekly?.calendarReceipt !== expectedWeeklyReceipt)
    throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');
  if (evidence.weekly) {
    const weekly = verifyWeeklyCalendarReceipt(evidence.weekly.calendarReceipt, userCodigo, weekStart, true);
    const c = evidence.contract;
    resolveWeeklySlot(weekly, { day: c.targetDay, optionId: evidence.weekly.optionId, targetWeekStart: c.targetWeekStart,
      discipline: c.discipline, stimulus: c.stimulusId, intent: c.intent,
      state: calendarState({ tipo: c.discipline, stimulusId: c.stimulusId }) });
    if (![2, 3].includes(c.contractVersion) || weeklyDigest(c.prescriptionScope) !== weeklyDigest(weekly.prescriptionScope))
      throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');
  }
  const rendered = renderContractSession(evidence.contract, evidence.proposal);
  if (fields.some(k => !Object.is(session[k] ?? (k === 'debilidad_relacionada' ? null : undefined), rendered[k]))) throw new Error('SESSION_CONTENT_MISMATCH');
  for (const field of ['stimulusId', 'intent', 'structuredPrescription'] as const) {
    // Scalar-only mutation transports may restore absent metadata from verified evidence, never from prose.
    if (restoreMissingMetadata && !Object.hasOwn(session, field)) continue;
    if (Object.hasOwn(rendered, field) && (!Object.hasOwn(session, field) || !samePlanData(session[field], (rendered as Record<string, unknown>)[field])))
      throw new Error('SESSION_CONTENT_MISMATCH');
  }
  return rendered;
}

/** A changed authority requires regeneration, never an LLM classifier or silent pool repair.
 * Read immediately before the write. Cross-table atomic restriction revisioning remains separate work. */
export async function assertFreshSessionRestrictions(db: any, userCodigo: string, weekStart: string, session: Record<string, any>) {
  verifySessionReceipt(session.sessionReceipt, session, userCodigo, weekStart);
  const original = JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0], 'base64url').toString()).contract.restrictionsSnapshot;
  const current = await getCanonicalRestrictions(db, userCodigo);
  const material = (r: any) => JSON.stringify({ state: r.state, areas: r.areas, restrictions: r.restrictions, reassessments: r.reassessments, active: r.active });
  if (material(original) !== material(current)) throw new Error('SESSION_RESTRICTIONS_CHANGED_REGENERATE');
  const contract = JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0], 'base64url').toString()).contract;
  if (contract.contractVersion === 3) {
    const canonical = await loadAthletePrescriptionContext(db, userCodigo, { asOfDate: current.asOfDate,
      prescriptionDate: prescriptionDate(contract.targetWeekStart, contract.targetDay) });
    const now = buildSessionDoseContext(canonical, contract.intent, contract.doseContext.weekStrategy, contract.doseContext.neighbours, !!contract.doseContext.sufficiency);
    if (now.evidenceDigest !== contract.doseContext.evidenceDigest) throw new Error('SESSION_DOSE_CONTEXT_CHANGED_REGENERATE');
  }
}

/** Current ownership may revoke an old receipt; this does not recalculate contract A. */
export async function assertCurrentPrescriptionScope(db: any, userCodigo: string, discipline: string) {
  const { data: profile, error } = await db.from('usuarios').select(PROFILE).eq('codigo', userCodigo).single();
  const sources = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', userCodigo).eq('activo', true);
  if (error || !profile || sources.error || !Array.isArray(sources.data)) throw new Error('SESSION_SCOPE_READ_FAILED');
  const scope = buildPrescriptionScope({ mode: profile.modo_entrada, sources: sources.data, profileDisciplines: resolveProfileDisciplines(profile) });
  if (!scope.ok || !scope.scope.prescriptionAllowed || !scope.scope.managedDisciplines.includes(canonicalDiscipline(discipline))) throw new Error('SESSION_SCOPE_REVOKED');
}

/** New non-sports slots are server rendered, never an escape via a client "descanso" label.
 * External slots are accepted only via the server's source/day map. Survivors bypass this helper. */
export function admitSessionContent(session: Record<string, any>, userCodigo: string, weekStart: string,
  options: { externalDiscipline?: string; pastDay?: boolean } = {}) {
  const dia = normalizeTrainingKey(session.dia);
  if (!['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(dia)) throw new Error('SESSION_DAY_INVALID');
  if (options.externalDiscipline) return { dia, tipo: 'external_blocked', titulo: `${options.externalDiscipline} · Entrenamiento externo`,
    por_que: 'Gestionado por tu entrenador externo — Forge no prescribe ni modifica esta sesión.',
    descripcion: 'Actividad externa. Puedes registrar lo realizado con tu entrenador.', disciplina: options.externalDiscipline, gestionado_por: 'external' };
  if (session.tipo === 'external_blocked') throw new Error('EXTERNAL_SLOT_NOT_AUTHORIZED');
  if (options.pastDay && session.titulo === 'Sin registrar') return { dia, tipo: 'sin_registrar', titulo: 'Sin registrar',
    por_que: 'Día anterior al inicio de esta planificación', descripcion: 'No aplica — esta planificación comienza a partir de hoy.', completada: false };
  if (session.tipo === 'descanso') return { dia, tipo: 'descanso', titulo: 'Descanso', por_que: 'Recuperación programada',
    descripcion: 'Día de descanso — prioriza sueño, hidratación y nutrición.' };
  // Drop all other client metadata, including scientific notes and the ephemeral receipt.
  return verifySessionReceipt(session.sessionReceipt, session, userCodigo, weekStart);
}
