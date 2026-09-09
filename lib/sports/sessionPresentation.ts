/** Persisted comparison text is produced by the server and checked as part of structuredPrescription.
 * It is never displayed. Older sessions retain exactly their existing text. */
type TextSession = { titulo?: string; descripcion?: string; por_que?: string; tipo?: string; structuredPrescription?: {
  schemaVersion?: number;
  presentation?: { version?: string; comparisonRepresentation?: { titulo?: string; descripcion?: string; por_que?: string } } } };
export function legacySessionView<T extends TextSession>(session: T): T {
  const presentation = session.structuredPrescription?.presentation;
  const text = ['human_v2', 'human_v3'].includes(presentation?.version ?? '') ? presentation?.comparisonRepresentation : undefined;
  return text && typeof text.titulo === 'string' && typeof text.descripcion === 'string' && typeof text.por_que === 'string'
    ? { ...session, titulo: text.titulo, descripcion: text.descripcion, por_que: text.por_que } : session;
}
export type PresentationVersion = 'legacy' | 'human_v2' | 'human_v3';
/** Exact historical heuristics, isolated from editorial copy; not a new intensity authority. */
export function contextualSessionIntensity(session: TextSession | null | undefined): 'baja' | 'moderada' | 'alta' | null {
  if (!session) return null;
  const legacy = legacySessionView(session);
  return /alta|maxima|max|intenso/i.test(legacy.descripcion || '') ? 'alta' : legacy.tipo === 'descanso' ? 'baja' : 'moderada';
}
export function legacyDurationMinutes(session: TextSession | null | undefined) {
  return session ? (legacySessionView(session).titulo || '').match(/(\d+)\s*min/)?.[1] || null : null;
}
export function authenticatedPresentationVersion(value: unknown): PresentationVersion {
  if (value === undefined || value === 'legacy') return 'legacy';
  if (value === 'human_v2' || value === 'human_v3') return value;
  throw new Error('SESSION_PRESENTATION_VERSION_UNSUPPORTED');
}
