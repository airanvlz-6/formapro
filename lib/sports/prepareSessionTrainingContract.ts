import type { PrescriptionIntent } from './prescriptionIntent';
import type { CanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { buildPrescriptionScope, canonicalDiscipline, normalizeTrainingKey, resolveProfileDisciplines, type TrainingSource } from './prescriptionScope';
import { buildAllowedTrainingContract, EXPOSURE_LIMITATIONS, type ContractInput, type ContractResult, type ExternalLoadContext } from './allowedTrainingContract';
import { buildExposureReport } from './exposureEngine';
import { legacySessionView } from './sessionPresentation';
import { normalizeTrainingAvailability } from './trainingAvailability';

type StoredProfile = { modo_entrada?: string; especialidad?: string; categoria?: string; distribucion_semanal?: unknown };
function distribution(value: unknown): Record<string, unknown> {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
function days(value: unknown): string[] | null {
  if (value == null) return null;
  const list = typeof value === 'string' ? value.split(',') : value;
  return Array.isArray(list) && list.every(d => typeof d === 'string') ? list.map(normalizeTrainingKey) : [];
}
/** Read-only server adapter. Request fields express intent, never mode or ownership.
 * buildFocusContext remains presentation context and is deliberately not called here.
 */
export async function prepareSessionTrainingContext(db: any, userCodigo: string, profile: StoredProfile,
  request: { targetWeekStart: string; day: string; discipline: string; stimulus: unknown; intent?: PrescriptionIntent },
  restrictions: CanonicalRestrictions): Promise<{ ok: true; input: ContractInput } | { ok: false; errors: string[] }> {
  try {
    const sourceRead = await db.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', userCodigo).eq('activo', true);
    if (sourceRead.error || !Array.isArray(sourceRead.data)) return { ok: false, errors: ['SCOPE_SOURCES_READ_FAILED'] };
    const sources: TrainingSource[] = sourceRead.data;
    const dist = distribution(profile.distribucion_semanal);
    const profileDisciplines = resolveProfileDisciplines(profile);
    const scope = buildPrescriptionScope({ mode: profile.modo_entrada, sources, profileDisciplines });
    if (!scope.ok) return scope;
    const discipline = canonicalDiscipline(request.discipline);
    if (!scope.scope.prescriptionAllowed) return { ok: false, errors: ['PRESCRIPTION_NOT_ALLOWED'] };
    if (!scope.scope.managedDisciplines.includes(discipline)) return { ok: false, errors: ['DISCIPLINE_OUTSIDE_MANAGED_SCOPE'] };
    const own = sources.filter(s => s.activo && s.owner === 'forge' && canonicalDiscipline(s.disciplina) === discipline);
    const ownDays = own.flatMap(s => s.dias == null ? [] : days(s.dias) || []);
    const distAvailability = normalizeTrainingAvailability(dist, [discipline]);
    const availableDays = own.some(s => s.dias != null) ? ownDays : distAvailability.ok ? distAvailability.availability[discipline]
      : distAvailability.reason !== 'missing' ? []
      : scope.scope.mode === 'coach' ? days(dist.dias ?? dist.disponibilidad) : null;
    // Focus never guesses its delegated calendar when it has not been recorded.
    if (scope.scope.mode === 'focus' && availableDays === null) return { ok: false, errors: ['FOCUS_AVAILABILITY_UNRESOLVED'] };
    const externalSources = sources.filter(s => s.activo && s.owner === 'external');
    const externalLoadContext: ExternalLoadContext = { source: 'server_training_sources_and_records', policy: 'read_only_context',
      activities: externalSources.map(s => ({ discipline: canonicalDiscipline(s.disciplina), days: days(s.dias) || [] })), records: [] };
    if (scope.scope.externalDisciplines.length) {
      // Preserve dated evidence as context; do not invent a load score or selection threshold.
      const read = await db.from('external_training_records').select('fecha,disciplina,duracion,intensidad_percibida,fatiga_post')
        .eq('user_codigo', userCodigo).order('fecha', { ascending: false }).limit(90);
      if (read.error || !Array.isArray(read.data)) return { ok: false, errors: ['EXTERNAL_LOAD_READ_FAILED'] };
      externalLoadContext.records = read.data.map((r: ExternalLoadContext['records'][number]) => ({ ...r, disciplina: canonicalDiscipline(r.disciplina) }));
    }
    const history = await db.from('weekly_plan').select('sessions').eq('user_codigo', userCodigo).order('week_start', { ascending: false }).limit(4);
    if (history.error || !Array.isArray(history.data)) return { ok: false, errors: ['EXPOSURE_READ_FAILED'] };
    const completed = history.data.flatMap((p: { sessions?: any[] }) => (p.sessions || []).filter(s => s.completada && s.descripcion_real)
      .map(s => ({ fecha: s.dia, tipo: s.tipo, titulo: legacySessionView(s).titulo || '', descripcionReal: s.descripcion_real })));
    const report = buildExposureReport(completed, discipline);
    return { ok: true, input: { prescriptionScope: scope.scope, targetWeekStart: request.targetWeekStart,
      targetDay: normalizeTrainingKey(request.day), discipline, stimulus: request.stimulus,
      restrictionsSnapshot: restrictions, externalLoadContext, exposureContext: { source: 'legacy_completed_weekly_rows', report, limitations: EXPOSURE_LIMITATIONS },
      ...(Object.hasOwn(request, 'intent') ? { intent: request.intent } : {}),
      availableDays, source: 'weekly_session_builder' } };
  } catch { return { ok: false, errors: ['CONTRACT_CONTEXT_READ_FAILED'] }; }
}

/** Existing session entry point; context loading and pure feasibility can also be used separately. */
export async function prepareSessionTrainingContract(db: any, userCodigo: string, profile: StoredProfile,
  request: { targetWeekStart: string; day: string; discipline: string; stimulus: unknown; intent?: PrescriptionIntent },
  restrictions: CanonicalRestrictions): Promise<ContractResult> {
  const context = await prepareSessionTrainingContext(db, userCodigo, profile, request, restrictions);
  return context.ok ? buildAllowedTrainingContract(context.input) : context;
}
