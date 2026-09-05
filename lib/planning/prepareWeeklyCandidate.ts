import { preparePrescriptionSessions } from './prescriptionIdentity';
import { samePlanData } from './planMutationValidators';
import type { ExistingPlanSnapshot, LegacyPlanCandidate, LegacyPlanSession, PlanCandidate } from './planMutationTypes';

const day = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export type WeeklyEntry = { kind: 'new'; session: LegacyPlanSession } | { kind: 'survivor'; snapshotIndex: number };
/** Calendar occupancy removes conflicting proposals; it NEVER grants an incoming object an ID.
 * Future survivors must be selected by SERVER code, not deserialized from the request.
 */
export function prepareWeeklyEntries(proposal: readonly LegacyPlanSession[], snapshot: ExistingPlanSnapshot | null,
  explicitSurvivors: readonly number[] = []): WeeklyEntry[] {
  const indices = new Set(explicitSurvivors);
  snapshot?.sessions.forEach((s, i) => { if (s.completada === true) indices.add(i); });
  const survivors = [...indices].map(i => {
    if (!snapshot || !Number.isSafeInteger(i) || !snapshot.sessions[i]) throw new Error('INVALID_SURVIVOR_REFERENCE');
    return { kind: 'survivor' as const, snapshotIndex: i };
  });
  const occupied = new Set(survivors.map(e => day(snapshot!.sessions[e.snapshotIndex].dia)));
  const entries: WeeklyEntry[] = proposal.filter(s => !occupied.has(day(s.dia))).map(session => ({ kind: 'new', session }));
  // Stable calendar ordering is layout only; survivor identity comes exclusively from its index.
  entries.push(...survivors);
  const order = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  return entries.sort((a, b) => order.indexOf(day(entrySession(a, snapshot).dia)) - order.indexOf(day(entrySession(b, snapshot).dia)));
}
export function entrySession(entry: WeeklyEntry, snapshot: ExistingPlanSnapshot | null): LegacyPlanSession {
  return entry.kind === 'new' ? entry.session : snapshot!.sessions[entry.snapshotIndex];
}
function comparableSession(session: LegacyPlanSession) {
  const { session_id, updated_at, modificado_at, ...content } = session as unknown as Record<string, unknown>;
  return content;
}
const comparableWeekSessions = (sessions: readonly LegacyPlanSession[]) => [...sessions]
  .sort((a, b) => day(a.dia).localeCompare(day(b.dia))).map(comparableSession);
const fields = ['week_number', 'total_weeks_block', 'block_name', 'week_objective', 'status', 'confidence'] as const;
/** Equality suppresses the whole mutation, never reuses identity by matching content. */
export function admitWeeklyCandidate(proposal: LegacyPlanCandidate, entries: readonly WeeklyEntry[], snapshot: ExistingPlanSnapshot | null) {
  const sessions = entries.map(e => entrySession(e, snapshot));
  if (snapshot && fields.every(k => samePlanData(proposal[k], snapshot[k]))
    && samePlanData(comparableWeekSessions(sessions), comparableWeekSessions(snapshot.sessions))) return { noOp: true as const };
  const prepared = preparePrescriptionSessions(entries, snapshot ?? undefined);
  const candidate: PlanCandidate = { ...(snapshot ?? {}), ...proposal, sessions: prepared.sessions,
    revision: snapshot?.revision ?? 1, updated_at: new Date().toISOString() };
  return { noOp: false as const, candidate, identityProof: prepared.identityProof };
}
