import { readCurrentExecutionRows } from '../execution/workoutReads';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDigest } from '../execution/executionIntegrity';
import { currentWorkouts } from '../execution/workoutIntegrity';
import { projectWorkoutPlans, managedPrescriptionKeys } from '../execution/workoutProjections';

type Row = Record<string, unknown>;
type Quantity = { value: number; unit: string; source: string };
export type RecentTrainingItem = {
  id: string; date: string; source: string; sourceIdentity: string | null;
  association: 'FORGE_PLAN' | 'REPORTED_PLAN_ASSOCIATION' | 'EXTERNAL' | 'UNKNOWN';
  prescriptionReference: string | null; discipline: string | null;
  confidence: 'COMPLETION_FLAG' | 'ATHLETE_REPORT' | 'SERVER_VALIDATED_SELF_REPORT' | 'LEGACY_UNVERIFIED' | 'STORED_PRESCRIPTION' | 'STORED_MODIFICATION';
  state: 'REPORTED_EXECUTED' | 'PLANNED_ONLY' | 'NO_EXECUTION_RECORDED' | 'UNKNOWN';
  completeness: 'FULL' | 'PARTIAL' | 'MODIFIED' | 'ABANDONED' | 'UNKNOWN';
  prescribed: { state: 'PRESCRIBED'; discipline: string | null; title: string | null; stimulus: string | null } | null;
  description: string | null;
  quantities: { duration?: Quantity; distance?: Quantity; rpe?: Quantity };
  responses: string[]; modification: { reason: string | null; type: string | null } | null;
  uncertainty: string[];
};
type SourceRead = { source: string; status: 'read' | 'failed'; recordsFound: number | null; excludedDates: number };
export type RecentTrainingEvidence = {
  version: 1;
  coverage: { windowStart: string; windowEnd: string; sourcesRead: SourceRead[];
    sourceFailures: { source: string; reason: string }[]; weeksFound: string[];
    limitations: string[]; omittedItems: number };
  items: RecentTrainingItem[];
  overlaps: { itemIds: string[]; reason: 'SHARED_REFERENCE' | 'POSSIBLE_SAME_DAY' }[];
};
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const normalized = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function civil(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}
// Existing completion semantics: date-only is Canary civil; timestamps require an offset.
function reportDate(value: unknown): string | null {
  if (civil(value)) return value as string;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !civil(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function slotDate(week: unknown, day: unknown): string | null {
  const start = civil(week), index = days.indexOf(normalized(day));
  return start && new Date(start + 'T00:00:00Z').getUTCDay() === 1 && index >= 0 ? addDays(start, index) : null;
}
function clip(value: unknown, item: RecentTrainingItem): string | null {
  const s = text(value);
  if (s && s.length > 800 && !item.uncertainty.includes('TEXT_TRUNCATED')) item.uncertainty.push('TEXT_TRUNCATED');
  return s?.slice(0, 800) ?? null;
}
function quantity(item: RecentTrainingItem, key: keyof RecentTrainingItem['quantities'], value: unknown, unit: string, source: string) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || key === 'rpe' && value > 10) {
    item.uncertainty.push(`INVALID_${key.toUpperCase()}`); return;
  }
  item.quantities[key] = { value, unit, source };
}
function item(source: string, index: string, date: string): RecentTrainingItem {
  return { id: `${source}:${index}`, date, source, sourceIdentity: null, association: 'UNKNOWN', prescriptionReference: null,
    discipline: null, confidence: 'LEGACY_UNVERIFIED', state: 'UNKNOWN', completeness: 'UNKNOWN', prescribed: null,
    description: null, quantities: {}, responses: [], modification: null, uncertainty: [] };
}

/** Independent read-only Core boundary. All queries are athlete-scoped. 28 days is a
 * coverage choice, never a training rule. No totals, exposure classification or inference
 * from prescription quantities. Evidence items are NOT a deduplicated session count.
 */
export async function loadRecentTrainingEvidence(db: Pick<SupabaseClient, 'from'>, athlete: string, referenceDate: string): Promise<RecentTrainingEvidence> {
  if (typeof athlete !== 'string' || !athlete.trim() || !civil(referenceDate)) throw new Error('RECENT_EVIDENCE_INVALID_INPUT');
  const start = addDays(referenceDate, -27);
  const monday = addDays(start, -((new Date(start + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const result: RecentTrainingEvidence = { version: 1, coverage: { windowStart: start, windowEnd: referenceDate,
    sourcesRead: [], sourceFailures: [], weeksFound: [], omittedItems: 0,
    limitations: ['MISSING_RECORD_IS_NOT_NO_TRAINING', 'CAPTURE_COMPLETENESS_UNKNOWN', 'EVIDENCE_ITEMS_NOT_SESSION_COUNTS',
      'LEGACY_WRITERS_HETEROGENEOUS', 'MODIFICATION_CAPTURE_PARTIAL', 'CURRENT_READ_NOT_HISTORICAL_SNAPSHOT',
      'PLAN_REPORTS_LIMITED_TO_INTERSECTING_WEEK_ROWS', 'SOURCE_RECORD_COUNTS_ARE_NOT_EXECUTION_COUNTS'] }, items: [], overlaps: [] };
  async function read(source: string, query: () => PromiseLike<{ data: unknown; error: unknown }>, single = false): Promise<Row[]> {
    const status: SourceRead = { source, status: 'read', recordsFound: null, excludedDates: 0 };
    result.coverage.sourcesRead.push(status);
    try {
      const r = await query();
      if (r.error) throw new Error('READ_FAILED');
      const data = single ? row(r.data).workout_history : r.data;
      if (single && !r.data) throw new Error('PROFILE_NOT_FOUND');
      if (single && data == null) { result.coverage.limitations.push('WORKOUT_HISTORY_NOT_RECORDED'); status.recordsFound = 0; return []; }
      if (!Array.isArray(data) || data.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw new Error('INVALID_STORED_DATA');
      status.recordsFound = data.length;
      // JSON profile arrays are one row, not a PostgREST row-limited result.
      if (!single && source !== 'running_execution_records' && data.length >= 1000) throw new Error('SOURCE_READ_CAP_EXCEEDED');
      return data as Row[];
    } catch (e) {
      status.status = 'failed';
      result.coverage.sourceFailures.push({ source, reason: e instanceof Error && ['READ_FAILED', 'PROFILE_NOT_FOUND', 'INVALID_STORED_DATA', 'SOURCE_READ_CAP_EXCEEDED'].includes(e.message) ? e.message : 'READ_FAILED' });
      return [];
    }
  }
  const [plans, legacy, modern, modifications] = await Promise.all([
    read('weekly_plan', () => db.from('weekly_plan').select('id,week_start,sessions').eq('user_codigo', athlete)
      .gte('week_start', monday).lte('week_start', referenceDate).order('week_start', { ascending: false }).limit(1001)),
    read('usuarios.workout_history', () => db.from('usuarios').select('workout_history').eq('codigo', athlete).maybeSingle(), true),
    // Current revisions, keyset-paged; retain v1 conflict evidence before windowing.
    read('running_execution_records', async () => ({data:await readCurrentExecutionRows(db,athlete),error:null})),
    read('session_modification_events', () => db.from('session_modification_events')
      .select('id,week_start,dia,trigger_type,reason_code,created_at').eq('user_codigo', athlete)
      .gte('week_start', monday).lte('week_start', referenceDate).order('created_at', { ascending: false }).limit(1001)),
  ]);
  function inWindow(date: string | null, source: string): date is string {
    if (date && date >= start && date <= referenceDate) return true;
    const status = result.coverage.sourcesRead.find(s => s.source === source)!;
    status.excludedDates++;
    if (!date && !result.coverage.limitations.includes(`INVALID_DATE:${source}`)) result.coverage.limitations.push(`INVALID_DATE:${source}`);
    return false;
  }
  function add(i: RecentTrainingItem) { result.items.push(i); }
  let workouts: ReturnType<typeof currentWorkouts> = [];
  try { workouts = currentWorkouts(athlete, modern); }
  catch { result.coverage.sourceFailures.push({source:'running_execution_records',reason:'INTEGRITY_INVALID'}); }
  const managed = managedPrescriptionKeys(workouts);
  projectWorkoutPlans(plans, workouts).forEach((p, pi) => {
    if (civil(p.week_start)) result.coverage.weeksFound.push(p.week_start as string);
    if (!Array.isArray(p.sessions)) { result.coverage.limitations.push('INVALID_PLAN_SESSIONS'); return; }
    p.sessions.forEach((raw: unknown, si: number) => {
      const s = row(raw), date = slotDate(p.week_start, s.dia);
      const includeSlot = inWindow(date, 'weekly_plan');
      const i = item('weekly_plan', `${pi}.${si}`, date ?? '');
      i.sourceIdentity = text(s.session_id); i.prescriptionReference = i.sourceIdentity;
      i.association = s.owner === 'external' || s.tipo === 'external_blocked' ? 'EXTERNAL' : 'FORGE_PLAN';
      const proposal = row(row(s.structuredPrescription).proposal);
      const prescribed = !['descanso', 'external_blocked', 'sin_registrar', 'unavailable'].includes(String(s.tipo)) && !!(text(s.titulo) || text(s.descripcion) || Object.keys(proposal).length);
      if (prescribed) i.prescribed = { state: 'PRESCRIBED', discipline: text(s.tipo), title: clip(s.titulo, i), stimulus: text(proposal.stimulusId ?? s.stimulusId) };
      const completed = s.completada === true && !managed.has(`${p.id}:${s.session_id}`);
      i.state = completed ? 'REPORTED_EXECUTED' : prescribed ? 'PLANNED_ONLY' : 'NO_EXECUTION_RECORDED';
      i.confidence = completed ? 'COMPLETION_FLAG' : 'STORED_PRESCRIPTION';
      if (s.completada === true) {
        i.description = clip(s.descripcion_real ?? s.titulo_real, i);
        i.uncertainty.push('COMPLETION_DOES_NOT_ATTEST_QUANTITY_OR_DISCIPLINE');
      }
      if (s.modificado === true) i.modification = { reason: clip(s.motivo_modificacion, i), type: 'PRESCRIPTION_MODIFIED' };
      if (!i.sourceIdentity) i.uncertainty.push('PLAN_SLOT_IDENTITY_ONLY');
      if (includeSlot) add(i);
      if (!Array.isArray(s.chatExecutionEvidence)) return;
      s.chatExecutionEvidence.forEach((rawReport, ri) => {
        const r = row(rawReport);
        if (r.source !== 'athlete_report' || !['PERFORMED', 'RESPONSE'].includes(String(r.kind))) return;
        const executed = reportDate(r.executionDate);
        if (!inWindow(executed, 'weekly_plan')) return;
        const e = item('weekly_plan.chatExecutionEvidence', `${pi}.${si}.${ri}`, executed);
        e.sourceIdentity = text(r.id); e.prescriptionReference = text(s.session_id);
        e.association = i.association; e.confidence = 'ATHLETE_REPORT';
        e.discipline = text(r.discipline);
        if (executed !== date) e.uncertainty.push('PLAN_DATE_MISMATCH');
        const detail = row(r.reportedExecution);
        if (r.kind === 'PERFORMED') {
          e.state = 'REPORTED_EXECUTED'; e.description = clip(detail.description ?? r.quote, e);
          quantity(e, 'duration', detail.durationMinutes, 'minutes', e.source + '.reportedExecution.durationMinutes');
          quantity(e, 'rpe', detail.rpe, 'rpe_0_10', e.source + '.reportedExecution.rpe');
          if (Array.isArray(r.responseQuotes)) e.responses = r.responseQuotes.slice(0, 8).flatMap(v => { const t = clip(v, e); return t ? [t] : []; });
          if (Array.isArray(r.responseQuotes) && r.responseQuotes.length > 8) e.uncertainty.push('RESPONSES_TRUNCATED');
        } else { const t = clip(r.quote, e); if (t) e.responses = [t]; e.uncertainty.push('RESPONSE_NOT_NEW_EXECUTION'); }
        if (!e.prescriptionReference) e.uncertainty.push('PLAN_SLOT_IDENTITY_ONLY');
        add(e);
      });
    });
  });
  // Narrow copy of runningExecutionStore's factual envelope verification. Importing its
  // reader would also import running validators, method catalogs and plan mutation authority.
  // Never apply those admission rules, infer a method, or classify unknown running as easy.
  const verified: Row[] = [];
  try {
    for (const envelope of modern) {
      if (row(envelope.record).version === 2) continue;
      const r = row(envelope.record), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new Error('VERIFICATION_UNAVAILABLE');
      const expected = Buffer.from(createHmac('sha256', key).update('forge-execution-v1:' + canonicalDigest([athlete, r])).digest('hex'));
      const actual = Buffer.from(typeof envelope.signature === 'string' ? envelope.signature : '');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || r.version !== 1
        || r.athleteScope !== canonicalDigest(athlete) || envelope.content_digest !== canonicalDigest(r)) throw new Error('INTEGRITY_INVALID');
      verified.push(r);
    }
  } catch (error) {
    verified.length = 0;
    result.coverage.sourcesRead.find(s => s.source === 'running_execution_records')!.status = 'failed';
    result.coverage.sourceFailures.push({ source: 'running_execution_records', reason: error instanceof Error ? error.message : 'INTEGRITY_INVALID' });
  }
  legacy.forEach((r, index) => {
    if (workouts.some(w => w.executionId === r.executionId || w.executionId === r.workout_id)
      || verified.some(w => w.executionId === r.executionId || w.executionId === r.workout_id)) return;
    const date = reportDate(r.fecha);
    if (!inWindow(date, 'usuarios.workout_history')) return;
    const i = item('usuarios.workout_history', String(index), date);
    i.sourceIdentity = text(r.operationId ?? r.workout_id ?? r.session_id);
    i.discipline = text(r.tipo); i.description = clip(r.descripcion ?? r.notas, i);
    const external = r.source === 'coach_first_external_report' && r.external === true && text(r.operationId);
    if (external) {
      i.association = 'EXTERNAL'; i.confidence = 'ATHLETE_REPORT'; i.state = 'REPORTED_EXECUTED';
      quantity(i, 'duration', r.duracion, 'minutes', i.source + '.duracion');
      quantity(i, 'rpe', r.intensidad_percibida, 'rpe_0_10', i.source + '.intensidad_percibida');
    } else {
      i.uncertainty.push('LEGACY_WRITER_UNVERIFIED', 'LEGACY_TYPE_NOT_CANONICAL_DISCIPLINE', 'POSSIBLE_OVERLAP_WITH_PLAN');
      if (r.external === true) i.association = 'EXTERNAL';
      // Unit-bearing legacy numbers remain unverified observations, never completion proof.
      for (const [key, field, units] of [['duration', 'duracion', ['seconds', 'minutes']], ['distance', 'distancia', ['meters', 'kilometers']]] as const) {
        const q = row(r[field]);
        if ((units as readonly unknown[]).includes(q.unit)) quantity(i, key, q.value, q.unit as string, i.source + '.' + field);
        else if (r[field] != null) i.uncertainty.push(`LEGACY_${key.toUpperCase()}_UNIT_UNVERIFIED`);
      }
    }
    if (text(r.source)) i.uncertainty.push(`STORED_SOURCE:${text(r.source)!.slice(0, 80)}`);
    add(i);
  });
  const versions = new Map<string, Set<string>>();
  for (const r of verified) if (text(r.executionId)) {
    const id = r.executionId as string, group = versions.get(id) ?? new Set<string>();
    group.add(canonicalDigest(r)); versions.set(id, group);
  }
  const seen = new Set<string>();
  verified.forEach((r, index) => {
    const digest = canonicalDigest(r);
    if (seen.has(digest)) { result.coverage.limitations.push('IDENTICAL_RUNNING_RECORD_COLLAPSED'); return; }
    seen.add(digest);
    const date = civil(r.occurredAt);
    if (!inWindow(date, 'running_execution_records')) return;
    const i = item('running_execution_records', String(index), date);
    i.sourceIdentity = text(r.executionId); i.prescriptionReference = text(row(r.planAssociation).sessionId);
    i.association = i.prescriptionReference ? 'REPORTED_PLAN_ASSOCIATION' : 'UNKNOWN';
    i.discipline = text(row(r.executionIdentity).discipline); i.confidence = 'SERVER_VALIDATED_SELF_REPORT';
    i.state = 'REPORTED_EXECUTED';
    if (['FULL', 'PARTIAL', 'MODIFIED', 'ABANDONED'].includes(String(r.completeness))) i.completeness = r.completeness as RecentTrainingItem['completeness'];
    const q = row(r.quantities);
    quantity(i, 'duration', q.totalDurationSeconds, 'seconds', i.source + '.quantities.totalDurationSeconds');
    quantity(i, 'distance', q.totalDistanceMeters, 'meters', i.source + '.quantities.totalDistanceMeters');
    const intensity = row(r.intensityObservation);
    if (intensity.metric === 'rpe') quantity(i, 'rpe', intensity.value, 'rpe_0_10', i.source + '.intensityObservation');
    if (!i.sourceIdentity || versions.get(i.sourceIdentity)!.size > 1) {
      i.state = 'UNKNOWN'; i.completeness = 'UNKNOWN'; i.quantities = {};
      i.uncertainty.push(i.sourceIdentity ? 'CONFLICTING_EXECUTION_VERSIONS' : 'EXECUTION_IDENTITY_MISSING');
    }
    add(i);
  });
  for (const r of workouts.filter(w => !w.deletedAt)) {
    if (!inWindow(r.data.executedOn, 'running_execution_records')) continue;
    const i = item('running_execution_records', r.executionId, r.data.executedOn);
    i.sourceIdentity = r.executionId; i.discipline = r.data.discipline; i.confidence = r.verification; i.state = 'REPORTED_EXECUTED';
    i.prescriptionReference = r.data.prescription?.sessionId ?? null; i.association = i.prescriptionReference ? 'FORGE_PLAN' : 'UNKNOWN';
    i.description = clip([r.data.title,r.data.description,r.data.result].join('\n'), i);
    i.responses = [r.data.observations,r.data.sensations,r.data.discomfort].flatMap(v => {const t = clip(v,i);return t ? [t] : [];});
    quantity(i,'duration',r.data.durationSeconds ?? r.structuredRunning?.quantities.totalDurationSeconds,'seconds',i.source);
    quantity(i,'distance',r.data.distanceMeters ?? r.structuredRunning?.quantities.totalDistanceMeters,'meters',i.source);
    quantity(i,'rpe',r.data.rpe ?? r.structuredRunning?.intensityObservation?.value,'rpe_0_10',i.source);
    i.completeness = r.structuredRunning?.completeness ?? 'UNKNOWN'; add(i);
  }
  modifications.forEach((r, index) => {
    const date = slotDate(r.week_start, r.dia);
    if (!inWindow(date, 'session_modification_events')) return;
    const i = item('session_modification_events', String(index), date);
    i.sourceIdentity = text(r.id); i.association = 'FORGE_PLAN'; i.confidence = 'STORED_MODIFICATION';
    i.modification = { reason: clip(r.reason_code, i), type: clip(r.trigger_type, i) };
    i.uncertainty.push('MODIFICATION_NOT_EXECUTION', 'PLAN_SLOT_ASSOCIATION_ONLY'); add(i);
  });
  result.items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  result.coverage.omittedItems = Math.max(0, result.items.length - 200);
  if (result.coverage.omittedItems) result.coverage.limitations.push('DETAIL_LIMIT_200_ITEMS');
  result.items = result.items.slice(0, 200);
  const groups = new Map<string, Set<string>>();
  for (const i of result.items) {
    for (const key of [`day:${i.date}`, ...(i.prescriptionReference ? [`ref:${i.prescriptionReference}`] : []),
      ...(i.sourceIdentity ? [`ref:${i.sourceIdentity}`] : [])]) {
      const group = groups.get(key) ?? new Set<string>(); group.add(i.id); groups.set(key, group);
    }
  }
  for (const [key, group] of groups) if (group.size > 1) result.overlaps.push({ itemIds: [...group], reason: key.startsWith('day:') ? 'POSSIBLE_SAME_DAY' : 'SHARED_REFERENCE' });
  result.coverage.weeksFound = [...new Set(result.coverage.weeksFound)].sort();
  result.coverage.limitations = [...new Set(result.coverage.limitations)];
  return result;
}
