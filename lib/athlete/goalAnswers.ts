import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolveGoalAuthority, type GoalResolutionResult } from './goalResolution';
import { GOAL_DEFINITIONS, resolveGoalId } from '../sports/goalTransferModel';
import { buildPrescriptionScope, resolveProfileDisciplines } from '../sports/prescriptionScope';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function mac(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('GOAL_QUESTION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update('forge-primary-goal-question-v1:' + payload).digest('base64url');
}
async function readAuthority(db: any, codigo: string) {
  const read = await db.from('usuarios').select('objetivo_principal,perfil,modo_entrada,categoria,especialidad,distribucion_semanal').eq('codigo', codigo).single();
  const sources = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo).eq('activo', true);
  if (read.error || !read.data || sources.error || !Array.isArray(sources.data)) throw new Error('GOAL_AUTHORITY_READ_FAILED');
  const scope = buildPrescriptionScope({ mode: read.data.modo_entrada, sources: sources.data, profileDisciplines: resolveProfileDisciplines(read.data) });
  if (!scope.ok || !scope.scope.prescriptionAllowed) throw new Error('GOAL_PRESCRIPTION_SCOPE_INVALID');
  return { user: read.data, scope: scope.scope, fingerprint: digest({ user: read.data, scope: scope.scope }) };
}
export function goalQuestion(resolution: GoalResolutionResult) {
  const options = Object.entries(GOAL_DEFINITIONS).map(([id, definition]) => ({ id, ...definition }));
  const intro = resolution.status === 'GOAL_CONFLICT' ? 'Hay declaraciones distintas de objetivo principal. ¿Cuál quieres priorizar ahora?'
    : resolution.status === 'GOAL_UNSUPPORTED' ? 'Tu objetivo declarado todavía no tiene una estrategia modelada. La planificación orientada a ese objetivo no está disponible. Puedes conservarlo o elegir expresamente otro objetivo principal compatible.'
    : 'Falta un objetivo principal para construir la estrategia. ¿Cuál quieres priorizar ahora?';
  return { id: 'primary_goal', answerType: 'canonical_goal_selection' as const, options,
    text: intro + ' Opciones actuales: ' + options.map(o => o.label).join(', ') + '. Al elegir, las declaraciones principales anteriores se conservarán como antecedentes. Puedes responder «mantener mi objetivo» para salir sin cambios.' };
}
export async function requireGoalAuthority(db: any, codigo: string) {
  const authority = await readAuthority(db, codigo);
  const resolution = resolveGoalAuthority(projectAthletePrescriptionProfile(authority.user));
  if (resolution.status === 'GOAL_RESOLVED') throw new Error('GOAL_AUTHORITY_CHANGED_RETRY');
  const payload = Buffer.from(JSON.stringify({ user: codigo, fingerprint: authority.fingerprint, expires: Date.now() + 30 * 60_000 })).toString('base64url');
  return { resolution, canPlanTowardDeclaredGoal: false as const, state: 'goal_required' as const,
    question: goalQuestion(resolution), questionToken: payload + '.' + mac(payload) };
}
/** Explicit selection supersedes competing primary declarations, preserving them as unclassified history.
 * Secondary goals, specific targets and every unrelated field keep their existing meaning. */
export async function saveGoalAnswer(db: any, codigo: string, token: unknown, answer: unknown) {
  if (typeof token !== 'string' || token.length > 4000) throw new Error('GOAL_QUESTION_INVALID');
  const [payload, signature, extra] = token.split('.');
  const expected = Buffer.from(mac(payload || '')), actual = Buffer.from(signature || '');
  if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('GOAL_QUESTION_INVALID');
  let question;
  try { question = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new Error('GOAL_QUESTION_INVALID'); }
  if (question.user !== codigo || !Number.isFinite(question.expires) || question.expires < Date.now()) throw new Error('GOAL_QUESTION_EXPIRED');
  const before = await readAuthority(db, codigo);
  if (before.fingerprint !== question.fingerprint) throw new Error('GOAL_AUTHORITY_CHANGED_RETRY');
  if (typeof answer === 'string' && ['mantener mi objetivo', 'cancelar'].includes(answer.trim().toLowerCase()))
    return { ok: true, resolved: false, cancelled: true, code: 'GOAL_PLANNING_NOT_ADMITTED' };
  const goalId = typeof answer === 'string' && answer.length <= 120 ? resolveGoalId(answer) : null;
  if (!goalId) return { ok: false, resolved: false, code: 'GOAL_ANSWER_UNSUPPORTED', goalRequirement: await requireGoalAuthority(db, codigo) };
  const previousProfile = before.user.perfil;
  if (previousProfile != null && (typeof previousProfile !== 'object' || Array.isArray(previousProfile))) throw new Error('GOAL_PROFILE_INVALID');
  const profile = { ...(previousProfile || {}) }, previousDeclarations: Record<string, unknown> = {};
  for (const key of ['objetivo_general', 'objetivo_detalle', 'objetivo_principal']) {
    if (Object.hasOwn(profile, key)) { previousDeclarations[key] = profile[key]; delete profile[key]; }
  }
  const primary = { descripcion: goalId, updated_at: new Date().toISOString(),
    resolution: { version: 1, source: 'structured_primary_goal_question',
      previousPrimary: before.user.objetivo_principal ?? null, previousProfileDeclarations: previousDeclarations } };
  let query = db.from('usuarios').update({ objetivo_principal: primary, perfil: profile }).eq('codigo', codigo);
  for (const key of ['objetivo_principal', 'perfil', 'modo_entrada', 'categoria', 'especialidad']) {
    const value = before.user[key];
    query = value == null ? query.is(key, null) : query.eq(key, ['objetivo_principal', 'perfil'].includes(key) ? JSON.stringify(value) : value);
  }
  const write = await query.select('codigo');
  if (write.error || !write.data?.length) throw new Error('GOAL_AUTHORITY_CHANGED_RETRY');
  // A database reread is mandatory: chat text and the proposed update are never continuation authority.
  const after = await readAuthority(db, codigo);
  const resolution = resolveGoalAuthority(projectAthletePrescriptionProfile(after.user));
  if (resolution.status !== 'GOAL_RESOLVED' || resolution.canonicalGoalId !== goalId
    || digest(after.scope) !== digest(before.scope)) throw new Error('GOAL_AUTHORITY_CHANGED_RETRY');
  return { ok: true, resolved: true, resolution, canPlanTowardDeclaredGoal: true,
    primaryGoal: after.user.objetivo_principal, profile: after.user.perfil };
}
