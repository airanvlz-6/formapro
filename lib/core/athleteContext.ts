import type { SupabaseClient } from '@supabase/supabase-js';
import { projectAthletePrescriptionProfile, record } from '../athlete/athletePrescriptionContext';
import { resolveGoalAuthority } from '../athlete/goalResolution';
import { civilDay, readTargetEvent } from '../athlete/eventAuthority';
import { getCanonicalRestrictions } from '../athlete/getCanonicalRestrictions';
import { prescriptionHistorySummary } from '../athlete/prescriptionHistorySummary';
import { buildPrescriptionScope, canonicalDiscipline, resolveProfileDisciplines, type TrainingSource } from '../sports/prescriptionScope';
import { baseAvailabilityDays } from '../sports/trainingAvailability';

export type CoreFact<T> =
  | { status: 'known'; source: string; value: T }
  | { status: 'unknown' | 'read_failed'; source: string; value: null; reason: string };
type Database = Pick<SupabaseClient, 'from'>;
const known = <T>(source: string, value: T): CoreFact<T> => ({ status: 'known', source, value });
const unknown = (source: string, reason: string, status: 'unknown' | 'read_failed' = 'unknown'): CoreFact<never> =>
  ({ status, source, value: null, reason });
const propagate = (fact: Exclude<CoreFact<unknown>, { status: 'known' }>, source: string): CoreFact<never> =>
  unknown(source, fact.reason, fact.status);

async function read<T>(source: string, query: () => PromiseLike<{ data: unknown; error: unknown }>,
  valid: (value: unknown) => value is T): Promise<CoreFact<T>> {
  try {
    const result = await query();
    if (result.error) return unknown(source, 'READ_FAILED', 'read_failed');
    if (result.data === null) return unknown(source, 'NOT_FOUND');
    return valid(result.data) ? known(source, result.data) : unknown(source, 'INVALID_STORED_DATA');
  } catch { return unknown(source, 'READ_FAILED', 'read_failed'); }
}
const isRow = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRows = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(isRow);

/** Read-only factual boundary. No strategy, progression, frequency or generation decisions.
 * referenceDate is a civil date for projections, not a claim of a historical DB snapshot.
 * A successful restriction read confirms only the absence/presence of recorded restrictions.
 */
export async function loadCoreAthleteContext(db: Database, userCodigo: string, referenceDate: string) {
  if (typeof userCodigo !== 'string' || !userCodigo.trim() || civilDay(referenceDate) === null)
    throw new Error('CORE_CONTEXT_INVALID_INPUT');
  const [user, sources, plans, restrictions] = await Promise.all([
    read('usuarios', () => db.from('usuarios')
      .select('codigo,modo_entrada,categoria,especialidad,perfil,objetivo_principal,ciclo_actual,distribucion_semanal')
      .eq('codigo', userCodigo).maybeSingle(), isRow),
    read('athlete_training_sources', () => db.from('athlete_training_sources')
      .select('disciplina,owner,activo,dias').eq('user_codigo', userCodigo), isRows),
    read('weekly_plan', () => db.from('weekly_plan').select('week_start,sessions')
      .eq('user_codigo', userCodigo).lte('week_start', referenceDate).order('week_start', { ascending: false }).limit(4),
    (v): v is Record<string, unknown>[] => isRows(v) && v.every(p => civilDay(p.week_start) !== null && isRows(p.sessions))),
    (async () => {
      try {
        const value = await getCanonicalRestrictions(db, userCodigo, new Date(referenceDate + 'T12:00:00Z'));
        return known('getCanonicalRestrictions', { resolution: value.active ? 'active' as const : 'confirmed_none' as const, ...value });
      } catch (error) {
        const message = record(error).message;
        const code = typeof message === 'string' && /^RESTRICTIONS_[A-Z_]+$/.test(message) ? message : 'RESTRICTIONS_READ_FAILED';
        return unknown('getCanonicalRestrictions', code, code.includes('READ_FAILED') ? 'read_failed' : 'unknown');
      }
    })(),
  ]);
  // Identity mismatch must never attach another athlete's facts to the requested identity.
  if (user.status === 'known' && user.value.codigo !== userCodigo) throw new Error('CORE_CONTEXT_IDENTITY_MISMATCH');
  const profile = user.status === 'known' ? projectAthletePrescriptionProfile(user.value, referenceDate) : null;
  const storedProfile = user.status === 'known' ? record(user.value.perfil) : {};
  const profileDisciplines = user.status === 'known' ? resolveProfileDisciplines(user.value) : [];
  const sourceRows = sources.status === 'known' ? sources.value : [];
  const validSources = sources.status === 'known' && sourceRows.every(s => typeof s.disciplina === 'string' && s.disciplina.trim()
    && ['forge', 'external'].includes(String(s.owner)) && typeof s.activo === 'boolean');
  const scope = user.status === 'known' && validSources ? buildPrescriptionScope({
    mode: user.value.modo_entrada, sources: sourceRows as TrainingSource[], profileDisciplines,
  }) : null;
  const declared = validSources ? sourceRows.map(s => ({ discipline: canonicalDiscipline(s.disciplina as string),
    ownership: s.owner as 'forge' | 'external', active: s.activo as boolean | null, source: 'athlete_training_sources' })) : [];
  const inferredOwnership = scope?.ok ? [
    ...scope.scope.managedDisciplines.map(discipline => ({ discipline, ownership: 'forge' as const })),
    ...scope.scope.externalDisciplines.map(discipline => ({ discipline, ownership: 'external' as const })),
  ].filter(s => !declared.some(d => d.discipline === s.discipline))
    .map(s => ({ ...s, active: null, source: 'prescriptionScope:legacy_profile' })) : [];
  const disciplines = sources.status !== 'known' ? propagate(sources, 'disciplines')
    : !validSources ? unknown('disciplines', 'INVALID_TRAINING_SOURCE')
      : known('prescriptionScope/athlete_training_sources', { entries: [...declared, ...inferredOwnership],
        profileDisciplines, scopeStatus: scope?.ok ? 'resolved' as const : 'unresolved' as const,
        scope: scope?.ok ? scope.scope : null,
        diagnostics: scope && !scope.ok ? scope.errors : scope ? [] : ['PROFILE_UNAVAILABLE'] });
  const disciplineIds = [...new Set([...profileDisciplines, ...declared.map(s => s.discipline)])];
  const availability = Object.fromEntries(disciplineIds.map(discipline => {
    if (user.status !== 'known') return [discipline, propagate(user, 'availability')];
    if (sources.status !== 'known') return [discipline, propagate(sources, 'availability')];
    if (!validSources) return [discipline, unknown('availability', 'INVALID_TRAINING_SOURCE')];
    const days = baseAvailabilityDays(user.value.distribucion_semanal, sourceRows.filter(s => s.activo === true) as TrainingSource[], discipline);
    return [discipline, days === null ? unknown('usuarios.distribucion_semanal/athlete_training_sources.dias', 'MISSING_OR_INVALID')
      : known('usuarios.distribucion_semanal/athlete_training_sources.dias', days)];
  }));
  const goal = profile ? known('resolveGoalAuthority', resolveGoalAuthority(profile))
    : propagate(user as Exclude<typeof user, { status: 'known' }>, 'goal');
  const targetEvent = profile ? (() => {
    const input = profile.eventInput;
    const event = readTargetEvent(input.stored, userCodigo);
    return known('usuarios.perfil.targetEvent/eventAuthority', {
      status: event ? 'confirmed' as const : input.stored ? 'unverified' as const
        : input.legacy.some(c => c.date !== null) ? 'legacy_unconfirmed' as const : 'missing' as const,
      event, targetDate: event?.eventDate ?? null, legacyCandidates: input.legacy,
    });
  })() : propagate(user as Exclude<typeof user, { status: 'known' }>, 'targetEvent');
  const experience = user.status !== 'known' ? propagate(user, 'experience') : known('usuarios.perfil', {
    declarations: Object.fromEntries(['nivel', 'nivel_cf', 'nivel_carrera', 'experiencia'].map(field => [field,
      typeof storedProfile[field] === 'string' && storedProfile[field].trim() ? known(`usuarios.perfil.${field}`, storedProfile[field])
        : unknown(`usuarios.perfil.${field}`, 'MISSING_OR_INVALID')])),
    skillSignals: Object.fromEntries(Object.entries(profile!.prescriptionSignals.signals).filter(([key]) => key.startsWith('skill.'))),
  });
  const trainingHistory = plans.status !== 'known' ? propagate(plans, 'trainingHistory') : known('prescriptionHistorySummary', {
    coverage: 'LAST_FOUR_WEEKLY_ROWS_NOT_COMPLETE_EXECUTION_HISTORY' as const,
    entries: prescriptionHistorySummary(plans.value, referenceDate).map(s => ({ date: s.date, sessionId: s.sessionId,
      discipline: s.prescription.discipline, factualState: s.factualState, execution: s.execution })),
  });
  const position = user.status === 'known' ? record(user.value.ciclo_actual) : {};
  const currentPosition = profile ? !Object.keys(position).length ? unknown('usuarios.ciclo_actual', 'MISSING_OR_INVALID') : known('usuarios.ciclo_actual', {
    ...profile.cycle, planningWeekStart: civilDay(position.planningWeekStart) !== null
      ? known('usuarios.ciclo_actual.planningWeekStart', position.planningWeekStart as string)
      : unknown('usuarios.ciclo_actual.planningWeekStart', 'MISSING_OR_INVALID'),
    diagnostics: profile.unparsed.filter(p => p.source.startsWith('usuarios.ciclo_actual.')),
  }) : propagate(user as Exclude<typeof user, { status: 'known' }>, 'currentPosition');
  return { version: 1 as const, identity: user.status === 'known' ? known('usuarios.codigo', userCodigo) : propagate(user, 'usuarios.codigo'),
    referenceDate, disciplines, goal, targetEvent,
    availability: { source: 'habitual_persisted_availability' as const, disciplineDiscovery: disciplines.status,
      byDiscipline: availability }, restrictions, experience, trainingHistory, currentPosition };
}

export type CoreAthleteContext = Awaited<ReturnType<typeof loadCoreAthleteContext>>;
