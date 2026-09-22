import { canonicalDigest } from '../execution/executionIntegrity';
import { samePlanData } from '../planning/planMutationValidators';
import { resolveCompletionDate } from '../planning/recordCompletion';

export async function readCoachProfile(db: any, user: string) {
  const r = await db.from('usuarios').select('perfil').eq('codigo', user).single();
  if (r.error || !r.data || r.data.perfil != null && (typeof r.data.perfil !== 'object' || Array.isArray(r.data.perfil)))
    throw new Error('COACH_FIRST_PROFILE_UNAVAILABLE');
  return r.data.perfil ?? null;
}

/** Internal CAS, not a tool/profile patch API. Callers only own their namespaced fields. */
async function saveProfile(db: any, user: string, before: any, next: any) {
  let q = db.from('usuarios').update({ perfil: next }).eq('codigo', user);
  q = before == null ? q.is('perfil', null) : q.eq('perfil', JSON.stringify(before));
  try {
    const r = await q.select('codigo');
    if (r.error) return { status: 'unknown' as const };
    if (!r.data?.length) return { status: 'conflict' as const };
    if (!samePlanData(await readCoachProfile(db, user), next)) return { status: 'unknown' as const };
    return { status: 'committed' as const };
  } catch { return { status: 'unknown' as const }; }
}

/** Durable claim precedes any provider/tool call. A claimed/uncertain turn is never replayed.
 * No eviction: reaching the cap fails closed instead of making old IDs reusable. */
export async function claimCoachTurn(db: any, user: string, messageId: string, input: unknown) {
  const before = await readCoachProfile(db, user), turns = before?.coach_first_turns ?? {};
  const digest = canonicalDigest(input), id = canonicalDigest([user, messageId]);
  if (turns[id]) return { status: turns[id].digest !== digest ? 'conflict' : 'already_claimed', id };
  if (Object.keys(turns).length >= 512) return { status: 'rejected', code: 'COACH_FIRST_JOURNAL_CAP', id };
  const saved = await saveProfile(db, user, before, { ...before,
    coach_first_turns: { ...turns, [id]: { digest, status: 'claimed', createdAt: new Date().toISOString() } } });
  return { ...saved, id };
}

export async function finishCoachTurn(db: any, user: string, id: string, status: string, receipts: unknown[] = []) {
  const before = await readCoachProfile(db, user), turns = before?.coach_first_turns;
  if (!turns?.[id]) return { status: 'unknown' as const };
  return saveProfile(db, user, before, { ...before, coach_first_turns: { ...turns,
    [id]: { ...turns[id], status, receipts, finishedAt: new Date().toISOString() } } });
}

/** Rollback must not silently lose new reports. Legacy planning has no event projection. */
export async function legacyPlanningCanReadReports(db: any, user: string, week?: string) {
  const projection = reportedEventProjection(await readCoachProfile(db, user));
  if (!projection.records.length) return true;
  const date = resolveCompletionDate(week)?.date;
  const end = date && new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10);
  return !!date && projection.records.every((e: any) => e.status === 'cancelled'
    || e.date && (e.endDate ?? e.date) < date || e.date && end && e.date > end);
}

export function reportedEventProjection(profile: any) {
  const records = profile?.reported_events ?? [];
  if (!Array.isArray(records) || records.length > 256) throw new Error('REPORTED_EVENTS_INVALID');
  return { records: structuredClone(records), digest: canonicalDigest(records), semantics: 'ATHLETE_REPORTED_NOT_VERIFIED' };
}

export async function recordReportedEvent(db: any, user: string, value: any,
  source: { messageId: string; message: string; operationId: string; timestamp: string }) {
  const allowed = ['kind', 'description', 'date', 'endDate', 'details', 'athleteIntent', 'status'];
  if (!value || Object.keys(value).some(k => !allowed.includes(k)) || value.kind !== 'reported_event'
    || typeof value.description !== 'string' || !value.description.trim() || value.description.length > 1600
    || !['reported', 'tentative', 'cancelled'].includes(value.status)) return { status: 'rejected', code: 'EVENT_INVALID' };
  for (const key of ['date', 'endDate']) if (value[key] !== undefined && resolveCompletionDate(value[key])?.date !== value[key])
    return { status: 'rejected', code: 'EVENT_DATE_INVALID' };
  if (value.endDate !== undefined && (value.date === undefined || value.endDate < value.date)) return { status: 'rejected', code: 'EVENT_INTERVAL_INVALID' };
  if (value.athleteIntent !== undefined && (typeof value.athleteIntent !== 'string' || value.athleteIntent.length > 600)) return { status: 'rejected', code: 'EVENT_INTENT_INVALID' };
  if (value.details !== undefined && (!value.details || typeof value.details !== 'object' || Array.isArray(value.details)
    || JSON.stringify(value.details).length > 3000)) return { status: 'rejected', code: 'EVENT_DETAILS_INVALID' };
  const before = await readCoachProfile(db, user), projection = reportedEventProjection(before);
  if (projection.records.length >= 256) return { status: 'rejected', code: 'EVENT_CAP' };
  const id = canonicalDigest([user, source.operationId]);
  if (projection.records.some((e: any) => e.id === id)) return { status: 'already_applied', id };
  const { kind, ...fields } = value;
  const event = { id, ...fields, revision: 1, provenance: { source: 'athlete_report', ...source } };
  const saved = await saveProfile(db, user, before, { ...before, reported_events: [...projection.records, event] });
  return { ...saved, id, ...(saved.status === 'committed' ? { event, digest: canonicalDigest([...projection.records, event]) } : {}) };
}
