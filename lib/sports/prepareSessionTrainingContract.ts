import type { CanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { buildPrescriptionScope, canonicalDiscipline, normalizeTrainingKey, resolveProfileDisciplines, type TrainingSource } from './prescriptionScope';
import { buildAllowedTrainingContract, EXPOSURE_LIMITATIONS, type ContractResult, type ExternalLoadContext } from './allowedTrainingContract';
import { buildExposureReport } from './exposureEngine';

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
export async function prepareSessionTrainingContract(db: any, userCodigo: string, profile: StoredProfile,
  request: { targetWeekStart: string; day: string; discipline: string; stimulus: unknown },
  restrictions: CanonicalRestrictions): Promise<ContractResult> {
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
    const distEntry = Object.entries(dist).find(([key]) => canonicalDiscipline(key) === discipline);
    const availableDays = own.some(s => s.dias != null) ? ownDays : distEntry ? days(distEntry[1])
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
      .map(s => ({ fecha: s.dia, tipo: s.tipo, titulo: s.titulo || '', descripcionReal: s.descripcion_real })));
    const report = buildExposureReport(completed, discipline);
    return buildAllowedTrainingContract({ prescriptionScope: scope.scope, targetWeekStart: request.targetWeekStart,
      targetDay: normalizeTrainingKey(request.day), discipline, stimulus: request.stimulus,
      restrictionsSnapshot: restrictions, externalLoadContext, exposureContext: { source: 'legacy_completed_weekly_rows', report, limitations: EXPOSURE_LIMITATIONS },
      availableDays, source: 'weekly_session_builder' });
  } catch { return { ok: false, errors: ['CONTRACT_CONTEXT_READ_FAILED'] }; }
}
