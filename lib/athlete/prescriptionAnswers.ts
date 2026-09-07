import { createHmac, timingSafeEqual } from 'node:crypto';
import { signalIds, type SignalState } from './prescriptionSignals';
import { prescriptionQuestion, referenceQuestionFields, type PrescriptionQuestion } from '../sports/prescriptionDataSufficiency';
import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { assertCurrentPrescriptionScope } from '../sports/sessionAuthority';

function mac(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('PRESCRIPTION_QUESTION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update('forge-prescription-question-v1:' + payload).digest('base64url');
}
export function issuePrescriptionQuestion(user: string, discipline: string, question: PrescriptionQuestion) {
  const payload = Buffer.from(JSON.stringify({ user, discipline, signals: question.signalIds, expires: Date.now() + 30 * 60_000 })).toString('base64url');
  return `${payload}.${mac(payload)}`;
}
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!]$/g, '');
/** Bounded replies to an identified question, never extraction from arbitrary chat. */
export function parsePrescriptionAnswer(ids: string[], raw: unknown): Record<string, SignalState> {
  if (!ids.length || ids.some(id => !signalIds.includes(id))) throw new Error('PRESCRIPTION_QUESTION_INVALID');
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw);
    if (!entries.length || entries.some(([id, v]) => !ids.includes(id) || !['available', 'unavailable', 'unknown', 'ambiguous'].includes(String(v)))) throw new Error('PRESCRIPTION_ANSWER_INVALID');
    return Object.fromEntries(entries) as Record<string, SignalState>;
  }
  if (typeof raw !== 'string' || raw.length > 250) throw new Error('PRESCRIPTION_ANSWER_INVALID');
  const s = normalize(raw);
  if (['si', 'si, tengo todo', 'si, dispongo de ello'].includes(s) || ids.length === 2 && ['si, tengo ambos', 'si tengo ambos'].includes(s))
    return Object.fromEntries(ids.map(id => [id, 'available']));
  if (['no', 'no tengo ninguno'].includes(s)) return Object.fromEntries(ids.map(id => [id, 'unavailable']));
  if (['si, tengo barra, discos y rack', 'tengo barra, discos y rack'].includes(s))
    return Object.fromEntries(ids.filter(id => ['equipment.barra', 'equipment.rack'].includes(id)).map(id => [id, 'available']));
  const result: Record<string, SignalState> = {};
  for (const part of s.split(/[,;]/)) {
    const match = part.trim().match(/^(barra|rack|mancuernas|banco)\s+(si|no)$/);
    if (!match) continue;
    const id = `equipment.${match[1] === 'mancuernas' ? 'mancuerna' : match[1]}`;
    if (ids.includes(id)) {
      const state = match[2] === 'si' ? 'available' : 'unavailable';
      result[id] = result[id] && result[id] !== state ? 'ambiguous' : state;
    }
  }
  return Object.keys(result).length ? result : Object.fromEntries(ids.map(id => [id, 'ambiguous']));
}
export async function savePrescriptionAnswer(db: any, user: string, token: unknown, answer: unknown) {
  if (typeof token !== 'string' || token.length > 8000) throw new Error('PRESCRIPTION_QUESTION_INVALID');
  const [payload, signature, extra] = token.split('.');
  const expected = Buffer.from(mac(payload || '')), actual = Buffer.from(signature || '');
  if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('PRESCRIPTION_QUESTION_INVALID');
  const q = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (q.user !== user || !Number.isFinite(q.expires) || q.expires < Date.now()) throw new Error('PRESCRIPTION_QUESTION_EXPIRED');
  await assertCurrentPrescriptionScope(db, user, q.discipline);
  if (q.signals?.length === 1 && referenceQuestionFields[q.signals[0]]) {
    const id = q.signals[0], field = referenceQuestionFields[id];
    if (typeof answer === 'string' && ['no', 'no lo se', 'no conozco ese dato'].includes(normalize(answer)))
      return { ok: false, code: 'PRESCRIPTION_REFERENCE_UNKNOWN_REQUEST_ALTERNATIVE', resolved: false, question: null, questionToken: null };
    const projected = projectAthletePrescriptionProfile({ datos_entrenamiento: { [field]: answer } });
    const valid = id.startsWith('reference.1rm:') ? projected.strength.byMovement[id.slice('reference.1rm:'.length)]?.resolved?.value.referenceType === '1rm'
      : projected.running.byMetric[id.slice('reference.running:'.length)]?.reason === 'resolved';
    if (!valid) return { ok: true, resolved: false, question: prescriptionQuestion([id]), questionToken: token };
    const read = await db.from('usuarios').select('datos_entrenamiento').eq('codigo', user).single();
    if (read.error || !read.data) throw new Error('PRESCRIPTION_PROFILE_READ_FAILED');
    const previous = read.data.datos_entrenamiento;
    let query = db.from('usuarios').update({ datos_entrenamiento: { ...(previous || {}), [field]: answer } }).eq('codigo', user);
    query = previous == null ? query.is('datos_entrenamiento', null) : query.eq('datos_entrenamiento', JSON.stringify(previous));
    const write = await query.select('codigo');
    if (write.error || !write.data?.length) throw new Error('PRESCRIPTION_PROFILE_CHANGED_RETRY');
    return { ok: true, resolved: true, question: null, questionToken: null };
  }
  const values = parsePrescriptionAnswer(q.signals, answer);
  const { data, error } = await db.from('usuarios').select('perfil').eq('codigo', user).single();
  if (error || !data) throw new Error('PRESCRIPTION_PROFILE_READ_FAILED');
  const profile = data.perfil || {}, updatedAt = new Date().toISOString();
  const entries = { ...(profile.prescription_signals || {}), ...Object.fromEntries(Object.entries(values).map(([id, state]) => [id, { state, updatedAt }])) };
  let query = db.from('usuarios').update({ perfil: { ...profile, prescription_signals: entries } }).eq('codigo', user);
  query = data.perfil == null ? query.is('perfil', null) : query.eq('perfil', JSON.stringify(profile));
  const write = await query.select('codigo');
  if (write.error || !write.data?.length) throw new Error('PRESCRIPTION_PROFILE_CHANGED_RETRY');
  const reread = projectAthletePrescriptionProfile({ perfil: { ...profile, prescription_signals: entries } });
  const missing = q.signals.filter((id: string) => !['available', 'unavailable'].includes(reread.prescriptionSignals.signals[id]?.state));
  const question = missing.length ? prescriptionQuestion(missing) : null;
  return { ok: true, resolved: !missing.length, question,
    questionToken: question ? issuePrescriptionQuestion(user, q.discipline, question) : null };
}
