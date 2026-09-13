import { beginWeeklyGeneration } from '../planning/weeklyGeneration';
import { planBoundedWeek } from '../planning/prepareAllowedWeeklyPlanContract';
import { calendarDays, calendarKey } from '../planning/weeklyCalendar';
import { assertWeeklyCalendar, admittedWeekObjective, verifyWeeklyCalendarReceipt } from '../planning/weeklyCalendarAuthority';
import { enforceWholeWeek } from '../planning/enforceWholeWeek';
import { generateTrainingSession, admitSessionContent, assertFreshSessionRestrictions } from '../sports/sessionAuthority';
import { prepareWeeklyEntries, admitWeeklyCandidate } from '../planning/prepareWeeklyCandidate';
import { validatePlanMutation } from '../planning/planMutation';
import { mutatePlanWithCAS } from '../planning/planPersistence';
import { chatDiagnostic, loadChatGrounding } from './groundedCoach';

/** Scope selection is a Coach decision. All sports content comes from the existing Weekly/Session authorities. */
export async function adaptChatPlan(db: any, user: string, today: string, impacted: { weekStart: string; day: string }[],
  complete: (prompt: string) => Promise<string>) {
  if (!impacted.length) return { status: 'not_needed', weeks: [] };
  const grounding = await loadChatGrounding(db, user, today);
  const generation = await beginWeeklyGeneration(db, user, today);
  const outcomes: { week: string; status: string; code?: string }[] = [];
  for (const week of [...new Set(impacted.map(i => i.weekStart))]) {
    const snapshot = generation.snapshots[week];
    if (!snapshot) { outcomes.push({ week, status: 'pending', code: 'CHAT_ADAPTATION_HORIZON_UNSUPPORTED' }); continue; }
    try {
      const affected = impacted.filter(i => i.weekStart === week).map(i => i.day);
      const eligible = snapshot.sessions.filter(s => !s.completada && s.tipo !== 'external_blocked'
        && new Date(Date.parse(week) + calendarDays.indexOf(calendarKey(s.dia)) * 86400000).toISOString().slice(0, 10) >= today).map(s => calendarKey(s.dia));
      const scope = JSON.parse(await complete(`Reevalúa el alcance mínimo tras una indisponibilidad temporal declarada. Eres Weekly Coach: decide si basta retirar esa exposición o si conviene redistribuir otras sesiones futuras. No prescribas sustituciones aquí. Devuelve SOLO {"reassessDays":[días],"reason":"razón breve"}. Incluye afectados, usa únicamente elegibles, conserva todo lo no implicado.\nAFECTADOS:${JSON.stringify(affected)}\nELEGIBLES:${JSON.stringify(eligible)}\nPLAN:${JSON.stringify(snapshot.sessions)}\nHECHOS ACTUALES:${JSON.stringify(grounding.facts)}\nCONTEXTO ORIENTATIVO, NO HECHOS CONFIRMADOS:${JSON.stringify(grounding.advisory)}`));
      if (!Array.isArray(scope.reassessDays) || !affected.every(d => scope.reassessDays.includes(d))
        || scope.reassessDays.some((d: unknown) => typeof d !== 'string' || !eligible.includes(d))
        || typeof scope.reason !== 'string' || !scope.reason.trim() || scope.reason.length > 500) throw new Error('CHAT_ADAPTATION_SCOPE_INVALID');
      const preserveDays = calendarDays.filter(day => !scope.reassessDays.includes(day));
      const planned = await planBoundedWeek(db, user, { targetWeekStart: week, today, empezarHoy: true, snapshot,
        strategyVersion: 1, coherenceVersion: 1, openCoachVersion: 1, planningRunId: generation.planningRunId, preserveDays }, complete, generation.token);
      if (!planned.ok) throw new Error(planned.code ?? 'CHAT_WEEK_REASSESSMENT_FAILED');
      const structure = planned.estructura, receipt = structure.calendarReceipt!;
      const sourceSessions: any[] = [];
      const acceptedCurrentWeek: any[] = [];
      for (const slot of structure.sessions as any[]) {
        if (slot.weeklyProtected || slot.tipo === 'unavailable' || slot.tipo === 'external_blocked' || slot.tipo === 'sin_registrar') {
          const { weeklyProtected: _protected, optionId: _option, targetDate: _date, ...content } = slot;
          sourceSessions.push(content); continue;
        }
        if (slot.state === 'REST') { sourceSessions.push(admitSessionContent({ dia: slot.dia, tipo: 'descanso' }, user, week)); continue; }
        const generated = await generateTrainingSession(db, user, { targetWeekStart: week, day: slot.dia, discipline: slot.tipo,
          stimulus: slot.stimulusId, intent: slot.intent, state: slot.state, acceptedCurrentWeek,
          weekly: { receipt, generationToken: generation.token, optionId: slot.optionId, claims: slot } }, complete,
        JSON.stringify({ change: 'temporary_availability', affected, reassessmentReason: scope.reason }), generation.planningRunId);
        if (!generated.ok) throw new Error(generated.code ?? 'CHAT_SESSION_REASSESSMENT_FAILED');
        sourceSessions.push(generated.sesion);
        acceptedCurrentWeek.push(generated.sesion);
      }
      const rows = sourceSessions.map(({ sessionReceipt: _receipt, ...s }) => s);
      const authority = await assertWeeklyCalendar(db, user, week, rows, receipt, { requireV2: true, generationToken: generation.token, sessionEvidence: sourceSessions });
      const checked = await enforceWholeWeek(user, week, rows, sourceSessions, receipt, authority, complete);
      if (!checked.ok) throw new Error('CHAT_WHOLE_WEEK_REJECTED');
      const survivors = snapshot.sessions.flatMap((s, i) => preserveDays.includes(calendarKey(s.dia)) || s.completada || s.tipo === 'external_blocked' ? [i] : []);
      const entries = prepareWeeklyEntries(checked.sessions, snapshot, survivors);
      const longitudinal = verifyWeeklyCalendarReceipt(receipt, user, week, true).longitudinal;
      const admission = admitWeeklyCandidate({ ...snapshot, sessions: checked.sessions,
        week_number: longitudinal.semana, total_weeks_block: longitudinal.totalSemanas, block_name: longitudinal.bloque,
        week_objective: admittedWeekObjective(receipt, user, week, snapshot.week_objective ?? null) }, entries, snapshot);
      if (admission.noOp) { outcomes.push({ week, status: 'unchanged' }); continue; }
      const result = await validatePlanMutation({ command: { source: 'weekly_orchestrator', operationType: 'regenerate_week',
        target: { userCodigo: user, weekStart: week }, expectedRevision: snapshot.revision, proposal: admission.candidate },
      context: { existingPlan: snapshot, normalizedWeekStart: week, identityProof: admission.identityProof }, candidate: admission.candidate,
      changeSet: { operationType: 'regenerate_week', affectedDays: scope.reassessDays, changedFields: ['sessions', 'week_number', 'total_weeks_block', 'block_name', 'week_objective', 'updated_at'] } });
      if (result.status !== 'ready_for_commit') throw new Error('CHAT_PLAN_MUTATION_REJECTED');
      for (const s of checked.sessionEvidence) if (s.sessionReceipt) await assertFreshSessionRestrictions(db, user, week, s);
      await assertWeeklyCalendar(db, user, week, checked.sessions, receipt, { requireV2: true, generationToken: generation.token, sessionEvidence: checked.sessionEvidence,
        wholeWeekReviewed: checked.repairCount > 0 });
      const persisted = await mutatePlanWithCAS(db, result.mutation);
      outcomes.push({ week, status: persisted.status, ...(persisted.status === 'committed' ? {} : { code: 'CHAT_PLAN_SAVE_NOT_CONFIRMED' }) });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'CHAT_ADAPTATION_FAILED';
      outcomes.push({ week, status: 'pending', code });
    }
  }
  chatDiagnostic('CHAT_PLAN_IMPACT', { affectedCount: impacted.length, weeks: outcomes });
  return { status: outcomes.every(o => ['committed', 'unchanged'].includes(o.status)) ? 'adapted' : 'pending', weeks: outcomes };
}
