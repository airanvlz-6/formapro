import { readMethodBaselines } from './runningMethodDeclarations';
import { prescriptionHistorySummary } from './prescriptionHistorySummary';
import { readRunningHabitualConfirmation, type RunningHabitualInteraction } from './runningHabitualConfirmation';
import { projectAthletePrescriptionProfile, record } from './athletePrescriptionContext';
import type { SessionEnvironmentInput } from '../sports/sessionTrainingEnvironment';
import { getCanonicalRestrictions } from './getCanonicalRestrictions';
import { prepareRecoveryContext, assertRecoveryIdentity, type RecoveryContext } from '../physiology/recoveryContext';
import { validDate } from '../physiology/authority';
import type { ReadinessResultado } from '../readiness/readinessEngine';
import { buildExposureReport } from '../sports/exposureEngine';
import { legacySessionView } from '../sports/sessionPresentation';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { resolvePlanningStrategy } from './strategyResolution';
import { projectRunningDoseBaseline } from './runningDoseEvidence';
import { admitRunningDoseEvidence } from '../sports/runningDoseEvidenceAuthority';
import { readRunningExecutionViews } from '../execution/runningExecutionStore';
import { mergeRunningHistory } from '../execution/historicalRunning';
import { RUNNING_DOSE_WINDOWS } from './runningDoseBaseline';

export type PreparedPrescriptionReadiness = { userCodigo: string; effectiveDate: string;
  source: 'canonical_readiness_engine'; result: ReadinessResultado };
export type PrescriptionReadOptions = { runningHabitualInteraction?: RunningHabitualInteraction; asOfDate: string; prescriptionDate?: string; sessionEnvironment?: SessionEnvironmentInput; recovery?: RecoveryContext; readiness?: PreparedPrescriptionReadiness };
export type AthletePrescriptionContext = Awaited<ReturnType<typeof loadAthletePrescriptionContext>>;

/** One server read boundary. No scoring, writes, prompting, receipts or global cache.
 * Prepared recovery/readiness may be reused within the same request and athlete/date only.
 * Query failures throw: unavailable storage is not evidence that an athlete has no restrictions/history.
 */
export async function loadAthletePrescriptionContext(db: any, userCodigo: string, options: PrescriptionReadOptions) {
  if (!userCodigo?.trim() || !validDate(options.asOfDate)) throw new Error('PRESCRIPTION_CONTEXT_INVALID_INPUT');
  if (options.prescriptionDate !== undefined && !validDate(options.prescriptionDate)) throw new Error('PRESCRIPTION_CONTEXT_INVALID_INPUT');
  if (options.sessionEnvironment && options.sessionEnvironment.date !== (options.prescriptionDate || options.asOfDate)) throw new Error('SESSION_ENVIRONMENT_DATE_MISMATCH');
  if (options.recovery) assertRecoveryIdentity(options.recovery, userCodigo, options.asOfDate);
  if (options.readiness && (options.readiness.userCodigo !== userCodigo || options.readiness.effectiveDate !== options.asOfDate
    || options.readiness.source !== 'canonical_readiness_engine')) throw new Error('PRESCRIPTION_READINESS_IDENTITY_MISMATCH');
  const rows = async (table: string, query: PromiseLike<{ data: unknown; error: unknown }>, single = false) => {
    const result = await query;
    if (result.error || (single ? !result.data || Array.isArray(result.data) || typeof result.data !== 'object' : !Array.isArray(result.data)))
      throw new Error(`PRESCRIPTION_CONTEXT_READ_FAILED:${table}`);
    return result.data;
  };
  const [user, plans, modifications, restrictions, recovery, executions] = await Promise.all([
    rows('usuarios', db.from('usuarios').select('modo_entrada,categoria,especialidad,perfil,objetivo_principal,test_atleta,marcas_especificas,historial_marcas,datos_entrenamiento,athlete_development,ciclo_actual,debilidades,workout_history')
      .eq('codigo', userCodigo).single(), true),
    rows('weekly_plan', db.from('weekly_plan').select('week_start,sessions').eq('user_codigo', userCodigo)
      .lte('week_start', options.asOfDate).order('week_start', { ascending: false }).limit(4)),
    rows('session_modification_events', db.from('session_modification_events').select('week_start,dia,trigger_type,reason_code,affected_exercise,objective_impact,created_at')
      .eq('user_codigo', userCodigo).lt('created_at', new Date(Date.parse(options.asOfDate) + 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(30)),
    getCanonicalRestrictions(db, userCodigo, new Date(`${options.asOfDate}T12:00:00Z`)),
    options.recovery ?? prepareRecoveryContext(db, userCodigo, options.asOfDate),
    readRunningExecutionViews(db, userCodigo, {startDate:new Date(Date.parse(options.asOfDate) - (RUNNING_DOSE_WINDOWS[1] - 1) * 86400000).toISOString().slice(0,10),endDate:options.asOfDate}),
  ]);
  const profile = record(user);
  const completedSessions = (plans as unknown[]).flatMap(raw => {
    const plan = record(raw);
    return (Array.isArray(plan.sessions) ? plan.sessions : []).filter(s => record(s).completada === true).map(rawSession => {
      const s = record(rawSession), day = typeof s.dia === 'string' ? s.dia.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
      const index = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].indexOf(day);
      const week = typeof plan.week_start === 'string' ? resolveCompletionDate(plan.week_start) : null;
      const date = week && week.weekStart === plan.week_start && index >= 0
        ? new Date(Date.parse(week.weekStart) + index * 86400000).toISOString().slice(0, 10) : null;
      return { source: 'weekly_plan.sessions', weekStart: plan.week_start, date, sessionId: s.session_id ?? null,
        type: s.tipo ?? null, title: legacySessionView(s).titulo ?? null, actualDescription: s.descripcion_real ?? null,
        modified: s.modificado ?? null, modificationReason: s.motivo_modificacion ?? null };
    });
  }).filter(s => s.date === null || s.date <= options.asOfDate);
  const exposureInput = completedSessions.filter(s => s.date && typeof s.actualDescription === 'string' && s.actualDescription)
    .map(s => ({ fecha: s.date!, tipo: String(s.type ?? ''), titulo: String(s.title ?? ''), descripcionReal: String(s.actualDescription) }));
  const history = Array.isArray(profile.workout_history) ? profile.workout_history : [];
  const fromDate = new Date(Date.parse(options.asOfDate) - 6 * 86400000).toISOString().slice(0, 10);
  const datedHistory = history.map(raw => ({ raw, effective: resolveCompletionDate(record(raw).fecha) }));
  const signals = recovery.objective;
  const projected = projectAthletePrescriptionProfile(profile, options.prescriptionDate || options.asOfDate, options.sessionEnvironment);
  const runningDoseBaseline = projectRunningDoseBaseline(profile, plans as unknown[], projected.running.references, options.asOfDate);
  runningDoseBaseline.structuredExecutions = { ...executions.window, records: executions.window.records.filter(r =>
    r.occurredAt >= runningDoseBaseline.coverage.startDate && r.occurredAt <= options.asOfDate) };
  const habitualConfirmation = readRunningHabitualConfirmation(record(profile.perfil).runningHabitualConfirmation, userCodigo, options.runningHabitualInteraction, runningDoseBaseline.habitualDeclarations?.facts ?? []);
  if (habitualConfirmation) runningDoseBaseline.habitualConfirmation = habitualConfirmation;
  const runningHistory = mergeRunningHistory(userCodigo, profile.workout_history, executions.history, options.asOfDate);
  runningDoseBaseline.prescriptionEvidence = {history:runningHistory,executions:executions.window,
    declarations:readMethodBaselines(profile.perfil,userCodigo,options.runningHabitualInteraction),
    restrictionsActive:restrictions.active,recovery,subjective:{score:null,date:options.asOfDate,source:'readiness_checkins'}};
  return structuredClone({ ...projected, planningStrategy: resolvePlanningStrategy(projected), userCodigo, asOfDate: options.asOfDate,
    runningHistory,
    runningDoseBaseline, runningDoseEvidenceAdmission: admitRunningDoseEvidence(runningDoseBaseline),
    physiology: { source: 'prepareRecoveryContext', recovery, missingSignals: ['hrv', 'restingHr', 'sleepDuration', 'sleepScore']
      .filter(k => record(record(signals)[k]).status !== 'available') },
    readiness: options.readiness ? { status: 'available' as const, ...options.readiness }
      : { status: 'unknown' as const, source: 'canonical_readiness_engine', result: null, reason: 'not_prepared_no_recalculation' },
    restrictions: { source: 'getCanonicalRestrictions', value: restrictions },
    history: { completedSessions, prescriptions: prescriptionHistorySummary(plans as unknown[], options.asOfDate),
      exposure: { source: 'buildExposureReport', byDiscipline: Object.fromEntries(['box', 'carrera', 'fuerza'].map(d => [d, buildExposureReport(exposureInput, d)])),
        limitations: ['last_four_weekly_rows_not_exact_window', 'textual_report_matching', 'no_intra_week_reservations', 'unknown_dates_excluded'] },
      recentFrequency: { source: 'usuarios.workout_history', fromDate, toDate: options.asOfDate,
        completedRecords: datedHistory.filter(h => h.effective && h.effective.date >= fromDate && h.effective.date <= options.asOfDate).length,
        unknownDateRecords: datedHistory.filter(h => !h.effective).length, interpretation: 'record_count_not_deduplicated_training_days' },
      modifications: { source: 'session_modification_events', records: modifications, limitations: ['last_30_events', 'not_all_legacy_modification_paths_emit_events'] },
    },
  });
}
