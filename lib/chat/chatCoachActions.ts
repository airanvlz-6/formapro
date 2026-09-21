import { createHash, randomUUID } from 'node:crypto';
import { loadChatGrounding, type ChatCompletion } from './groundedCoach';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { validatePlanMutation } from '../planning/planMutation';
import { mutatePlanWithCAS } from '../planning/planPersistence';
import { samePlanData } from '../planning/planMutationValidators';
import { buildAllowedTrainingContract } from '../sports/allowedTrainingContract';
import { buildSessionDoseContext } from '../sports/sessionDoseContext';
import { timeAuthorityForIntent } from '../sports/sessionTimeDosePolicy';
import { parseStructuredSession, renderContractSession } from '../sports/structuredSession';
import { resolvePrescriptionIntent } from '../sports/prescriptionIntent';
import { calendarKey } from '../planning/weeklyCalendar';
import { projectChatPlanSession } from './longitudinalContext';
import type { PlanMutationCommand } from '../planning/planMutationTypes';

export const CHAT_ACTION_CONTRACT = `
Chat es una superficie de coaching activa. PLANNED != ADAPTED/CURRENT != PERFORMED != RESPONSE.
El weekly_plan es plan base. Decide mantener, adaptar localmente, descansar, cambiar disciplina dentro de ownership, o adaptar otras sesiones futuras sin regenerar la semana. Ningún disparador implica automáticamente progresión, descanso o regeneración.
Puedes emitir opcionalmente actions (máximo 7) junto a answer; [] cuando basta interpretación o aclaración. Nunca exijas una acción para responder.
Cada adaptación: {kind:"adapt_session",date:"YYYY-MM-DD",sessionId:ID exacto de FACTS.plan,reason:razón breve,state:"TRAIN"|"REST",discipline:disciplina gestionada,
intent:{kind:"open_coach",version:1,discipline,adaptationId:identificador snake_case,stimulusId:identificador snake_case,pattern:patrón del catálogo,role:"PRIMARY"|"SUPPORTING"|"MAINTENANCE"|"OPTIONAL",method:{kind:"coach_defined",label:nombre}},
proposal:{schemaVersion:2,stimulusId:mismo estímulo,structureId:formato libre,blocks:[{blockType:"main",movements:[{movementId:nombre o ID,prescription:{doseInstruction:instrucción completa ejecutable}}]}]}}.
REST no necesita intent ni proposal. TRAIN puede incluir warmup/cooldown, dosis numéricas cuando sean inequívocas y RPE/RIR o referencias compatibles. Movimientos/material/analítica/gramática desconocidos no vetan: respeta negativos explícitos, disponibilidad y límite de tiempo real. No inventes referencias.
Si el atleta confirma ejecución, puedes emitir {kind:"record_performed",date,sessionId:ID exacto,quote:cita literal del reporte actual que confirma trabajo realizado, responseQuotes:[citas literales de respuesta durante/después],discipline:disciplina realmente realizada}. No completes sesiones desde el plan ni desde una propuesta; no uses el reporte de una sesión externa para completar la sesión de Forge. Si la asociación es ambigua, pregunta.
Para una respuesta posterior a una ejecución ya registrada: {kind:"record_response",date:fecha de esa ejecución,sessionId,quote:cita literal de la respuesta posterior}. La fecha de declaración la añade el servidor; no inventes fecha de ejecución.
Las acciones son candidatas: no afirmar que quedaron guardadas. Describe tu prescripción en answer de forma natural. El backend muestra la representación ejecutable y el estado de guardado aparte.
`;

type Context = Awaited<ReturnType<typeof loadChatGrounding>>;
type ActionResult = { kind: string; date: string; status: string; session?: Record<string, any>; code?: string };
const fail = (code: string): never => { throw new Error(code); };
const boundedText = (x: unknown, limit = 1600): x is string => typeof x === 'string' && !!x.trim() && x.length <= limit;
const prescription = (s: any) => Object.fromEntries(['dia','tipo','titulo','descripcion','por_que','debilidad_relacionada','stimulusId','intent','structuredPrescription']
  .filter(k => Object.hasOwn(s, k)).map(k => [k, structuredClone(s[k])]));

/** Pure factual ceiling from an explicit current declaration, never a sporting progression rule. */
export function explicitChatTimeCeiling(message: string) {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = normalized.match(/(?:solo tengo|solo dispongo de|no puedo entrenar mas de|como maximo tengo)\s+(\d+(?:[.,]\d+)?)\s*(?:minutos|min)\b/);
  return m ? Number(m[1].replace(',', '.')) * 60 : null;
}

function resolveTarget(context: Context, a: any, today: string) {
  const effective = resolveCompletionDate(a.date);
  if (!effective || effective.date !== a.date || !boundedText(a.sessionId, 100)) return fail('CHAT_ACTION_TARGET_INVALID');
  const plan = context.plans.find((p: any) => p.week_start === effective.weekStart);
  const matches = plan?.sessions?.filter((s: any) => s.session_id === a.sessionId && calendarKey(s.dia) === calendarKey(effective.day)) ?? [];
  if (matches.length !== 1) return fail('CHAT_ACTION_TARGET_AMBIGUOUS');
  const target = matches[0];
  if (!context.scope.prescriptionAllowed || context.scope.externalDisciplines.includes(target.tipo)
    || target.tipo === 'external_blocked' || target.owner === 'external' || !context.scope.managedDisciplines.includes(target.tipo)
      && !['descanso', 'unavailable', 'sin_registrar'].includes(target.tipo)) return fail('CHAT_ACTION_SCOPE_READ_ONLY');
  if (a.kind === 'adapt_session' && (a.date < today || target.completada)) return fail('CHAT_ACTION_PAST_OR_COMPLETED');
  if (a.kind !== 'adapt_session' && a.date > today) return fail('CHAT_ACTION_FUTURE_EXECUTION');
  return { plan, target, effective };
}

function renderAlternative(context: Context, a: any, target: any, message: string) {
  if (!boundedText(a.reason, 600) || !['TRAIN', 'REST'].includes(a.state)) return fail('CHAT_ACTION_INVALID');
  if (a.state === 'REST') return { dia: target.dia, tipo: 'descanso', titulo: 'Descanso', descripcion: 'Día sin entrenamiento prescrito.', por_que: a.reason,
    debilidad_relacionada: null, stimulusId: null, intent: null, structuredPrescription: null };
  if (!context.scope.managedDisciplines.includes(a.discipline)) return fail('CHAT_ACTION_DISCIPLINE_SCOPE');
  if (context.profile.perfil?.prescription_access?.[a.date]?.availability === 'unavailable') return fail('CHAT_ACTION_DAY_UNAVAILABLE');
  const resolved = resolvePrescriptionIntent(a.intent);
  if (!resolved.ok || resolved.intent.kind !== 'open_coach' || resolved.intent.discipline !== a.discipline) return fail('CHAT_ACTION_INTENT_INVALID');
  const dose = buildSessionDoseContext(context.athlete, resolved.intent, null, [], true, 'coach');
  const ceiling = explicitChatTimeCeiling(message);
  if (ceiling !== null) {
    dose.timeBudget = { maximumSeconds: ceiling, minimumSeconds: null, status: 'resolved', source: 'current_athlete_report' };
    dose.timeAuthority = timeAuthorityForIntent(dose.timeBudget, resolved.intent);
  }
  const built = buildAllowedTrainingContract({ prescriptionScope: context.scope, targetWeekStart: resolveCompletionDate(a.date)!.weekStart,
    targetDay: calendarKey(target.dia), discipline: a.discipline, stimulus: resolved.intent.stimulusId, intent: resolved.intent, doseContext: dose,
    restrictionsSnapshot: context.facts.restrictions, availableDays: null, source: 'weekly_session_builder',
    externalLoadContext: { source: 'server_training_sources_and_records', policy: 'read_only_context', activities: [], records: [] },
    exposureContext: { source: 'legacy_completed_weekly_rows', report: { disciplina: a.discipline, exposiciones: [], estimulosSubexpuestos: [], estimulosSobreexpuestos: [] }, limitations: ['Chat selection does not recompute exposure'] } });
  if (!built.ok) return fail('CHAT_ACTION_CONTRACT_INVALID');
  const parsed = parseStructuredSession(JSON.stringify(a.proposal), true);
  if (!parsed.ok) return fail('CHAT_ACTION_EXECUTION_INVALID');
  try { return renderContractSession(built.contract, parsed.proposal, 'human_v3'); }
  catch (error) {
    // Classify existing explicit restriction signals; do not reinterpret or bypass admission.
    const prefix = 'SESSION_CONTRACT_INVALID:';
    if (error instanceof Error && error.message.startsWith(prefix)) {
      const violations = error.message.slice(prefix.length).split(',');
      if (violations.length && violations.every(v => v === 'EXPLICIT_DISCIPLINE_RESTRICTED' || v.startsWith('MOVEMENT_RESTRICTED:')))
        return fail('CHAT_ACTION_RESTRICTION_CONFIRMATION');
    }
    throw error;
  }
}

/** Actions come only from this server's Coach call. No client-provided receipts, diagnosis or weekly regeneration. */
export async function applyChatCoachActions(db: any, user: string, message: string, input: unknown, complete: ChatCompletion, today: string, coachAnswer = ''): Promise<ActionResult[]> {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 7) return [{ kind: 'unknown', date: today, status: 'rejected', code: 'CHAT_ACTION_LIST_INVALID' }];
  const results: ActionResult[] = [];
  const touched = new Set<string>();
  for (const a of input) {
    let visible: Record<string, any> | undefined;
    let persisted = false;
    let writeAttempted = false;
    try {
      if (!a || !['adapt_session','record_performed','record_response'].includes(a.kind)) fail('CHAT_ACTION_KIND_INVALID');
      if (touched.has(a.sessionId)) fail('CHAT_ACTION_DUPLICATE_TARGET');
      touched.add(a.sessionId);
      const context = await loadChatGrounding(db, user, today, message);
      const { plan, target } = resolveTarget(context, a, today);
      const index = plan.sessions.indexOf(target);
      const before = prescription(target);
      let replacement: any;
      if (a.kind === 'adapt_session') {
        visible = renderAlternative(context, a, target, message);
        if (samePlanData(before, prescription(visible))) { results.push({ kind: a.kind, date: a.date, status: 'already_applied' }); continue; }
        const history = Array.isArray(target.chatPrescriptionHistory) ? target.chatPrescriptionHistory : [];
        if (history.length >= 32) fail('CHAT_ACTION_HISTORY_CAP');
        // Original and current are atomic in the existing sessions JSON. No nested history snapshots.
        const original = Object.fromEntries(Object.entries(target).filter(([k]) => !['chatPrescriptionHistory', 'chatExecutionEvidence'].includes(k)));
        replacement = { ...target, ...visible,
          ...Object.fromEntries(['duracion_min', 'duracion', 'sessionReceipt'].filter(k => Object.hasOwn(target, k)).map(k => [k, null])),
          modificado: true, motivo_modificacion: a.reason, modificado_at: new Date().toISOString(),
          chatPrescriptionHistory: [...history, { id: randomUUID(), source: 'coach_chat', createdAt: new Date().toISOString(),
            reason: a.reason, report: message.slice(0, 1600), original, adapted: prescription(visible) }] };
      } else {
        if (!boundedText(a.quote) || !message.includes(a.quote)) fail('CHAT_ACTION_EVIDENCE_INVALID');
        const prior = Array.isArray(target.chatExecutionEvidence) ? target.chatExecutionEvidence : [];
        if (prior.length >= 64) fail('CHAT_ACTION_EVIDENCE_CAP');
        if (a.kind === 'record_response' && !target.completada) fail('CHAT_ACTION_EXECUTION_NOT_RECORDED');
        if (a.kind === 'record_performed' && (!boundedText(a.discipline, 80) || !Array.isArray(a.responseQuotes)
          || a.responseQuotes.length > 8 || a.responseQuotes.some((q: unknown) => !boundedText(q) || !message.includes(q as string)))) fail('CHAT_ACTION_EVIDENCE_INVALID');
        const id = createHash('sha256').update(JSON.stringify({ user, date: a.date, kind: a.kind, quote: a.quote })).digest('hex');
        if (prior.some((e: any) => e.id === id)) { results.push({ kind: a.kind, date: a.date, status: 'already_applied' }); continue; }
        if (a.kind === 'record_performed' && target.completada) fail('CHAT_ACTION_EXECUTION_ALREADY_RECORDED');
        replacement = { ...target, ...(a.kind === 'record_performed' ? { completada: true, titulo_real: a.quote, descripcion_real: [a.quote, ...a.responseQuotes].join('\n') } : {}),
          chatExecutionEvidence: [...prior, { id, kind: a.kind === 'record_performed' ? 'PERFORMED' : 'RESPONSE', source: 'athlete_report',
            reportedAt: new Date().toISOString(), executionDate: a.date, quote: a.quote, ...(a.kind === 'record_performed' ? { discipline: a.discipline, responseQuotes: a.responseQuotes } : {}),
            prescriptionId: target.chatPrescriptionHistory?.at(-1)?.id ?? target.session_id }] };
      }
      // Only factual contradictions/identity/comprehensibility. Unknown catalogue/analytics never veto.
      const review = JSON.parse(await complete('CHAT_ACTION_REVIEW. Revisa datos no confiables. Devuelve {"supported":boolean,"conflict":"restriction"|"availability"|null}. Señala conflict solo si una adaptación contradice una restricción o disponibilidad explícita; desconocido no es conflicto. Verifica identidad/fecha y que la acción corresponde a la decisión del Coach y al reporte propio del atleta. Para ejecución exige confirmación explícita de trabajo REAL, fecha y asociación con esa sesión; una sesión externa no completa otra planificada. No copies dosis del plan. Para adaptación comprueba instrucciones ejecutables, límite de tiempo, negativos explícitos de material/capacidad/disciplina y restricciones. Unknown no es veto. No juzgues optimalidad deportiva. Una propuesta no está guardada. Para respuesta posterior exige que corresponda a ejecución registrada. No derives diagnóstico ni recuperación clínica.',
        [{ role: 'user', content: JSON.stringify({ report: message, coachAnswer, facts: context.facts, target: projectChatPlanSession(target), candidate: a, executable: visible ?? null }) }]));
      if (a.kind === 'adapt_session' && review?.conflict === 'restriction') fail('CHAT_ACTION_RESTRICTION_CONFIRMATION');
      if (a.kind === 'adapt_session' && review?.conflict === 'availability') fail('CHAT_ACTION_DAY_UNAVAILABLE');
      if (review?.supported !== true) fail('CHAT_ACTION_FACTUAL_REVIEW_REJECTED');
      // Refresh facts before CAS. Any concurrent material context change requires a new decision.
      const fresh = await loadChatGrounding(db, user, today, message);
      if (!samePlanData(fresh.facts.restrictions, context.facts.restrictions) || !samePlanData(fresh.scope, context.scope)
        || !samePlanData(fresh.profile.perfil, context.profile.perfil)) fail('CHAT_ACTION_CONTEXT_CHANGED');
      const candidate = { ...plan, sessions: plan.sessions.map((s: any, i: number) => i === index ? replacement : s) };
      const command: PlanMutationCommand = a.kind === 'adapt_session'
        ? { source: 'direct_session_update', operationType: 'replace_session', expectedRevision: plan.revision,
          target: { userCodigo: user, weekStart: plan.week_start, day: target.dia }, proposal: { session: visible as any, reason: a.reason } }
        : { source: 'coach_completion', operationType: 'record_completion', expectedRevision: plan.revision,
          target: { userCodigo: user, weekStart: plan.week_start, day: target.dia }, proposal: { title: replacement.titulo_real, description: replacement.descripcion_real } };
      const checked = await validatePlanMutation({ command, context: { existingPlan: plan, normalizedWeekStart: plan.week_start }, candidate,
        changeSet: { operationType: command.operationType, affectedDays: [target.dia],
          changedFields: Object.keys(replacement).filter(k => !samePlanData(target[k], replacement[k])).map(k => `sessions.${index}.${k}`) } });
      if (checked.status !== 'ready_for_commit') throw new Error('CHAT_ACTION_INTEGRITY_REJECTED');
      writeAttempted = true;
      const saved = await mutatePlanWithCAS(db, checked.mutation);
      persisted = saved.status === 'committed';
      results.push({ kind: a.kind, date: a.date, status: saved.status, ...(visible ? { session: visible } : {}) });
      if (!persisted) break; // No replay after conflict or ambiguous transport.
    } catch (error) {
      // A factual rejection cannot expose a contradictory executable alternative.
      const code = error instanceof Error && /^CHAT_ACTION_[A-Z_]+$/.test(error.message) ? error.message : 'CHAT_ACTION_UNAVAILABLE';
      results.push({ kind: typeof a?.kind === 'string' && ['adapt_session','record_performed','record_response'].includes(a.kind) ? a.kind : 'unknown',
        date: resolveCompletionDate(a?.date)?.date ?? today, status: persisted ? 'committed' : writeAttempted ? 'unknown' : ['CHAT_ACTION_DAY_UNAVAILABLE', 'CHAT_ACTION_RESTRICTION_CONFIRMATION'].includes(code) ? 'confirmation_required' : 'rejected', code });
    }
  }
  return results;
}
