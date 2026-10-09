// FORGE BUILD 8C-A (correccion) — editor canonico de restricciones/lesiones del atleta.
// NO crea un almacen nuevo: escribe exactamente donde ya lee `getCanonicalRestrictions`
// (athlete_state_events + athlete_coaching_notes) con el mismo contrato (constraint_level, prohibits_*, estados).
// El Coach/LLM no es autoridad: solo el cliente autenticado llega aqui, tras validacion.
// Guardar restricciones NO regenera semanas: `assertFreshSessionRestrictions` ya compara contra el estado vigente.

import { RESTRICTION_AREAS, RESTRICTION_AREA_PROHIBITIONS } from './restrictionAreas';
import { madridRestrictionDate } from './getCanonicalRestrictions';
import type { CanonicalRestrictions } from './getCanonicalRestrictions';

export const MAX_RESTRICTIONS = 10;
export const RESTRICTION_SOURCE = 'canonical_profile_editor';
export type RestrictionNew = { area: string; description: string; movement: string | null; validUntil: string | null };
export type RestrictionInput = { id: string } | RestrictionNew;
export const isRestrictionKeep = (r: RestrictionInput): r is { id: string } => 'id' in r;
type Err = { field: string; code: string };

const civilDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/** Forma del payload (sin DB). `[]` es valido: "sin restricciones" es informacion real. */
export function validateRestrictionsInput(raw: unknown): { ok: true; value: RestrictionInput[] } | { ok: false } {
  if (!Array.isArray(raw) || raw.length > MAX_RESTRICTIONS) return { ok: false };
  const out: RestrictionInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false };
    const keys = Object.keys(item);
    if (keys.length === 1 && keys[0] === 'id') {
      const id = (item as any).id;
      if (typeof id !== 'string' || !id.trim() || id.length > 64) return { ok: false };
      out.push({ id: id.trim() });
      continue;
    }
    if (!keys.every(k => ['area', 'description', 'movement', 'validUntil'].includes(k))) return { ok: false };
    const { area, description, movement, validUntil } = item as Record<string, unknown>;
    if (typeof area !== 'string' || !RESTRICTION_AREAS.includes(area.trim().toLowerCase())) return { ok: false };
    const desc = typeof description === 'string' ? description.trim() : '';
    if (desc.length < 3 || desc.length > 300 || CONTROL.test(desc)) return { ok: false };
    let mov: string | null = null;
    if (movement !== undefined && movement !== null) {
      mov = typeof movement === 'string' ? movement.trim() : '';
      if (mov.length < 2 || mov.length > 80 || CONTROL.test(mov)) return { ok: false };
    }
    if (validUntil !== undefined && validUntil !== null && !civilDate(validUntil)) return { ok: false };
    out.push({ area: area.trim().toLowerCase(), description: desc, movement: mov, validUntil: (validUntil as string | undefined) ?? null });
  }
  return { ok: true, value: out };
}

export type RestrictionPlan = {
  insertNotes: Record<string, unknown>[];
  resolveIds: string[];
  keptIds: string[];
  state: { action: 'none' } | { action: 'close' } | { action: 'open'; bodyArea: string; reason: string };
  changed: boolean;
};

/** Plan puro: compara el conjunto pedido con el vigente. Reemplazo completo del conjunto activo; `[]` lo cierra. */
export function planRestrictionChange(current: CanonicalRestrictions, input: readonly RestrictionInput[], codigo: string, now: Date):
  { ok: true; plan: RestrictionPlan } | { ok: false; errors: Err[] } {
  const today = madridRestrictionDate(now);
  const known = new Map([...current.restrictions, ...current.reassessments].map(n => [n.id, n]));
  const errors: Err[] = [];
  const kept = new Set<string>(), inserts: Record<string, unknown>[] = [];
  const signature = (movement: string, issue: string) => `${movement.toLowerCase()}\u0000${issue.toLowerCase()}`;
  const existing = new Map([...known.values()].map(n => [signature(n.movement, n.issue), n.id]));
  let firstNew: RestrictionNew | null = null;
  for (const item of input) {
    if (isRestrictionKeep(item)) {
      if (!known.has(item.id)) errors.push({ field: 'restrictions', code: 'RESTRICTION_ID_UNKNOWN' }); else kept.add(item.id);
      continue;
    }
    if (item.validUntil !== null && item.validUntil < today) { errors.push({ field: 'restrictions', code: 'RESTRICTION_VALID_UNTIL_PAST' }); continue; }
    const movement = item.movement ?? item.area;
    const same = existing.get(signature(movement, item.description));
    if (same) { kept.add(same); continue; }          // misma restriccion: idempotente, sin duplicar fila
    const flags = RESTRICTION_AREA_PROHIBITIONS[item.area] ?? {};
    firstNew ??= item;
    existing.set(signature(movement, item.description), 'pending-insert');
    inserts.push({ user_codigo: codigo, type: 'weakness', domain: null, movement, issue: item.description, priority: 'alta',
      source: RESTRICTION_SOURCE, status: 'pending', confidence: 1, constraint_level: 'hard', valid_until: item.validUntil,
      prohibits_impact: flags.impact === true, prohibits_jump: flags.jump === true, prohibits_axial_load: flags.axial_load === true,
      prohibits_deep_flexion: flags.deep_flexion === true, prohibits_overhead_load: flags.overhead_load === true });
  }
  if (errors.length) return { ok: false, errors };
  const resolveIds = [...known.keys()].filter(id => !kept.has(id)).sort();
  const keptHard = current.restrictions.some(n => kept.has(n.id));
  const keptReassess = current.reassessments.some(n => kept.has(n.id));
  const hardAfter = keptHard || inserts.length > 0;
  let state: RestrictionPlan['state'] = { action: 'none' };
  if (hardAfter && current.state?.estado !== 'restricted') {
    state = { action: 'open', bodyArea: firstNew?.area ?? '', reason: firstNew?.description ?? 'restriccion declarada por el atleta' };
  } else if (!hardAfter && !keptReassess && current.state && current.state.estado !== 'normal') state = { action: 'close' };
  return { ok: true, plan: { insertNotes: inserts, resolveIds, keptIds: [...kept].sort(), state, changed: inserts.length > 0 || resolveIds.length > 0 || state.action !== 'none' } };
}

/** Aplica el plan. Orden fail-closed: primero lo que PROTEGE (notas nuevas), al final lo que libera (resolver). */
export async function applyRestrictionPlan(db: any, codigo: string, plan: RestrictionPlan, now: Date): Promise<{ ok: true } | { ok: false; code: string }> {
  const today = madridRestrictionDate(now);
  try {
    if (plan.insertNotes.length) {
      const r = await db.from('athlete_coaching_notes').insert(plan.insertNotes);
      if (r?.error) return { ok: false, code: 'RESTRICTION_NOTES_WRITE_FAILED' };
    }
    if (plan.state.action !== 'none') {
      const close = await db.from('athlete_state_events').update({ activo: false, fecha_fin: today }).eq('user_codigo', codigo).eq('activo', true).select('id');
      if (close?.error) return { ok: false, code: 'RESTRICTION_STATE_WRITE_FAILED' };
    }
    if (plan.state.action === 'open') {
      const r = await db.from('athlete_state_events').insert({ user_codigo: codigo, estado: 'restricted', motivo: 'restriccion declarada por el atleta',
        body_area: plan.state.bodyArea || null, reason_description: plan.state.reason, fecha_inicio: today, activo: true });
      if (r?.error) return { ok: false, code: 'RESTRICTION_STATE_WRITE_FAILED' };
    }
    if (plan.resolveIds.length) {
      // `resuelta` es el estado historico existente (athleteStateTransition): nunca se borran notas.
      const r = await db.from('athlete_coaching_notes').update({ status: 'resuelta', updated_at: now.toISOString() })
        .eq('user_codigo', codigo).in('id', plan.resolveIds);
      if (r?.error) return { ok: false, code: 'RESTRICTION_NOTES_RESOLVE_FAILED' };
    }
    return { ok: true };
  } catch { return { ok: false, code: 'RESTRICTION_WRITE_UNAVAILABLE' }; }
}

/** Proyeccion de lectura para el perfil (sin inferir anatomia: `area` solo si `movement` es literalmente una zona). */
export function projectRestrictions(current: CanonicalRestrictions) {
  const flags = (n: any) => (['impact', 'jump', 'axial_load', 'deep_flexion', 'overhead_load'] as const).filter(f => n[`prohibits_${f}`] === true);
  const item = (n: any) => ({ id: n.id, area: RESTRICTION_AREAS.includes(String(n.movement).toLowerCase()) ? String(n.movement).toLowerCase() : null,
    movement: n.movement || null, description: n.issue || null, level: n.constraint_level, validUntil: n.valid_until ?? null,
    source: n.source ?? null, prohibits: flags(n) });
  return [...current.restrictions, ...current.reassessments].map(item);
}
