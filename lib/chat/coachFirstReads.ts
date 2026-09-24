import { calendarKey } from '../planning/weeklyCalendar';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { projectAthletePrescriptionProfile } from '../athlete/athletePrescriptionContext';
import { loadCoachPlanningRead, COACH_PLANNING_READ_MAX_BYTES } from './coachPlanningRead';
import { buildPrescriptionScope, resolveProfileDisciplines } from '../sports/prescriptionScope';
import { buildSessionDoseContext } from '../sports/sessionDoseContext';
import { readAvailabilityConfirmation } from '../sports/chatAvailability';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { projectChatPlanSession } from './longitudinalContext';
import { readCoachProfile, reportedEventProjection } from './coachFirstStore';
import type { ChatActionContext } from './chatCoachActions';
import { loadTrainingLoad } from '../trainingLoad/loadTrainingLoad';

/** Action-local authority context: no longitudinal/history/recovery loader. */
export async function loadCoachActionContext(db: any, user: string, date: string): Promise<ChatActionContext> {
  const day = resolveCompletionDate(date);
  if (!day || day.date !== date) throw new Error('CHAT_ACTION_DATE_INVALID');
  const [p, t, w, restrictions] = await Promise.all([
    db.from('usuarios').select('modo_entrada,categoria,especialidad,perfil,objetivo_principal,test_atleta,marcas_especificas,historial_marcas,datos_entrenamiento,athlete_development,ciclo_actual,debilidades,distribucion_semanal').eq('codigo', user).single(),
    db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', user).eq('activo', true),
    db.from('weekly_plan').select('*').eq('user_codigo', user).eq('week_start', day.weekStart).maybeSingle(),
    getCanonicalRestrictions(db, user),
  ]);
  if (p.error || !p.data || t.error || !Array.isArray(t.data) || w.error) throw new Error('CHAT_ACTION_CONTEXT_UNAVAILABLE');
  const scope = buildPrescriptionScope({ mode: p.data.modo_entrada, sources: t.data, profileDisciplines: resolveProfileDisciplines(p.data) });
  if (!scope.ok) throw new Error('CHAT_ACTION_SCOPE_UNRESOLVED');
  return { profile: p.data, scope: scope.scope, plans: w.data ? [w.data] : [],
    athlete: projectAthletePrescriptionProfile(p.data, date), facts: { restrictions } };
}

export type CoachReadStage = 'validation' | 'canonical_read' | 'planning_loader' | 'profile' | 'reported_events' | 'read_result';

export function coachFirstReads(db: any, user: string, today: string) {
  const cache = new Map<string, any>();
  return { invalidate: () => cache.clear(), async read(a: any, onStage?: (stage: CoachReadStage) => void) {
    onStage?.('validation');
    if (!a || Object.keys(a).some(k => !['resource','date','week','sessionId','limit'].includes(k))) throw new Error('READ_INVALID');
    const date = a.date ?? a.week ?? today, civil = resolveCompletionDate(date);
    if (!civil || civil.date !== date || Math.abs(Date.parse(date) - Date.parse(today)) > 366 * 86400000) throw new Error('READ_RANGE_INVALID');
    const limit = a.limit ?? 14;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 60) throw new Error('READ_LIMIT_INVALID');
    const key = JSON.stringify(a); if (cache.has(key)) return cache.get(key);
    let data: any;
    onStage?.('canonical_read');
    switch (a.resource) {
      case 'session': {
        const c = await loadCoachActionContext(db, user, date);
        const rows = c.plans.flatMap((p: any) => p.sessions.filter((s: any) => a.sessionId ? s.session_id === a.sessionId :
          calendarKey(s.dia) === calendarKey(civil.day))
          .map((s: any) => ({ ...projectChatPlanSession(s), sessionId: s.session_id, expectedRevision: p.revision })));
        data = { sessions: rows, scope: c.scope, restrictions: c.facts.restrictions,
          dose: buildSessionDoseContext(c.athlete, undefined, null, [], true, 'coach'), status: rows.length ? 'available' : 'unknown' }; break;
      }
      case 'week': {
        const r = await db.from('weekly_plan').select('week_start,revision,sessions,week_objective').eq('user_codigo', user).eq('week_start', civil.weekStart).maybeSingle();
        if (r.error) throw new Error('READ_UNAVAILABLE');
        data = r.data ? { ...r.data, sessions: r.data.sessions.map(projectChatPlanSession) } : { status: 'unknown' }; break;
      }
      case 'availability': data = await readAvailabilityConfirmation(db, user, civil.weekStart); break;
      case 'restrictions': data = await getCanonicalRestrictions(db, user); break;
      case 'reported_events': data = reportedEventProjection(await readCoachProfile(db, user)); break;
      case 'state': case 'goals': {
        const r = await db.from('usuarios').select('modo_entrada,especialidad,objetivo_principal,ciclo_actual,perfil').eq('codigo', user).single();
        if (r.error || !r.data) throw new Error('READ_UNAVAILABLE');
        data = a.resource === 'goals' ? { primaryGoal: r.data.objetivo_principal ?? null, reportedEvents: reportedEventProjection(r.data.perfil) }
          : { mode: r.data.modo_entrada, specialty: r.data.especialidad, cycle: r.data.ciclo_actual ?? null, restrictions: await getCanonicalRestrictions(db, user) }; break;
      }
      case 'history': {
        const r = await db.from('usuarios').select('workout_history').eq('codigo', user).single();
        if (r.error || !r.data) throw new Error('READ_UNAVAILABLE');
        const rows = Array.isArray(r.data.workout_history) ? r.data.workout_history : [];
        data = { records: rows.slice(-limit), truncated: rows.length > limit, semantics: 'LEGACY_RECORDED_NOT_VERIFIED' }; break;
      }
      case 'load': {
        const from = new Date(Date.parse(date) - (limit - 1) * 86400000).toISOString().slice(0, 10);
        data = await loadTrainingLoad(db, user, from, date); break;
      }
      case 'planning': {
        onStage?.('planning_loader');
        data = await loadCoachPlanningRead(db, user, date, civil.weekStart); break;
      }
      default: throw new Error('READ_RESOURCE_INVALID');
    }
    onStage?.('read_result');
    const result = { status: 'read', data, coverage: { date, week: civil.weekStart, limit } };
    if (JSON.stringify(result).length > 120000) throw new Error('READ_SIZE_LIMIT');
    if (a.resource === 'planning' && Buffer.byteLength(JSON.stringify(result), 'utf8') > COACH_PLANNING_READ_MAX_BYTES)
      throw new Error('READ_SIZE_LIMIT');
    cache.set(key, result); return result;
  } };
}
