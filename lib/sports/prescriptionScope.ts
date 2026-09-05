/** Pure policy. Inputs must be persisted server reads, never model/request ownership. */
export type PrescriptionScope = {
  mode: 'supervision' | 'focus' | 'coach';
  prescriptionAllowed: boolean;
  managedDisciplines: string[];
  externalDisciplines: string[];
  focusDiscipline?: string;
};
export type TrainingSource = { disciplina: string; owner: string; activo: boolean; dias?: string[] | null };
export type ScopeResult = { ok: true; scope: PrescriptionScope } | { ok: false; errors: string[] };
export const normalizeTrainingKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
/** Exact aliases only; unknown disciplines remain unknown, never become box. */
export function canonicalDiscipline(value: string): string {
  const key = normalizeTrainingKey(value);
  const aliases: Record<string, string> = { running: 'carrera', run: 'carrera', pista: 'carrera', carrera_series: 'carrera', carrera_larga: 'carrera',
    crossfit: 'box', funcional_crossfit: 'box', strength: 'fuerza' };
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}
const unique = (values: string[]) => [...new Set(values)].sort();

/** Combine recognized persisted evidence. Unrecognized specialty text is not a veto
 * on a known category/distribution, and generic categories do not imply disciplines. */
export function resolveProfileDisciplines(profile: { especialidad?: string; categoria?: string; distribucion_semanal?: unknown }): string[] {
  let distribution: unknown = profile.distribucion_semanal;
  if (typeof distribution === 'string') { try { distribution = JSON.parse(distribution); } catch { distribution = null; } }
  const keys = distribution && typeof distribution === 'object' && !Array.isArray(distribution) ? Object.keys(distribution) : [];
  return unique([...keys, profile.especialidad, profile.categoria].filter((s): s is string => typeof s === 'string')
    .map(canonicalDiscipline).filter(d => ['box', 'carrera', 'fuerza'].includes(d)));
}

export function buildPrescriptionScope(input: { mode: unknown; sources: readonly TrainingSource[]; profileDisciplines?: readonly string[] }): ScopeResult {
  const mode = input.mode === 'planificacion' ? 'coach' : input.mode === 'consulta' ? 'supervision' : input.mode;
  if (!['supervision', 'focus', 'coach'].includes(String(mode))) return { ok: false, errors: ['SCOPE_MODE_UNRESOLVED'] };
  const active = input.sources.filter(s => s.activo === true);
  if (active.some(s => !['forge', 'external'].includes(s.owner) || typeof s.disciplina !== 'string' || !s.disciplina.trim()))
    return { ok: false, errors: ['SCOPE_SOURCE_INVALID'] };
  const owned = unique(active.filter(s => s.owner === 'forge').map(s => canonicalDiscipline(s.disciplina)));
  const external = unique(active.filter(s => s.owner === 'external').map(s => canonicalDiscipline(s.disciplina)));
  const profile = unique((input.profileDisciplines || []).map(canonicalDiscipline).filter(Boolean));
  if (mode === 'supervision') return { ok: true, scope: { mode, prescriptionAllowed: false, managedDisciplines: [], externalDisciplines: unique([...owned, ...external, ...profile]) } };
  // Ownership is evidence per discipline, not a global "profile migrated" flag.
  // Explicit external excludes THAT legacy discipline; explicit dual ownership is contradictory.
  if (owned.some(d => external.includes(d))) return { ok: false, errors: ['SCOPE_OWNERSHIP_AMBIGUOUS'] };
  const managed = mode === 'focus' ? owned : unique([...owned, ...profile.filter(d => !external.includes(d))]);
  if (!managed.length || managed.some(d => ['forge', 'externo', 'otro', 'general', 'descanso', 'hibrido', 'funcional'].includes(d)))
    return { ok: false, errors: ['SCOPE_MANAGED_DISCIPLINES_UNRESOLVED'] };
  if (managed.some(d => external.includes(d))) return { ok: false, errors: ['SCOPE_OWNERSHIP_AMBIGUOUS'] };
  if (mode === 'focus' && managed.length !== 1) return { ok: false, errors: ['SCOPE_FOCUS_REQUIRES_ONE_DISCIPLINE'] };
  return { ok: true, scope: { mode: mode as 'focus' | 'coach', prescriptionAllowed: true,
    managedDisciplines: managed, externalDisciplines: external, ...(mode === 'focus' ? { focusDiscipline: managed[0] } : {}) } };
}

export function validatePrescriptionScope(scope: PrescriptionScope): string[] {
  if (!scope || !Array.isArray(scope.managedDisciplines) || !Array.isArray(scope.externalDisciplines)) return ['SCOPE_INVALID'];
  const lists = [...scope.managedDisciplines, ...scope.externalDisciplines];
  if (lists.some(d => typeof d !== 'string' || !d || canonicalDiscipline(d) !== d)
    || new Set(lists).size !== lists.length) return ['SCOPE_DISCIPLINES_INVALID'];
  if (scope.mode === 'supervision') return !scope.prescriptionAllowed && !scope.managedDisciplines.length && !scope.focusDiscipline ? [] : ['SCOPE_SUPERVISION_INVALID'];
  if (!['focus', 'coach'].includes(scope.mode) || scope.prescriptionAllowed !== true || !scope.managedDisciplines.length) return ['SCOPE_INVALID'];
  if (scope.mode === 'focus' && (scope.managedDisciplines.length !== 1 || scope.focusDiscipline !== scope.managedDisciplines[0])) return ['SCOPE_FOCUS_INVALID'];
  if (scope.mode === 'coach' && scope.focusDiscipline !== undefined) return ['SCOPE_COACH_INVALID'];
  return [];
}
