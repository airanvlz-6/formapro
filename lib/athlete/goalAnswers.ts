import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolveGoalAuthority, type GoalResolutionResult } from './goalResolution';
import { resolveGoalId } from '../sports/goalTransferModel';
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
  const options = resolution.candidates.map((candidate, index) => ({ id: String(index + 1), label: candidate.value,
    source: candidate.source, recognizedId: candidate.recognizedId }));
  const intro = resolution.status === 'GOAL_CONFLICT' ? 'Hay declaraciones distintas de objetivo principal. ¿Cuál quieres priorizar ahora?'
    : resolution.status === 'GOAL_UNSUPPORTED' ? 'Tu objetivo declarado todavía no tiene una estrategia modelada. La planificación orientada a ese objetivo no está disponible. Puedes conservarlo o elegir expresamente otro objetivo principal compatible.'
    : 'Falta un objetivo principal para construir la estrategia. ¿Cuál quieres priorizar ahora?';
  return { id: 'primary_goal', answerType: 'primary_goal_declaration' as const, options,
    classification: options.length && options.every(o => !o.recognizedId) ? 'needs_classification' : 'select_or_declare',
    text: intro + (options.length ? '\nDeclaraciones registradas:\n' + options.map(o => `${o.id}. ${o.label}`).join('\n')
      + '\nResponde con el número o el texto exacto de una declaración.' : '')
      + '\nPara declarar o corregir otra meta, escribe «Mi objetivo es: ...». Una meta no modelada se conservará como principal, pero no habilitará planificación estratégica. Las declaraciones principales sustituidas se conservarán como antecedentes. «Cancelar» sale sin cambios.' };
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
  const current = resolveGoalAuthority(projectAthletePrescriptionProfile(before.user));
  const reply = typeof answer === 'string' ? answer.trim() : '';
  if (reply.toLowerCase() === 'mantener mi objetivo' && current.status === 'GOAL_CONFLICT')
    return { ok: false, resolved: false, code: 'GOAL_SELECTION_AMBIGUOUS', goalRequirement: await requireGoalAuthority(db, codigo) };
  if (['mantener mi objetivo', 'cancelar'].includes(reply.toLowerCase()))
    return { ok: true, resolved: false, cancelled: true, code: 'GOAL_PLANNING_NOT_ADMITTED' };
  const selected = current.candidates.find((c, index) => reply === String(index + 1) || reply === c.value);
  const declared = /^mi objetivo es:\s*(\S[\s\S]*)$/i.exec(reply)?.[1]?.trim();
  const value = selected?.value ?? declared ?? (resolveGoalId(reply) ? reply : null);
  if (!value || value.length > 2000) return { ok: false, resolved: false, code: 'GOAL_DECLARATION_REQUIRED', goalRequirement: await requireGoalAuthority(db, codigo) };
  const goalId = resolveGoalId(value);
  const previousProfile = before.user.perfil;
  if (previousProfile != null && (typeof previousProfile !== 'object' || Array.isArray(previousProfile))) throw new Error('GOAL_PROFILE_INVALID');
  const profile = { ...(previousProfile || {}) }, previousDeclarations: Record<string, unknown> = {};
  for (const key of ['objetivo_general', 'objetivo_principal']) {
    if (Object.hasOwn(profile, key)) { previousDeclarations[key] = profile[key]; delete profile[key]; }
  }
  const primary = { descripcion: goalId ?? value, updated_at: new Date().toISOString(),
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
  if (resolution.status !== (goalId ? 'GOAL_RESOLVED' : 'GOAL_UNSUPPORTED') || resolution.canonicalGoalId !== goalId
    || after.user.objetivo_principal?.descripcion !== (goalId ?? value)
    || digest(after.scope) !== digest(before.scope)) throw new Error('GOAL_AUTHORITY_CHANGED_RETRY');
  return { ok: true, resolved: !!goalId, saved: true, resolution, canPlanTowardDeclaredGoal: !!goalId,
    ...(!goalId ? { code: 'GOAL_UNSUPPORTED', message: 'Objetivo principal guardado. Forge todavía no tiene una estrategia modelada para esa meta; la planificación estratégica sigue pendiente.' } : {}),
    primaryGoal: after.user.objetivo_principal, profile: after.user.perfil };
}
