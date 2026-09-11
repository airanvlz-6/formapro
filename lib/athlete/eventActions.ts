import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { resolvePlanningStrategy } from './strategyResolution';
import { buildPrescriptionScope, resolveProfileDisciplines } from '../sports/prescriptionScope';
import { EVENT_GOAL_CATALOG } from '../sports/eventGoalCatalog';
import { cancelTargetEvent, declareTargetEvent, eventAuthorityText, eventDigest, issueEventForm, legacyEventCandidates, resolveEventAuthority, verifyEventForm } from './eventAuthority';

const eventGoalLabel = (goalId: string | null) => ({
  half_marathon: 'tu media maratón', '10k': 'tu 10K', crossfit: 'tu competición de CrossFit',
  max_strength: 'tu prueba de fuerza', hyrox: 'tu competición de Hyrox',
} as Record<string, string>)[goalId ?? ''] ?? null;

export async function loadEventContext(db: any, athleteId: string, today: string) {
  const read = await db.from('usuarios').select('perfil,objetivo_principal,modo_entrada,categoria,especialidad,distribucion_semanal').eq('codigo', athleteId).single();
  const sources = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', athleteId).eq('activo', true);
  if (read.error || !read.data || sources.error || !Array.isArray(sources.data)) throw new Error('EVENT_CONTEXT_READ_FAILED');
  const scope = buildPrescriptionScope({ mode: read.data.modo_entrada, sources: sources.data, profileDisciplines: resolveProfileDisciplines(read.data) });
  if (!scope.ok) throw new Error('EVENT_SCOPE_UNRESOLVED');
  const goalId = resolvePlanningStrategy(projectAthletePrescriptionProfile(read.data)).strategyId;
  const legacy = legacyEventCandidates(read.data), stored = read.data.perfil?.targetEvent;
  const authority = resolveEventAuthority({ stored, legacy }, goalId, scope.scope, today, athleteId);
  return { user: read.data, goalId, legacy, scope: scope.scope, authority,
    fingerprint: eventDigest({ user: read.data, sources: sources.data }) };
}
export async function canonicalEventPrompt(db: any, athleteId: string) {
  try {
    const { authority } = await loadEventContext(db, athleteId, new Date().toLocaleDateString('en-CA', { timeZone: 'Atlantic/Canary' }));
    return 'EVENT_AUTHORITY — solo lectura, prevalece sobre fechas legacy y propuestas: ' + JSON.stringify(authority)
      + '\n' + eventAuthorityText(authority) + ' No inventes ni cambies fecha, horizonte o modo. No autoriza taper, semana de carrera ni pico de rendimiento.';
  } catch { return 'EVENT_AUTHORITY no disponible. No afirmes preparación hacia una fecha concreta, no calcules horizonte ni prometas taper o pico de rendimiento.'; }
}

/**
 * Weekly generation must resolve the event state before any planning contract
 * can reach the builder. This is a deterministic projection of the existing
 * event authority; it never reads or interprets free text as a date.
 */
export async function resolveWeeklyEventRequirement(db: any, athleteId: string, today: string,
  resolution?: unknown, now = Date.now()) {
  // "without_date" is a request-local acknowledgement. The canonical event
  // remains absent, but this generation attempt may continue in general
  // development without reopening the form in a loop.
  if (resolution === 'without_date') return null;
  const context = await loadEventContext(db, athleteId, today);
  const supported = !!context.goalId && !!EVENT_GOAL_CATALOG[context.goalId];
  if (!supported || context.authority.targetEvent?.status === 'active') return null;
  const label = eventGoalLabel(context.goalId);
  return {
    kind: 'target_event' as const,
    text: label ? `¿Tienes ya fecha para ${label}?` : '¿Tienes ya fecha para esta prueba?',
    supported: true,
    goalLabel: label,
    authority: context.authority,
    token: issueEventForm(athleteId, context.fingerprint, now),
  };
}
/** Explicit form submit is declaration + confirmation. Inherits the existing chat identity boundary. */
export async function eventAction(db: any, athleteId: string, operation: unknown, data: Record<string, unknown>, today: string, now = Date.now()) {
  const context = await loadEventContext(db, athleteId, today);
  if (operation === 'read') return { ok: true, authority: context.authority, message: eventAuthorityText(context.authority), goalLabel: eventGoalLabel(context.goalId),
    supported: !!context.goalId && !!EVENT_GOAL_CATALOG[context.goalId], legacy: context.legacy,
    token: issueEventForm(athleteId, context.fingerprint, now) };
  if (!['declare', 'without_date'].includes(String(operation))) throw new Error('EVENT_ACTION_INVALID');
  verifyEventForm(data.token, athleteId, context.fingerprint, now);
  const profile = context.user.perfil ?? {};
  const targetEvent = operation === 'without_date' ? cancelTargetEvent(profile.targetEvent, athleteId)
    : declareTargetEvent(athleteId, context.goalId ?? '', data.eventDate, today, profile.targetEvent,
      new Date(now).toISOString(), context.legacy.filter(c => c.date === data.eventDate).map(c => c.source), data.targetPerformance);
  const nextProfile = { ...profile, targetEvent };
  let query = db.from('usuarios').update({ perfil: nextProfile }).eq('codigo', athleteId);
  for (const key of ['perfil', 'objetivo_principal', 'modo_entrada', 'categoria', 'especialidad', 'distribucion_semanal']) {
    const value = context.user[key];
    query = value == null ? query.is(key, null) : query.eq(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  const write = await query.select('codigo');
  if (write.error || !write.data?.length) throw new Error('EVENT_CONTEXT_CHANGED_RETRY');
  const fresh = await loadEventContext(db, athleteId, today);
  if (eventDigest(fresh.user.perfil?.targetEvent) !== eventDigest(targetEvent)) throw new Error('EVENT_CONTEXT_CHANGED_RETRY');
  return { ok: true, authority: fresh.authority, message: eventAuthorityText(fresh.authority) };
}
