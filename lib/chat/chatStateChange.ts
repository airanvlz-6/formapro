import { createHash } from 'node:crypto';
import { parseTemporaryAvailability } from '../sports/temporaryTrainingAccess';
import { calendarDays, calendarKey, calendarState } from '../planning/weeklyCalendar';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { chatDiagnostic } from './groundedCoach';

/** The model cannot supply fields/SQL: only the authenticated human declaration reaches this authority. */
export async function applyChatStateChange(db: any, user: string, message: string, today: string) {
  const candidate = parseTemporaryAvailability(message, today);
  if (!candidate) return { status: 'no_supported_mutation' as const, dates: [] as string[] };
  if (candidate.dates.some(date => date < today)) return { status: 'rejected' as const, code: 'CHAT_PAST_CHANGE_FORBIDDEN', dates: [] as string[] };
  const read = await db.from('usuarios').select('perfil').eq('codigo', user).single();
  if (read.error || !read.data) throw new Error('CHAT_STATE_READ_FAILED');
  const before = read.data.perfil, profile = before || {}, access = structuredClone(profile.prescription_access || {});
  const id = createHash('sha256').update(JSON.stringify({ user, candidate })).digest('hex');
  const changed = candidate.dates.some(date => access[date]?.availability !== 'unavailable');
  if (changed) {
    for (const date of candidate.dates) access[date] = { ...(access[date] || {}), availability: 'unavailable',
      availabilityProvenance: { source: candidate.source, declarationId: id, effectiveDate: date } };
    let write = db.from('usuarios').update({ perfil: { ...profile, prescription_access: access } }).eq('codigo', user);
    write = before == null ? write.is('perfil', null) : write.eq('perfil', JSON.stringify(before));
    const result = await write.select('codigo');
    if (result.error || !result.data?.length) throw new Error('CHAT_STATE_CHANGED_RETRY');
  }
  const verify = await db.from('usuarios').select('perfil').eq('codigo', user).single();
  if (verify.error || candidate.dates.some(date => verify.data?.perfil?.prescription_access?.[date]?.availability !== 'unavailable')) throw new Error('CHAT_STATE_READBACK_FAILED');
  chatDiagnostic('CHAT_STATE_MUTATION', { kind: candidate.kind, status: changed ? 'committed' : 'already_applied', dates: candidate.dates });
  return { status: changed ? 'committed' as const : 'already_applied' as const, kind: candidate.kind, dates: candidate.dates };
}
export function affectedFuturePlans(plans: readonly any[], dates: readonly string[], today: string, managed: readonly string[]) {
  return plans.flatMap(plan => (plan.sessions || []).flatMap((session: any) => {
    const index = calendarDays.indexOf(calendarKey(session.dia || ''));
    const week = resolveCompletionDate(plan.week_start);
    if (!week || index < 0) return [];
    const date = new Date(Date.parse(week.weekStart) + index * 86400000).toISOString().slice(0, 10);
    if (!dates.includes(date) || date < today || session.completada === true || !managed.includes(session.tipo)
      || !['TRAIN', 'RECOVERY'].includes(calendarState(session))) return [];
    return [{ weekStart: plan.week_start, day: calendarDays[index], date, revision: plan.revision }];
  }));
}
