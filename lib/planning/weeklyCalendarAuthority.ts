import { weeklyRegenerationOutcome } from './weeklyRegeneration';
import { buildCommonWeekContext, commonContextDigest, PARALLEL_BUILDER_PROTOCOL, verifyCommonWeekContext } from './commonWeekContext';
import type { WeeklyCoachingContext } from './weeklyCoachingContext';
import { availableDaysAtWeek } from '../sports/temporaryTrainingAccess';
import { resolveWeeklyDeclaration } from '../sports/weeklyAvailabilityDeclaration';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { buildAllowedWeeklyPlanContract, validateWeeklySelection, type AllowedWeeklyPlanContract } from './allowedWeeklyPlanContract';
import { loadWeeklyPlanningContext } from './prepareAllowedWeeklyPlanContract';
import { verifySessionReceipt } from '../sports/sessionAuthority';
import { samePlanData } from './planMutationValidators';
import { baseAvailabilityDays } from '../sports/trainingAvailability';
import { weeklyAvailabilityFailure } from './weeklyAvailabilityDiagnostics';
import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from '../sports/prescriptionScope';
import { aplicarTrainingFrequencySafetyNet, calcularFrecuenciaRealRelativa } from '../sports/trainingFrequencySafetyNet';
import { calendarDays, calendarKey, calendarState, isExecutableCalendarState, validateWeeklyCalendar } from './weeklyCalendar';
import { renderWeekObjective } from './canonicalWeekStrategy';
import { humanWeeklyObjective } from '../sports/humanCoachingProjection';
import { selectedWeekObjective } from './selectedWeekObjective';
import { loadLongitudinalProjection } from './longitudinalAuthority';
import { authenticatedPresentationVersion } from '../sports/sessionPresentation';

export const weeklyDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const availabilitySnapshotDigest = (c: { profile: any; sources: any[]; scope: unknown }, week?: string) => {
  const override = week ? resolveWeeklyDeclaration(c.profile.perfil, week) : { status: 'absent' as const };
  const scope = c.scope as { managedDisciplines: string[]; externalDisciplines: string[] };
  const effective = Object.fromEntries([...scope.managedDisciplines, ...scope.externalDisciplines].map(d => {
    const base = baseAvailabilityDays(c.profile.distribucion_semanal, c.sources, d);
    return [d, week ? availableDaysAtWeek(c.profile.perfil, week, base, d) : base];
  }));
  return weeklyDigest({ distribution: c.profile.distribucion_semanal, sources: c.sources, scope: c.scope, effective,
    weeklyOverride: override, ...(override.status === 'valid' ? { week } : {}) });
};
const snapshotDigest = (snapshot: any) => weeklyDigest(snapshot ? { id: snapshot.id, revision: snapshot.revision, sessions: snapshot.sessions } : null);
type Admission = { contract: AllowedWeeklyPlanContract; selections: { day: string; optionId?: string }[];
  request: Parameters<typeof loadWeeklyPlanningContext>[2]; generationToken: string; decisions?: Record<string, unknown>;
  builderCoachingContext?: WeeklyCoachingContext };
function rejectWeekly(code: string): never {
  console.warn('WEEKLY_AUTHORITY_REJECTED', { code, protocolVersion: 2 });
  throw new Error(code);
}

function mac(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('CALENDAR_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', key).update('forge-week-calendar-v1:' + payload).digest('base64url');
}
export async function loadWeeklyCalendarContext(db: any, codigo: string, targetWeek?: string) {
  const p = await db.from('usuarios').select('modo_entrada,perfil,workout_history,distribucion_semanal,especialidad,categoria').eq('codigo', codigo).single();
  const t = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
  if (p.error || !p.data || t.error || !Array.isArray(t.data)) throw new Error('CALENDAR_CONTEXT_READ_FAILED');
  const profile = p.data;
  const scope = buildPrescriptionScope({ mode: profile.modo_entrada, sources: t.data, profileDisciplines: resolveProfileDisciplines(profile) });
  if (!scope.ok || !scope.scope.prescriptionAllowed) throw new Error('CALENDAR_SCOPE_INVALID');
  const base = Object.fromEntries(scope.scope.managedDisciplines.map(d => [d, baseAvailabilityDays(profile.distribucion_semanal, t.data, d)]));
  const weeklyOverride = targetWeek ? resolveWeeklyDeclaration(profile.perfil, targetWeek) : { status: 'absent' as const };
  const allowed: Record<string, string[]> = {};
  for (const discipline of scope.scope.managedDisciplines) {
    const sources = t.data.filter((s: any) => s.owner === 'forge' && canonicalDiscipline(s.disciplina) === discipline && s.dias != null);
    const habitual = base[discipline];
    const value = targetWeek ? availableDaysAtWeek(profile.perfil, targetWeek, habitual, discipline) : habitual;
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
      if (weeklyOverride.status === 'invalid') throw Object.assign(new Error(weeklyOverride.issue), { weeklyOverride });
      if (profile.distribucion_semanal == null || profile.distribucion_semanal === 'null')
        throw Object.assign(new Error('CALENDAR_AVAILABILITY_REQUIRED'), { weeklyOverride });
      throw Object.assign(weeklyAvailabilityFailure(profile.distribucion_semanal ?? {}, discipline, scope.scope, sources, value), { weeklyOverride });
    }
    allowed[discipline] = value.map(calendarKey);
  }
  const frequency = calcularFrecuenciaRealRelativa(profile.workout_history || [], Number.parseInt(profile.perfil?.dias || '0'));
  return { profile, sources: t.data, scope: scope.scope, allowed, weeklyOverride, max: aplicarTrainingFrequencySafetyNet(7, frequency).diasEntrenoSugeridos };
}
export async function issueWeeklyCalendar(db: any, codigo: string, week: string, sessions: any[], admission?: Admission) {
  const c = await loadWeeklyCalendarContext(db, codigo, week);
  const openCoach = [2,3].includes(admission?.contract.contractVersion ?? 0);
  const result = validateWeeklyCalendar(sessions, openCoach ? 7 : c.max, c.allowed, undefined, openCoach);
  if (!result.ok || !result.slots) throw Object.assign(new Error(result.errors.join(',')), { availabilityViolations: result.availabilityViolations });
  const calendarSlots = result.slots;
  let authority = {};
  if (admission) {
    const { contract, selections, request, generationToken } = admission;
    if (contract.targetWeekStart !== week || request.targetWeekStart !== week) rejectWeekly('WEEKLY_TARGET_MISMATCH');
    const selected = validateWeeklySelection(contract, { contractVersion: contract.contractVersion, contextDigest: contract.contextDigest, selections });
    if (!selected.ok) rejectWeekly('WEEKLY_SELECTION_INVALID');
    const admittedSlots = calendarDays.map((day, index) => {
      const option = selected.selected[day];
      const date = new Date(week + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + index);
      const slot = calendarSlots.find(s => s.day === day);
      if (!slot || (slot.state !== option.state && !(contract.contractVersion === 3 && isExecutableCalendarState(slot.state) && isExecutableCalendarState(option.state))) || (isExecutableCalendarState(option.state) && slot.type !== option.discipline))
        rejectWeekly('WEEKLY_SLOT_MISMATCH');
      const original = request.snapshot?.sessions.find(s => calendarKey(s.dia) === day);
      return { day, targetDate: date.toISOString().slice(0, 10), ...option,
        ...(option.protected && original && sessions.some(s => calendarKey(s.dia) === day
          && weeklyDigest(Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'weeklyProtected'))) === weeklyDigest(original)) ? { protectedSessionDigest: weeklyDigest(original) } : {}) };
    });
    let builderBinding = {};
    if (request.parallelBuilders) {
      if (contract.contractVersion !== 3 || !admission.builderCoachingContext) rejectWeekly('COMMON_WEEK_CONTEXT_REQUIRED');
      const commonWeekContext = buildCommonWeekContext({ user: codigo, weekStart: week, planningRunId: request.planningRunId,
        generationDigest: weeklyDigest(generationToken), sourceSnapshotDigest: snapshotDigest(request.snapshot),
        weeklyContractDigest: weeklyDigest(contract), asOfDate: request.today, strategy: contract.strategy,
        slots: admittedSlots, coaching: admission.builderCoachingContext!, turnPlanningIntent: request.builderTurnIntent });
      builderBinding = { builderProtocol: PARALLEL_BUILDER_PROTOCOL, commonWeekContext,
        commonWeekContextDigest: commonContextDigest(commonWeekContext) };
    }
    authority = { ...builderBinding, protocolVersion: 2, presentationVersion: 'human_v2', contractVersion: contract.contractVersion, policyVersion: contract.policyVersion,
      contractDigest: weeklyDigest(contract), contextDigest: contract.contextDigest, prescriptionScope: contract.prescriptionScope,
      admittedSlots, snapshotDigest: snapshotDigest(request.snapshot), generationDigest: weeklyDigest(generationToken),
      ...(request.coherenceVersion === 1 ? { coherenceVersion: 1, coachingDecisions: admission.decisions ?? {},
        longitudinal: await loadLongitudinalProjection(db, codigo, week) } : {}),
      ...(contract.regeneration ? { regeneration: contract.regeneration } : {}),
      ...(contract.strategy ? { strategy: contract.strategy } : {}),
      planning: { today: request.today, empezarHoy: request.empezarHoy,
        preservationVersion: request.preservationVersion ?? 2,
        ...(request.openCoachVersion ? { openCoachVersion: request.openCoachVersion } : {}),
        ...(request.coherenceVersion === 1 ? { coherenceVersion: 1 } : {}),
        ...(request.preserveDays ? { preserveDays: request.preserveDays } : {}),
        ...(request.planningRunId ? {planningRunId:request.planningRunId} : {}),
        ...(request.confirmedAvailabilityDigest === availabilitySnapshotDigest(c, week)
          ? { confirmedAvailabilityDigest: request.confirmedAvailabilityDigest } : {}),
        ...(request.strategyVersion === 1 ? { strategyVersion: 1, ...(request.strategyProposal !== undefined ? { strategyProposal: request.strategyProposal } : {}) } : {}) } };
  }
  const payload = Buffer.from(JSON.stringify({ codigo, week, slots: result.slots, expires: Date.now() + 30 * 60_000, ...authority })).toString('base64url');
  // Catch changes during Planner composition before issuing any authority.
  if (admission) await assertFreshWeeklyAuthority(db, codigo, week, payload + '.' + mac(payload), admission.generationToken);
  return payload + '.' + mac(payload);
}

/** The only calendar HMAC verifier, shared by Builder, session evidence and save. */
export function verifyWeeklyCalendarReceipt(receipt: unknown, codigo: string, week: string, requireV2 = false) {
  if (typeof receipt !== 'string' || receipt.length > 128000) throw new Error('CALENDAR_RECEIPT_REQUIRED');
  const [payload, signature, extra] = receipt.split('.');
  if (!payload || !signature || extra !== undefined) throw new Error('CALENDAR_RECEIPT_INVALID');
  const expected = Buffer.from(mac(payload)), actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('CALENDAR_RECEIPT_INVALID');
  const evidence = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (evidence.codigo !== codigo || evidence.week !== week || !Number.isFinite(evidence.expires) || Date.now() > evidence.expires) throw new Error('CALENDAR_RECEIPT_EXPIRED');
  if (requireV2 && evidence.protocolVersion !== 2) rejectWeekly('WEEKLY_RECEIPT_UPGRADE_REQUIRED');
  if (evidence.protocolVersion !== undefined && evidence.protocolVersion !== 2) rejectWeekly('WEEKLY_PROTOCOL_UNSUPPORTED');
  if (evidence.contractVersion !== 3 && receipt.length > 64000) throw new Error('CALENDAR_RECEIPT_REQUIRED');
  verifyCommonWeekContext(evidence);
  authenticatedPresentationVersion(evidence.presentationVersion);
  return evidence;
}

/** Save derives text from signed canonical strategy; legacy receipts retain their historical field. */
export function admittedWeekObjective(receipt: unknown, codigo: string, week: string, legacy: string | null, finalSessions: readonly any[] = []) {
  const evidence = verifyWeeklyCalendarReceipt(receipt, codigo, week, true);
  if (evidence.contractVersion === 3) return finalSessions.filter(s => s.structuredPrescription?.finalDecision?.kind === 'session_decision').map(s => s.structuredPrescription.finalDecision.stimulus).filter((s,i,a)=>a.indexOf(s)===i).join(' · ') || null;
  if (evidence.coherenceVersion === 1 && evidence.strategy)
    return selectedWeekObjective(evidence.strategy, evidence.admittedSlots, evidence.coachingDecisions);
  return evidence.strategy ? authenticatedPresentationVersion(evidence.presentationVersion) === 'human_v2'
    ? humanWeeklyObjective(evidence.strategy) : renderWeekObjective(evidence.strategy) : legacy;
}

/** Current context once per admission, never per candidate option. No writes or expansion. */
export async function assertFreshWeeklyAuthority(db: any, codigo: string, week: string, receipt: unknown, generationToken?: unknown) {
  const evidence = verifyWeeklyCalendarReceipt(receipt, codigo, week, true);
  if (generationToken !== undefined && evidence.generationDigest !== weeklyDigest(generationToken)) rejectWeekly('WEEKLY_GENERATION_MISMATCH');
  const row = await db.from('weekly_plan').select('*').eq('user_codigo', codigo).eq('week_start', week).maybeSingle();
  if (row.error) rejectWeekly('WEEKLY_FRESHNESS_READ_FAILED');
  if (row.data && (row.data.user_codigo !== codigo || row.data.week_start !== week)) rejectWeekly('WEEKLY_CONTEXT_STALE');
  if (snapshotDigest(row.data) !== evidence.snapshotDigest) rejectWeekly('WEEKLY_REVISION_STALE');
  const current = await loadWeeklyPlanningContext(db, codigo, { targetWeekStart: week, preservationVersion: 1, ...evidence.planning, snapshot: row.data })
    .catch(error => { if (error?.message === 'STRATEGY_PROPOSAL_INVALID') rejectWeekly('WEEKLY_CONTEXT_STALE'); throw error; });
  if (!current.ok) rejectWeekly('WEEKLY_CONTEXT_STALE');
  if (evidence.coherenceVersion === 1 && weeklyDigest(current.longitudinal) !== weeklyDigest(evidence.longitudinal)) rejectWeekly('WEEKLY_CONTEXT_STALE');
  const rebuilt = buildAllowedWeeklyPlanContract(current.input);
  if (!rebuilt.ok || rebuilt.contract.contextDigest !== evidence.contextDigest || weeklyDigest(rebuilt.contract) !== evidence.contractDigest
    || rebuilt.contract.policyVersion !== evidence.policyVersion || rebuilt.contract.contractVersion !== evidence.contractVersion)
    rejectWeekly('WEEKLY_CONTEXT_STALE');
  return { evidence, contexts: current.input.contexts, availabilityConfirmed: current.availabilityConfirmed, allowed: current.input.allowed };
}

/** Save uses the signed calendar's preservation decisions, never old type or client flags. */
export function weeklySaveAdmission(receipt: unknown, codigo: string, week: string, sessions: readonly { dia: string }[]) {
  const evidence = verifyWeeklyCalendarReceipt(receipt, codigo, week, true);
  const outcome = weeklyRegenerationOutcome(evidence.regeneration, evidence.admittedSlots);
  const survivorIndices = sessions.flatMap((session, index) => evidence.admittedSlots.some((slot: { day: string; protectedSessionDigest?: string }) =>
    slot.day === calendarKey(session.dia) && slot.protectedSessionDigest === weeklyDigest(session)) ? [index] : []);
  return { outcome, survivorIndices };
}

/** Request fields are comparisons only; returned values originate from the signed server option. */
export function resolveWeeklySlot(evidence: any, request: Record<string, any>) {
  const slot = evidence.admittedSlots.find((s: any) => s.day === request.day);
  if (!slot || request.optionId !== slot.optionId) rejectWeekly('WEEKLY_SLOT_MISMATCH');
  if (!isExecutableCalendarState(slot.state) || slot.protected) rejectWeekly('WEEKLY_SLOT_NOT_EXECUTABLE');
  const expected: Record<string,unknown> = { targetWeekStart: evidence.week, targetDate: slot.targetDate, contractDigest: evidence.contractDigest,
    contextDigest: evidence.contextDigest, discipline: slot.discipline, stimulus: slot.stimulusId, intent: slot.intent, state: slot.state,
    tipo: slot.discipline, stimulusId: slot.stimulusId,
    titulo_breve: slot.stimulusId?.replaceAll('_', ' '), tituloBreve: slot.stimulusId?.replaceAll('_', ' '), focus: slot.stimulusId };
  if (evidence.contractVersion === 3) {
    for (const key of ['stimulus','intent','state','stimulusId','titulo_breve','tituloBreve','focus']) delete expected[key];
    expected.coachingGuidance = slot.coachingGuidance;
    if (request.state !== undefined && !isExecutableCalendarState(request.state)) rejectWeekly('WEEKLY_SLOT_MISMATCH');
  }
  for (const [field, value] of Object.entries(expected)) {
    if (Object.hasOwn(request, field) && !samePlanData(request[field], value)) rejectWeekly('WEEKLY_SLOT_MISMATCH');
  }
  return slot;
}

export async function assertWeeklyCalendar(db: any, codigo: string, week: string, sessions: any[], receipt: unknown,
  options: { requireV2?: boolean; generationToken?: unknown; sessionEvidence?: any[]; wholeWeekReviewed?: boolean } = {}) {
  const evidence = verifyWeeklyCalendarReceipt(receipt, codigo, week, options.requireV2);
  if (evidence.builderProtocol) {
    const days = sessions.map(s => calendarKey(s.dia));
    if (days.length !== 7 || new Set(days).size !== 7 || days.some(d => !calendarDays.includes(d))) rejectWeekly('WEEKLY_SLOT_COVERAGE_INVALID');
    const expected = evidence.admittedSlots.filter((s: any) => !s.protected && isExecutableCalendarState(s.state)).map((s: any) => s.day);
    const supplied = (options.sessionEvidence ?? sessions.filter(s => s.sessionReceipt)).map((s: any) => calendarKey(s.dia));
    if (supplied.length !== expected.length || new Set(supplied).size !== expected.length || supplied.some((d: string) => !expected.includes(d)))
      rejectWeekly('WEEKLY_SESSION_COVERAGE_INVALID');
  }
  let contexts: Record<string, any> = {};
  if (evidence.protocolVersion === 2) {
    contexts = (await assertFreshWeeklyAuthority(db, codigo, week, receipt, options.generationToken)).contexts;
    for (const slot of evidence.admittedSlots) {
      const saved = sessions.find(s => calendarKey(s.dia) === slot.day);
      if (slot.protectedSessionDigest && (!saved || weeklyDigest(saved) !== slot.protectedSessionDigest))
        rejectWeekly('WEEKLY_PROTECTED_SESSION_MISMATCH');
      if (slot.protected || !isExecutableCalendarState(slot.state)) continue;
      const session = (options.sessionEvidence || sessions).find((s: any) => calendarKey(s.dia) === slot.day);
      if (!session) rejectWeekly('WEEKLY_SESSION_EVIDENCE_REQUIRED');
      verifySessionReceipt(session.sessionReceipt, session, codigo, week, receipt as string);
      if (evidence.coherenceVersion === 1 && !evidence.builderProtocol) {
        const proof = JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0], 'base64url').toString());
        if (!proof.weekly?.priorSessions) rejectWeekly('WEEKLY_SIBLING_EVIDENCE_REQUIRED');
        for (const [day, digest] of Object.entries(options.wholeWeekReviewed ? {} : proof.weekly.priorSessions)) {
          const sibling = (options.sessionEvidence || sessions).find((s: any) => calendarKey(s.dia) === day);
          if (!sibling || weeklyDigest(verifySessionReceipt(sibling.sessionReceipt, sibling, codigo, week, receipt as string)) !== digest)
            rejectWeekly('WEEKLY_SIBLING_CONTEXT_CHANGED');
        }
      }
    }
  }
  const c = await loadWeeklyCalendarContext(db, codigo, week);
  const openCoach = [2,3].includes(evidence.contractVersion);
  const calendarSlots = evidence.contractVersion === 3 ? evidence.slots.map((slot:any) => {
    const authorization = evidence.admittedSlots.find((s:any)=>s.day===slot.day);
    const final = sessions.find(s=>calendarKey(s.dia)===slot.day);
    return authorization && !authorization.protected && isExecutableCalendarState(authorization.state) && final && isExecutableCalendarState(calendarState(final))
      ? {...slot,state:calendarState(final)} : slot;
  }) : evidence.slots;
  const result = validateWeeklyCalendar(sessions, openCoach ? 7 : c.max, c.allowed, calendarSlots, openCoach);
  if (!result.ok) throw new Error(result.errors.join(','));
  if (evidence.contractVersion === 3 && process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') { try { console.info('WEEKLY_GUIDANCE_SAVE', {version:2,status:'PASS',decisions:sessions.filter(s=>s.structuredPrescription?.finalDecision).map(s=>({day:calendarKey(s.dia),digest:weeklyDigest(s.structuredPrescription.finalDecision)}))}); } catch { /* Observation only. */ } }
  return { evidence, contexts };
}

/** Reuses the calendar HMAC infrastructure; summary is evidence, never a bypass of final validation. */
export function issueWholeWeekReceipt(codigo:string,week:string,calendarReceipt:string,sessions:readonly any[],result:any,repairCount:number,
  orchestration?: {localRepairCount:number;targetedRegenerationCount:number;affectedSessionIds:string[];finalStatus:string;
    reconsideration?: { count:number;decision:string;rationale:string;revisedDays:string[];failure:string|null }}) {
  const payload = Buffer.from(JSON.stringify({kind:'whole-week-validation',version:1,codigo,week,
    calendarDigest:weeklyDigest(calendarReceipt),contentDigest:weeklyDigest(sessions),status:result.status,
    diagnosticCodes:result.diagnostics.map((d:any)=>d.code),repairCount,
    ...(orchestration?{orchestration:{localRepairCount:orchestration.localRepairCount,targetedRegenerationCount:orchestration.targetedRegenerationCount,
      affectedSessionIds:orchestration.affectedSessionIds,finalStatus:result.status,
      ...(orchestration.reconsideration ? { reconsideration: orchestration.reconsideration } : {})}}:{})})).toString('base64url');
  return payload + '.' + mac(payload);
}

/** Session edits cannot evade whole-week safety or erase an existing protected day. */
export async function assertCalendarMutation(db: any, codigo: string, before: readonly any[], after: readonly any[]) {
  const c = await loadWeeklyCalendarContext(db, codigo);
  const protectedSlots = before.map(s => ({ day: calendarKey(s.dia), state: calendarState(s), type: s.tipo }));
  const existingCount = before.filter(s => isExecutableCalendarState(calendarState(s))).length;
  const result = validateWeeklyCalendar(after, Math.max(c.max, existingCount), c.allowed, protectedSlots, existingCount === 7);
  if (!result.ok) throw new Error(result.errors.join(','));
}
