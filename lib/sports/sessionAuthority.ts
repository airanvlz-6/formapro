import { calendarState } from '../planning/weeklyCalendar';
import type { PrescriptionIntent } from './prescriptionIntent';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { prepareSessionTrainingContract } from './prepareSessionTrainingContract';
import { generateContractSession } from './sessionGeneration';
import { renderContractSession } from './structuredSession';
import { canonicalDiscipline, normalizeTrainingKey, buildPrescriptionScope, resolveProfileDisciplines } from './prescriptionScope';

const PROFILE = 'modo_entrada,distribucion_semanal,especialidad,categoria';
const domain = 'forge-session-contract-v1:';
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SESSION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update(domain + payload).digest('base64url');
}
type Request = { targetWeekStart: string; day: string; discipline: string; stimulus: unknown; intent?: PrescriptionIntent; state?: 'TRAIN' | 'RECOVERY' };
/** Only this server adapter issues receipts, after both sports and duplication checks. */
export async function generateTrainingSession(db: any, userCodigo: string, request: Request,
  complete: (prompt: string) => Promise<string>, context = '') {
  try {
    if (Object.hasOwn(request, 'state') && (!['TRAIN', 'RECOVERY'].includes(request.state!)
      || request.state !== calendarState({ tipo: canonicalDiscipline(request.discipline), stimulusId: request.stimulus })))
      return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: ['SESSION_STATE_MISMATCH'] };
    const { data: profile, error } = await db.from('usuarios')
      .select(`${PROFILE},perfil,marcas_especificas,ciclo_actual,athlete_development,datos_entrenamiento`).eq('codigo', userCodigo).single();
    if (error || !profile) return { ok: false as const, code: 'CONTRACT_PROFILE_READ_FAILED' };
    const restrictions = await getCanonicalRestrictions(db, userCodigo);
    const prepared = await prepareSessionTrainingContract(db, userCodigo, profile, request, restrictions);
    if (!prepared.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: prepared.errors };
    const history = await db.from('weekly_plan').select('sessions').eq('user_codigo', userCodigo).order('week_start', { ascending: false }).limit(2);
    if (history.error || !Array.isArray(history.data)) return { ok: false as const, code: 'SESSION_HISTORY_READ_FAILED' };
    const recent = history.data.flatMap((p: any) => Array.isArray(p.sessions) ? p.sessions.filter((s: any) => s.completada && s.descripcion_real)
      .map((s: any) => ({ titulo: s.titulo, descripcion_real: s.descripcion_real })) : []).slice(0, 5);
    const result = await generateContractSession(prepared.contract, recent, complete,
      JSON.stringify({ serverProfile: profile, requestContext: context }));
    if (!result.ok) return result;
    const payload = Buffer.from(JSON.stringify({ userCodigo, expiresAt: Date.now() + 30 * 60_000,
      contract: result.contract, proposal: result.proposal })).toString('base64url');
    const sessionReceipt = `${payload}.${signature(payload)}`;
    return { ok: true as const, trainingContract: result.contract, sesion: { ...result.session, sessionReceipt }, attempts: result.attempts };
  } catch (error: any) { return { ok: false as const, code: 'SESSION_AUTHORITY_FAILED', errors: [error.message] }; }
}

const fields = ['dia', 'tipo', 'titulo', 'por_que', 'descripcion', 'debilidad_relacionada'] as const;
/** Returned pools are never authoritative. Authenticate original A, then revalidate and rerender A. */
export function verifySessionReceipt(receipt: unknown, session: Record<string, any>, userCodigo: string, weekStart: string) {
  if (typeof receipt !== 'string' || receipt.length > 200_000) throw new Error('SESSION_RECEIPT_REQUIRED');
  const [payload, mac, extra] = receipt.split('.');
  if (!payload || !mac || extra !== undefined) throw new Error('SESSION_RECEIPT_INVALID');
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(mac);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('SESSION_RECEIPT_INVALID');
  const evidence = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (evidence.userCodigo !== userCodigo || !Number.isFinite(evidence.expiresAt) || Date.now() > evidence.expiresAt
    || evidence.contract?.targetWeekStart !== weekStart) throw new Error('SESSION_RECEIPT_CONTEXT_MISMATCH');
  const rendered = renderContractSession(evidence.contract, evidence.proposal);
  if (fields.some(k => !Object.is(session[k] ?? (k === 'debilidad_relacionada' ? null : undefined), rendered[k]))) throw new Error('SESSION_CONTENT_MISMATCH');
  return rendered;
}

/** A changed authority requires regeneration, never an LLM classifier or silent pool repair.
 * Read immediately before the write. Cross-table atomic restriction revisioning remains separate work. */
export async function assertFreshSessionRestrictions(db: any, userCodigo: string, weekStart: string, session: Record<string, any>) {
  verifySessionReceipt(session.sessionReceipt, session, userCodigo, weekStart);
  const original = JSON.parse(Buffer.from(session.sessionReceipt.split('.')[0], 'base64url').toString()).contract.restrictionsSnapshot;
  const current = await getCanonicalRestrictions(db, userCodigo);
  const material = (r: any) => JSON.stringify({ state: r.state, areas: r.areas, restrictions: r.restrictions, reassessments: r.reassessments, active: r.active });
  if (material(original) !== material(current)) throw new Error('SESSION_RESTRICTIONS_CHANGED_REGENERATE');
}

/** Current ownership may revoke an old receipt; this does not recalculate contract A. */
export async function assertCurrentPrescriptionScope(db: any, userCodigo: string, discipline: string) {
  const { data: profile, error } = await db.from('usuarios').select(PROFILE).eq('codigo', userCodigo).single();
  const sources = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', userCodigo).eq('activo', true);
  if (error || !profile || sources.error || !Array.isArray(sources.data)) throw new Error('SESSION_SCOPE_READ_FAILED');
  const scope = buildPrescriptionScope({ mode: profile.modo_entrada, sources: sources.data, profileDisciplines: resolveProfileDisciplines(profile) });
  if (!scope.ok || !scope.scope.prescriptionAllowed || !scope.scope.managedDisciplines.includes(canonicalDiscipline(discipline))) throw new Error('SESSION_SCOPE_REVOKED');
}

/** New non-sports slots are server rendered, never an escape via a client "descanso" label.
 * External slots are accepted only via the server's source/day map. Survivors bypass this helper. */
export function admitSessionContent(session: Record<string, any>, userCodigo: string, weekStart: string,
  options: { externalDiscipline?: string; pastDay?: boolean } = {}) {
  const dia = normalizeTrainingKey(session.dia);
  if (!['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(dia)) throw new Error('SESSION_DAY_INVALID');
  if (options.externalDiscipline) return { dia, tipo: 'external_blocked', titulo: `${options.externalDiscipline} · Entrenamiento externo`,
    por_que: 'Gestionado por tu entrenador externo — Forge no prescribe ni modifica esta sesión.',
    descripcion: 'Actividad externa. Puedes registrar lo realizado con tu entrenador.', disciplina: options.externalDiscipline, gestionado_por: 'external' };
  if (session.tipo === 'external_blocked') throw new Error('EXTERNAL_SLOT_NOT_AUTHORIZED');
  if (options.pastDay && session.titulo === 'Sin registrar') return { dia, tipo: 'sin_registrar', titulo: 'Sin registrar',
    por_que: 'Día anterior al inicio de esta planificación', descripcion: 'No aplica — esta planificación comienza a partir de hoy.', completada: false };
  if (session.tipo === 'descanso') return { dia, tipo: 'descanso', titulo: 'Descanso', por_que: 'Recuperación programada',
    descripcion: 'Día de descanso — prioriza sueño, hidratación y nutrición.' };
  // Drop all other client metadata, including scientific notes and the ephemeral receipt.
  return verifySessionReceipt(session.sessionReceipt, session, userCodigo, weekStart);
}
