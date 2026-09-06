import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeTrainingAvailability } from '../sports/trainingAvailability';
import { weeklyAvailabilityFailure } from './weeklyAvailabilityDiagnostics';
import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines } from '../sports/prescriptionScope';
import { aplicarTrainingFrequencySafetyNet, calcularFrecuenciaRealRelativa } from '../sports/trainingFrequencySafetyNet';
import { calendarKey, calendarState, validateWeeklyCalendar } from './weeklyCalendar';

function mac(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('CALENDAR_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', key).update('forge-week-calendar-v1:' + payload).digest('base64url');
}
export async function loadWeeklyCalendarContext(db: any, codigo: string) {
  const p = await db.from('usuarios').select('modo_entrada,perfil,workout_history,distribucion_semanal,especialidad,categoria').eq('codigo', codigo).single();
  const t = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
  if (p.error || !p.data || t.error || !Array.isArray(t.data)) throw new Error('CALENDAR_CONTEXT_READ_FAILED');
  const profile = p.data;
  const scope = buildPrescriptionScope({ mode: profile.modo_entrada, sources: t.data, profileDisciplines: resolveProfileDisciplines(profile) });
  if (!scope.ok || !scope.scope.prescriptionAllowed) throw new Error('CALENDAR_SCOPE_INVALID');
  let dist: Record<string, unknown>;
  try { dist = typeof profile.distribucion_semanal === 'string' ? JSON.parse(profile.distribucion_semanal) : profile.distribucion_semanal; }
  catch { throw new Error('CALENDAR_AVAILABILITY_INVALID'); }
  if (!dist || typeof dist !== 'object' || Array.isArray(dist)) throw new Error('CALENDAR_AVAILABILITY_REQUIRED');
  const allowed: Record<string, string[]> = {};
  for (const discipline of scope.scope.managedDisciplines) {
    const sources = t.data.filter((s: any) => s.owner === 'forge' && canonicalDiscipline(s.disciplina) === discipline && s.dias != null);
    const normalized = sources.length ? null : normalizeTrainingAvailability(dist, [discipline]);
    const value = sources.length ? sources.flatMap((s: any) => s.dias)
      : normalized?.ok ? normalized.availability[discipline] : null;
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw weeklyAvailabilityFailure(dist, discipline, scope.scope, sources, value);
    allowed[discipline] = value.map(calendarKey);
  }
  const frequency = calcularFrecuenciaRealRelativa(profile.workout_history || [], Number.parseInt(profile.perfil?.dias || '0'));
  return { profile, sources: t.data, scope: scope.scope, allowed, max: aplicarTrainingFrequencySafetyNet(7, frequency).diasEntrenoSugeridos };
}
export async function issueWeeklyCalendar(db: any, codigo: string, week: string, sessions: any[]) {
  const c = await loadWeeklyCalendarContext(db, codigo);
  const result = validateWeeklyCalendar(sessions, c.max, c.allowed);
  if (!result.ok) throw Object.assign(new Error(result.errors.join(',')), { availabilityViolations: result.availabilityViolations });
  const payload = Buffer.from(JSON.stringify({ codigo, week, slots: result.slots, expires: Date.now() + 30 * 60_000 })).toString('base64url');
  return payload + '.' + mac(payload);
}
export async function assertWeeklyCalendar(db: any, codigo: string, week: string, sessions: any[], receipt: unknown) {
  if (typeof receipt !== 'string' || receipt.length > 20000) throw new Error('CALENDAR_RECEIPT_REQUIRED');
  const [payload, signature, extra] = receipt.split('.');
  if (!payload || !signature || extra !== undefined) throw new Error('CALENDAR_RECEIPT_INVALID');
  const expected = Buffer.from(mac(payload)), actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('CALENDAR_RECEIPT_INVALID');
  const evidence = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (evidence.codigo !== codigo || evidence.week !== week || !Number.isFinite(evidence.expires) || Date.now() > evidence.expires) throw new Error('CALENDAR_RECEIPT_EXPIRED');
  const c = await loadWeeklyCalendarContext(db, codigo);
  const result = validateWeeklyCalendar(sessions, c.max, c.allowed, evidence.slots);
  if (!result.ok) throw new Error(result.errors.join(','));
}

/** Session edits cannot evade whole-week safety or erase an existing protected day. */
export async function assertCalendarMutation(db: any, codigo: string, before: readonly any[], after: readonly any[]) {
  const c = await loadWeeklyCalendarContext(db, codigo);
  const protectedSlots = before.map(s => ({ day: calendarKey(s.dia), state: calendarState(s), type: s.tipo }));
  const result = validateWeeklyCalendar(after, c.max, c.allowed, protectedSlots);
  if (!result.ok) throw new Error(result.errors.join(','));
}
