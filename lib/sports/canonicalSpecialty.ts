import type { SupabaseClient } from '@supabase/supabase-js';

/** Persistence compatibility only. Never use category as a planning resolver input.
 * Carrera's existing questionnaire maps every selection to this same specialty.
 * Broad categories such as funcional/fuerza/hibrido do not identify a specialty. */
export function specialtyFromCategory(category: unknown): string | null {
  return category === 'carrera' ? 'carrera' : null;
}
export function hasCanonicalSpecialty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
export function requiresPlanningSpecialty(mode: unknown): boolean {
  return mode === 'planificacion' || mode === 'coach' || mode === 'focus';
}

type Profile = { categoria?: unknown; especialidad?: unknown };
type Result = { ok: true } | { ok: false; code: string };
/** Called only by authorized mutations, never by read-only completeness queries.
 * Compare-and-set prevents a concurrent explicit specialty change being overwritten. */
export async function ensurePlanningSpecialty(db: SupabaseClient, codigo: string, mode: unknown): Promise<Result> {
  if (!requiresPlanningSpecialty(mode)) return { ok: true };
  try {
    const current = await db.from('usuarios').select('categoria,especialidad').eq('codigo', codigo).maybeSingle();
    if (current.error || !current.data) return { ok: false, code: 'SPECIALTY_READ_FAILED' };
    const profile: Profile = current.data;
    if (hasCanonicalSpecialty(profile.especialidad)) return { ok: true };
    const specialty = specialtyFromCategory(profile.categoria);
    if (!specialty) return { ok: false, code: 'CANONICAL_SPECIALTY_REQUIRED' };
    let update = db.from('usuarios').update({ especialidad: specialty }).eq('codigo', codigo);
    update = profile.especialidad == null ? update.is('especialidad', null) : update.eq('especialidad', profile.especialidad);
    const saved = await update.select('especialidad').maybeSingle();
    if (saved.error || !hasCanonicalSpecialty(saved.data?.especialidad)) return { ok: false, code: 'SPECIALTY_REPAIR_FAILED' };
    return { ok: true };
  } catch {
    return { ok: false, code: 'SPECIALTY_REPAIR_FAILED' };
  }
}
