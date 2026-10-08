// FORGE BUILD 8C-D — Coach handoff for a profile change that is ALREADY persisted.
//
// Pure authority (no React, no DB, no LLM): the route rereads the canonical profile and passes it in. The profile is the source of truth;
// this module never writes it. A handoff token proves that PATCH /api/athlete/profile persisted exactly this change for exactly this
// athlete (HMAC, user-bound, expiring). The change itself is reconciled against the CURRENT persisted profile before the Coach sees it.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { computeChangeId, readCanonicalField, sameValue } from '../athlete/profileChange';

type Row = Record<string, any>;
const TTL_MS = 24 * 60 * 60_000;
const MAX_FIELDS = 12;

export type HandoffFailure = { ok: false; status: number; code: string };
export type HandoffResolution = { ok: true; changeId: string; message: string; context: Row };

function mac(payload: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('PROFILE_HANDOFF_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', secret).update('forge-profile-change-handoff-v1:' + payload).digest('base64url');
}
/** Token bound to athlete + change id. Throws if the signing secret is unavailable (callers must not fail the PATCH for it). */
export function issueProfileChangeHandoff(athleteId: string, changeId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ athleteId, changeId, expires: now + TTL_MS })).toString('base64url');
  return `${payload}.${mac(payload)}`;
}
function verifyToken(token: unknown, athleteId: string, now: number): { changeId: string } | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  let expected: Buffer;
  try { expected = Buffer.from(mac(payload)); } catch { return null; }
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (body?.athleteId !== athleteId || typeof body.changeId !== 'string' || typeof body.expires !== 'number' || body.expires < now) return null;
    return { changeId: body.changeId };
  } catch { return null; }
}

const reject = (status: number, code: string): HandoffFailure => ({ ok: false, status, code });
const LABELS: Record<string, string> = { objective: 'objetivo principal', category: 'categoría', specialty: 'especialidad', weeklyAvailability: 'disponibilidad semanal',
  sessionDuration: 'duración de sesión', trainingSources: 'fuentes de entrenamiento', restrictions: 'restricciones', equipment: 'equipamiento', level: 'nivel', targetEvent: 'evento objetivo' };
const show = (v: unknown) => v == null || v === '' ? 'sin definir' : typeof v === 'string' ? `"${v}"` : JSON.stringify(v);

/**
 * `datos` = { profileChange: { id, changedFields: [{ field, previous, current }] }, token }.
 * `profile` = canonical profile REREAD by the server for the authenticated athlete.
 */
export function resolveProfileChangeHandoff(datos: unknown, athleteId: string, profile: Row | null, now = Date.now()): HandoffResolution | HandoffFailure {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return reject(400, 'PROFILE_HANDOFF_INVALID');
  const { profileChange, token } = datos as Row;
  const fields = profileChange?.changedFields;
  if (!profileChange || typeof profileChange.id !== 'string' || !Array.isArray(fields) || !fields.length || fields.length > MAX_FIELDS) return reject(400, 'PROFILE_HANDOFF_INVALID');
  const submitted: { field: string; previous: unknown; current: unknown }[] = [];
  for (const f of fields) {
    if (!f || typeof f.field !== 'string' || !LABELS[f.field]) return reject(400, 'PROFILE_HANDOFF_INVALID');
    submitted.push({ field: f.field, previous: f.previous ?? null, current: f.current ?? null });
  }
  const verified = verifyToken(token, athleteId, now);
  // Token bound to this athlete AND to the digest of the submitted fields: editing any previous/current invalidates it.
  if (!verified || verified.changeId !== profileChange.id || computeChangeId(submitted) !== profileChange.id) return reject(403, 'PROFILE_HANDOFF_INVALID_TOKEN');
  if (!profile) return reject(503, 'PROFILE_READ_UNAVAILABLE');
  // Reconcile with persisted truth: the Coach must never reason from a value the profile no longer holds.
  for (const f of submitted) {
    const persisted = readCanonicalField(profile, f.field);
    if (!persisted.known || !sameValue(persisted.value, f.current)) return reject(409, 'PROFILE_HANDOFF_STALE');
  }
  const plan = profile.planStructure ?? {};
  const context: Row = {
    // Immutable truths: the Coach may coach/adapt/plan, never rewrite them.
    immutable: true,
    objective: { text: plan.objective ?? null, authority: true },
    changedFields: submitted,
    trainingMeans: { specialty: plan.specialty ?? null, category: plan.category ?? null, sources: plan.trainingSources ?? [], role: 'MEANS_NOT_OBJECTIVE' },
    weeklyAvailability: plan.weeklyAvailability ?? null,
    sessionDuration: plan.sessionDuration ?? null,
    level: plan.level ?? null,
    restrictions: plan.restrictions ?? null,
    equipment: plan.equipment ?? null,
    prescriptionParameters: profile.prescriptionParameters ?? null,
  };
  const lines = submitted.map(f => `- ${LABELS[f.field]}: antes ${show(f.previous)} → ahora ${show(f.current)}`);
  const objective = submitted.find(f => f.field === 'objective');
  const message = [
    'Acabo de actualizar mi perfil (ya guardado). Cambios:', ...lines,
    objective ? `Mi objetivo principal ahora es ${show(objective.current)}; el anterior (${show(objective.previous)}) es solo contexto del cambio. Las disciplinas que entreno son medios, no el objetivo.` : '',
    'Revisa cómo afecta a mi planificación y propónmelo.',
  ].filter(Boolean).join('\n');
  return { ok: true, changeId: profileChange.id, message, context };
}
