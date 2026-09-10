import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PrescriptionScope } from '../sports/prescriptionScope';
import { EVENT_GOAL_CATALOG } from '../sports/eventGoalCatalog';

const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, ordered(value)])) : v;
const serialized = (v: unknown) => JSON.stringify(ordered(v));
export const eventDigest = (v: unknown): string => createHash('sha256').update(serialized(v)).digest('hex');
/** UTC is arithmetic only: competition dates have no time or implicit local-zone conversion. */
export function civilDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86400000 : null;
}
export type TargetEvent = {
  version: 1; revision: number; eventId: string; goalId: string; discipline: string;
  eventType: 'race' | 'competition' | 'test' | 'other'; eventDate: string;
  priority: 'primary' | 'secondary'; targetPerformance?: string;
  status: 'active' | 'completed' | 'cancelled';
  provenance: { source: 'structured_event_form'; athleteId: string; legacySources: string[] };
  confirmation: 'CONFIRMED'; createdAt: string; confirmedAt: string; digest: string;
};
export type EventEnvelope = { event: TargetEvent; signature: string };
function mac(value: unknown) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('EVENT_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', key).update('forge-event-v1:' + serialized(value)).digest('base64url');
}
function signed(value: unknown, signature: unknown) {
  if (typeof signature !== 'string') return false;
  const a = Buffer.from(mac(value)), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function readTargetEvent(raw: unknown, athleteId?: string): TargetEvent | null {
  try {
    const envelope = object(raw), e = object(envelope.event) as TargetEvent;
    if (!signed(e, envelope.signature) || e.version !== 1 || !Number.isSafeInteger(e.revision) || e.revision < 1
      || !e.eventId || civilDay(e.eventDate) === null || !['active', 'completed', 'cancelled'].includes(e.status)
      || !['primary', 'secondary'].includes(e.priority) || !['race', 'competition', 'test', 'other'].includes(e.eventType)
      || e.confirmation !== 'CONFIRMED' || e.provenance?.source !== 'structured_event_form'
      || (athleteId !== undefined && e.provenance.athleteId !== athleteId)) return null;
    const { digest, ...body } = e;
    return eventDigest(body) === digest ? structuredClone(e) : null;
  } catch { return null; }
}
/** Existing writers do not attest structured date confirmation. Preserve candidates, never parse prose. */
export function legacyEventCandidates(user: unknown) {
  const u = object(user), p = object(u.perfil);
  return [ ['usuarios.objetivo_principal', u.objetivo_principal], ['usuarios.perfil.objetivo_principal', p.objetivo_principal],
    ...['competicion', 'proxima_carrera', 'carrera_objetivo', 'objetivo_detalle', 'prioridad'].map(k => [`usuarios.perfil.${k}`, p[k]]) ]
    .flatMap(([source, raw]) => {
      const r = object(raw), date = r.eventDate ?? r.fecha ?? (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);
      if (raw == null) return [];
      return [{ source: String(source), date: typeof date === 'string' ? date : null,
        validity: civilDay(date) !== null ? 'EXPLICIT_DATE_UNCONFIRMED' : date == null ? 'NO_STRUCTURED_DATE' : 'INVALID_DATE' }];
    });
}
export function declareTargetEvent(athleteId: string, goalId: string, eventDate: unknown, today: string,
  previous: unknown, timestamp: string, legacySources: string[] = [], targetPerformance?: unknown): EventEnvelope {
  const adapter = EVENT_GOAL_CATALOG[goalId];
  if (!adapter) throw new Error('EVENT_GOAL_NOT_SUPPORTED');
  const day = civilDay(eventDate), current = civilDay(today);
  if (day === null || current === null) throw new Error('EVENT_DATE_INVALID');
  if (day <= current) throw new Error('EVENT_DATE_NOT_FUTURE');
  if (targetPerformance !== undefined && (typeof targetPerformance !== 'string' || !targetPerformance.trim() || targetPerformance.length > 200)) throw new Error('EVENT_PERFORMANCE_INVALID');
  const old = readTargetEvent(previous, athleteId);
  const body = { version: 1 as const, revision: (old?.revision ?? 0) + 1,
    eventId: old?.eventId ?? eventDigest({ athleteId, timestamp, goalId }), goalId, ...adapter, eventDate: eventDate as string,
    priority: 'primary' as const, ...(targetPerformance === undefined ? {} : { targetPerformance: targetPerformance as string }),
    status: 'active' as const, provenance: { source: 'structured_event_form' as const, athleteId, legacySources },
    confirmation: 'CONFIRMED' as const, createdAt: old?.createdAt ?? timestamp, confirmedAt: timestamp };
  const event = { ...body, digest: eventDigest(body) };
  return { event, signature: mac(event) };
}
export function cancelTargetEvent(raw: unknown, athleteId: string): EventEnvelope | null {
  const old = readTargetEvent(raw, athleteId);
  if (!old) return null;
  const { digest: _, ...body } = old;
  const changed = { ...body, status: 'cancelled' as const, revision: old.revision + 1 };
  const event = { ...changed, digest: eventDigest(changed) };
  return { event, signature: mac(event) };
}
export function resolveEventAuthority(input: { stored?: unknown; legacy?: ReturnType<typeof legacyEventCandidates> },
  goalId: string | null, scope: PrescriptionScope, today: string, athleteId?: string) {
  const current = civilDay(today);
  if (current === null) throw new Error('EVENT_TODAY_INVALID');
  const event = readTargetEvent(input.stored, athleteId);
  const dates = [...new Set((input.legacy ?? []).flatMap(c => c.date ? [c.date] : []))];
  const validity = input.stored && !event ? 'INVALID_CONFIRMATION' : !event ? dates.length > 1 ? 'LEGACY_CONFLICT'
    : dates.length ? 'CONFIRMATION_REQUIRED' : 'NO_EVENT'
    : event.status !== 'active' ? 'INACTIVE' : event.priority !== 'primary' ? 'NOT_PRIMARY'
    : event.goalId !== goalId ? 'GOAL_CHANGED' : !EVENT_GOAL_CATALOG[event.goalId]
      || EVENT_GOAL_CATALOG[event.goalId].discipline !== event.discipline ? 'UNSUPPORTED_EVENT'
    : civilDay(event.eventDate)! <= current ? (event.eventDate === today ? 'EVENT_TODAY' : 'EVENT_PAST')
    : !scope.prescriptionAllowed || !scope.managedDisciplines.includes(event.discipline) ? 'CONTEXT_ONLY' : 'VALID';
  const managed = validity === 'VALID';
  const daysRemaining = event && event.status === 'active' && civilDay(event.eventDate)! > current ? civilDay(event.eventDate)! - current : null;
  const body = { version: 1 as const, asOfDate: today, planningMode: managed ? 'EVENT_PREPARATION' as const : 'GENERAL_DEVELOPMENT' as const,
    validity, prescriptionAllowed: scope.prescriptionAllowed, eventId: event?.eventId ?? null, eventDate: event?.eventDate ?? null, targetEvent: event,
    daysRemaining, weeksRemaining: daysRemaining === null ? null : daysRemaining / 7,
    eventDigest: event?.digest ?? null, scopeDigest: eventDigest(scope), goalId,
    confirmationRequired: !event && dates.length > 0, periodizationAuthority: false as const };
  return { ...body, digest: eventDigest(body) };
}
export type EventAuthority = ReturnType<typeof resolveEventAuthority>;
export function eventAuthorityText(a: EventAuthority) {
  if (!a.prescriptionAllowed) return 'Forge puede conservar la fecha como contexto. Tu modo actual no permite que Forge planifique la preparación.';
  return a.planningMode === 'EVENT_PREPARATION'
    ? `Forge conoce tu fecha objetivo (${a.eventDate}); faltan ${a.daysRemaining} días. Es una referencia temporal, no una garantía de taper o pico de rendimiento.`
    : a.validity === 'EVENT_PAST' || a.validity === 'EVENT_TODAY' ? 'La fecha registrada ya no es futura. Revisa el evento; no hay preparación temporal activa.'
    : a.validity === 'CONTEXT_ONLY' ? 'Evento guardado como contexto. Forge no gestiona la preparación de esa disciplina en tu modo actual.'
    : 'Forge trabajará en desarrollo general hacia este objetivo. Puedes añadir o confirmar una fecha más adelante; no hay periodización temporal activa.';
}
/** Only existing advisory fields survive Analyzer output. Temporal facts are server-owned. */
export function boundEventAnalysis(raw: unknown, authority: EventAuthority): Record<string, any> {
  const r = object(raw);
  const fields = ['tipo_semana', 'objetivo', 'volumen_relativo', 'intensidad_relativa', 'debilidad_prioritaria', 'dias_entreno_sugeridos', 'coaching_notes_incorporadas', 'strategyProposal'];
  const result = Object.fromEntries(fields.filter(k => Object.hasOwn(r, k)).map(k => [k, r[k]]));
  // Analyzer prose cannot make a conflicting dated-event promise through its objective field.
  result.objetivo = eventAuthorityText(authority);
  return { ...result, eventAuthority: structuredClone(authority) };
}
/** A form challenge binds the exact server goal/scope/profile snapshot, never a model assertion. */
export function issueEventForm(athleteId: string, fingerprint: string, now = Date.now()) {
  const body = { athleteId, fingerprint, expires: now + 30 * 60_000 };
  return Buffer.from(JSON.stringify(body)).toString('base64url') + '.' + mac(body);
}
export function verifyEventForm(token: unknown, athleteId: string, fingerprint: string, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 4000) throw Error();
    const [encoded, signature, extra] = token.split('.'), body = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (extra || !signed(body, signature) || body.athleteId !== athleteId || body.fingerprint !== fingerprint
      || !Number.isFinite(body.expires) || body.expires < now) throw Error();
  } catch { throw new Error('EVENT_FORM_STALE_OR_INVALID'); }
}
