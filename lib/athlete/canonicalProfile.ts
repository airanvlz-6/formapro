// FORGE BUILD 8C-A — perfil canonico del atleta (modelo PURO: sin DB, sin red, sin React).
//
// ACCOUNT IDENTITY != ATHLETE PROFILE != DAILY PHYSIOLOGY.
//
// Clasificacion de datos:
//   PLAN_STRUCTURE           editable aqui: categoria, especialidad, objetivo, edad, nivel, disponibilidad
//                            semanal, duracion de sesion y fuentes de entrenamiento (las que Focus exige).
//                            Se LEEN pero no se escriben aqui: evento objetivo (lo escribe `target_event`,
//                            sobre firmado). Restricciones/lesiones y equipamiento TAMBIEN son PLAN_STRUCTURE, sobre el
//                            almacen canonico YA existente (sin duplicarlo): restricciones en athlete_state_events +
//                            athlete_coaching_notes (`restrictionEditor.ts`), equipamiento en
//                            perfil.prescription_signals["equipment.<id>"]. Ambos son OPCIONALES: no forman parte de
//                            `planningProfileStatus` (PLAN_STRUCTURE != REQUIRED) y `[]` es un valor valido.
//   PRESCRIPTION_PARAMETERS  solo lectura y PRESERVADOS: marcas/RM, FCmax, FC reposo de referencia, umbral FC,
//                            ritmo umbral. Su edicion es 8C-E. Guardar PLAN_STRUCTURE no los toca.
//   CONTEXT_ONLY             nombre, altura, peso, avatar (lectura).
//   DAILY_PHYSIOLOGY         FUERA del perfil estable: HRV/RHR diario/sueno/readiness nunca se leen ni se
//                            escriben aqui y no mutan referencias estables.
//
// El Coach/LLM NO es autoridad de ningun campo de este modulo: solo cliente autenticado -> validadores.

import { FREE_MODE, resolvePlanningProfileStatus } from './planningProfileStatus';
import type { PlanningProfileStatus, OnboardingSnapshot } from './planningProfileStatus';
import { hasCanonicalSpecialty, requiresPlanningSpecialty, specialtyFromCategory } from '../sports/canonicalSpecialty';
import { normalizeAvailabilityForStorage, normalizeAvailabilityDays } from '../sports/trainingAvailability';
import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { readTargetEvent } from './eventAuthority';
import { isActivatableMode } from './modeChange';
import type { ActivatableMode } from './modeChange';
import { validateRestrictionsInput, projectRestrictions } from './restrictionEditor';
import type { RestrictionInput } from './restrictionEditor';
import type { CanonicalRestrictions } from './getCanonicalRestrictions';
import { equipmentIds } from '../sports/equipmentCatalog';

type Row = Record<string, any>;
const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o: Row, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------------------------
// Catalogos (adaptador de dominio). Mismo vocabulario que el onboarding web (FormaPro.tsx) y el bootstrap.
// Anadir una especialidad = anadir una entrada aqui; los motores compartidos no cambian.
// ---------------------------------------------------------------------------------------------
export const PROFILE_CATEGORIES = ['funcional', 'carrera', 'fuerza', 'hibrido'] as const;
export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];
export const SPECIALTY_CATALOG: Readonly<Record<ProfileCategory, readonly string[]>> = {
  carrera: ['carrera'],
  funcional: ['funcional_fitness', 'funcional_crossfit', 'funcional_calistenia'],
  hibrido: ['hibrido_general', 'hibrido_hyrox', 'hibrido_triatlon', 'hibrido_ocr'],
  fuerza: ['fuerza_powerlifting', 'fuerza_halterofilia', 'fuerza_strongman'],
};
export const AGE_BANDS = ['Menos de 20', '20-30', '31-40', '41-50', 'Mas de 50'] as const;
export const LEVELS = ['Principiante', 'Intermedio', 'Avanzado'] as const;
export const SESSION_DURATIONS = ['Hasta 30 min', 'Hasta 45 min', 'Hasta 1 hora', 'Hasta 1h 30min', 'Más de 1h 30min'] as const;
export const OBJECTIVE_MAX_LENGTH = 500; // mismo limite que el bootstrap historico
export const TRAINING_SOURCE_OWNERS = ['forge', 'external'] as const;
const MAX_TRAINING_SOURCES = 6;

/** Campos de perfil editables. Cualquier otra clave se rechaza (nunca se ignora en silencio). */
export const EDITABLE_PROFILE_FIELDS = ['category', 'specialty', 'objective', 'age', 'level', 'sessionDuration', 'weeklyAvailability', 'trainingSources', 'restrictions', 'equipment'] as const;
export const EQUIPMENT_STATES = ['available', 'unavailable'] as const;
export type EquipmentDeclaration = { id: string; state: (typeof EQUIPMENT_STATES)[number] };
export const MAX_EQUIPMENT = 30;
export const REQUEST_KEYS = ['profile', 'activate'] as const;

export type ProfileError = { field: string; code: string };
export type TrainingSourceInput = { owner: 'forge' | 'external'; discipline: string; days: string[] | null };
export type ValidProfileInput = {
  category?: ProfileCategory; specialty?: string; objective?: string; age?: string; level?: string; sessionDuration?: string;
  weeklyAvailability?: { days: string[] }; trainingSources?: TrainingSourceInput[];
  restrictions?: RestrictionInput[]; equipment?: EquipmentDeclaration[];
};
export type ValidRequest = { profile: ValidProfileInput; activate: ActivatableMode | null };

const normalizeDiscipline = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Valida TODO el payload antes de que nadie escriba nada. Sin efectos. */
export function validateProfileRequest(body: unknown): { ok: true; value: ValidRequest } | { ok: false; errors: ProfileError[] } {
  const errors: ProfileError[] = [];
  if (!isRecord(body)) return { ok: false, errors: [{ field: 'body', code: 'PROFILE_PAYLOAD_INVALID' }] };
  for (const key of Object.keys(body)) if (!(REQUEST_KEYS as readonly string[]).includes(key)) errors.push({ field: key, code: 'PROFILE_FIELD_NOT_ALLOWED' });
  const rawProfile = body.profile, rawActivate = body.activate;
  if (rawProfile === undefined && rawActivate === undefined) errors.push({ field: 'body', code: 'PROFILE_PAYLOAD_EMPTY' });
  if (rawProfile !== undefined && !isRecord(rawProfile)) errors.push({ field: 'profile', code: 'PROFILE_PAYLOAD_INVALID' });

  const profile: ValidProfileInput = {};
  if (isRecord(rawProfile)) {
    for (const key of Object.keys(rawProfile)) {
      if (!(EDITABLE_PROFILE_FIELDS as readonly string[]).includes(key)) { errors.push({ field: key, code: 'PROFILE_FIELD_NOT_ALLOWED' }); continue; }
      // `null` no borra: un campo ausente significa "sin cambios"; el borrado de planificacion no existe en 8C-A.
      if (rawProfile[key] === null) errors.push({ field: key, code: 'PROFILE_FIELD_NULL_NOT_ALLOWED' });
    }
    const p = rawProfile;
    if (p.category !== undefined && p.category !== null) {
      if (typeof p.category === 'string' && (PROFILE_CATEGORIES as readonly string[]).includes(p.category)) profile.category = p.category as ProfileCategory;
      else errors.push({ field: 'category', code: 'CATEGORY_INVALID' });
    }
    if (p.specialty !== undefined && p.specialty !== null) {
      if (typeof p.specialty === 'string' && Object.values(SPECIALTY_CATALOG).some(list => list.includes(p.specialty))) profile.specialty = p.specialty;
      else errors.push({ field: 'specialty', code: 'SPECIALTY_INVALID' });
    }
    if (p.objective !== undefined && p.objective !== null) {
      const text = typeof p.objective === 'string' ? p.objective.trim() : '';
      if (text.length >= 3 && text.length <= OBJECTIVE_MAX_LENGTH && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) profile.objective = text;
      else errors.push({ field: 'objective', code: 'OBJECTIVE_INVALID' });
    }
    if (p.age !== undefined && p.age !== null) {
      if (typeof p.age === 'string' && (AGE_BANDS as readonly string[]).includes(p.age)) profile.age = p.age;
      else errors.push({ field: 'age', code: 'AGE_INVALID' });
    }
    if (p.level !== undefined && p.level !== null) {
      if (typeof p.level === 'string' && (LEVELS as readonly string[]).includes(p.level)) profile.level = p.level;
      else errors.push({ field: 'level', code: 'LEVEL_INVALID' });
    }
    if (p.sessionDuration !== undefined && p.sessionDuration !== null) {
      if (typeof p.sessionDuration === 'string' && (SESSION_DURATIONS as readonly string[]).includes(p.sessionDuration)) profile.sessionDuration = p.sessionDuration;
      else errors.push({ field: 'sessionDuration', code: 'SESSION_DURATION_INVALID' });
    }
    if (p.weeklyAvailability !== undefined && p.weeklyAvailability !== null) {
      const days = isRecord(p.weeklyAvailability) && Array.isArray(p.weeklyAvailability.days) ? normalizeAvailabilityDays(p.weeklyAvailability.days) : null;
      if (days && days.length > 0 && Object.keys(p.weeklyAvailability).every(k => k === 'days')) profile.weeklyAvailability = { days };
      else errors.push({ field: 'weeklyAvailability', code: 'AVAILABILITY_INVALID' });
    }
    if (p.trainingSources !== undefined && p.trainingSources !== null) {
      const list = Array.isArray(p.trainingSources) ? p.trainingSources : null;
      const sources: TrainingSourceInput[] = [], seen = new Set<string>();
      let bad = !list || list.length === 0 || list.length > MAX_TRAINING_SOURCES;
      for (const item of list ?? []) {
        const okShape = isRecord(item) && Object.keys(item).every(k => ['owner', 'discipline', 'days'].includes(k));
        const owner = okShape ? item.owner : null, rawDiscipline = okShape ? item.discipline : null;
        const discipline = typeof rawDiscipline === 'string' ? normalizeDiscipline(rawDiscipline) : '';
        const days = okShape && item.days !== undefined && item.days !== null ? normalizeAvailabilityDays(item.days) : null;
        if (!okShape || !(TRAINING_SOURCE_OWNERS as readonly string[]).includes(owner) || !/^[a-z0-9][a-z0-9 _()/-]{1,39}$/.test(discipline)
          || seen.has(discipline) || (item.days !== undefined && item.days !== null && (days === null || days.length === 0))) { bad = true; continue; }
        seen.add(discipline);
        sources.push({ owner, discipline, days });
      }
      if (bad) errors.push({ field: 'trainingSources', code: 'TRAINING_SOURCES_INVALID' });
      else profile.trainingSources = sources;
    }
    if (p.restrictions !== undefined && p.restrictions !== null) {
      const parsed = validateRestrictionsInput(p.restrictions);
      if (parsed.ok) profile.restrictions = parsed.value; else errors.push({ field: 'restrictions', code: 'RESTRICTIONS_INVALID' });
    }
    if (p.equipment !== undefined && p.equipment !== null) {
      // Lista de declaraciones EXPLICITAS {id,state}. `[]` = "sin declaraciones explicitas" (vuelve a desconocido): nunca "sin equipo".
      const list = Array.isArray(p.equipment) && p.equipment.length <= MAX_EQUIPMENT ? p.equipment : null;
      const seen = new Set<string>(), declarations: EquipmentDeclaration[] = [];
      let bad = !list;
      for (const item of list ?? []) {
        const okShape = isRecord(item) && Object.keys(item).length === 2 && has(item, 'id') && has(item, 'state');
        if (!okShape || typeof item.id !== 'string' || !equipmentIds.includes(item.id) || seen.has(item.id)
          || !(EQUIPMENT_STATES as readonly string[]).includes(item.state)) { bad = true; continue; }
        seen.add(item.id);
        declarations.push({ id: item.id, state: item.state });
      }
      if (bad) errors.push({ field: 'equipment', code: 'EQUIPMENT_INVALID' }); else profile.equipment = declarations;
    }
  }
  let activate: ActivatableMode | null = null;
  if (rawActivate !== undefined) {
    if (isRecord(rawActivate) && Object.keys(rawActivate).every(k => k === 'mode') && isActivatableMode(rawActivate.mode)) activate = rawActivate.mode;
    else errors.push({ field: 'activate', code: 'ACTIVATION_MODE_INVALID' });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { profile, activate } };
}

// ---------------------------------------------------------------------------------------------
// Lectura de campos canonicos desde una fila `usuarios`.
// ---------------------------------------------------------------------------------------------
export function parseStoredAvailability(raw: unknown): Row | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isRecord(value) ? value : null;
  } catch { return null; }
}
/** Dias habituales: union de todas las categorias de dias almacenadas (el almacen guarda por disciplina o generico). */
export function weeklyDaysFromStored(raw: unknown): string[] | null {
  const stored = parseStoredAvailability(raw);
  if (!stored) return null;
  const metadata = new Set(['observaciones', 'descripcion', 'duracion_sesion', 'cambio_permanente', 'razon']);
  const days = new Set<string>();
  for (const [key, value] of Object.entries(stored)) {
    if (metadata.has(key)) continue;
    const parsed = normalizeAvailabilityDays(value);
    if (parsed === null) return null;
    parsed.forEach(d => days.add(d));
  }
  return days.size ? [...days] : null;
}
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Objetivo tal como lo resuelve el planner (objetivo_principal -> perfil.objetivo_general/principal) + legacy detalle. */
export function readObjective(row: Row): { text: string | null; source: string | null } {
  const perfil = isRecord(row.perfil) ? row.perfil : {};
  const candidates: [string, unknown][] = [
    ['objetivo_principal', isRecord(row.objetivo_principal) ? row.objetivo_principal.descripcion : row.objetivo_principal],
    ['perfil.objetivo_general', isRecord(perfil.objetivo_general) ? perfil.objetivo_general.descripcion : perfil.objetivo_general],
    ['perfil.objetivo_principal', isRecord(perfil.objetivo_principal) ? perfil.objetivo_principal.descripcion : perfil.objetivo_principal],
    ['perfil.objetivo_detalle', perfil.objetivo_detalle],
  ];
  for (const [source, value] of candidates) { const t = text(value); if (t) return { text: t, source }; }
  return { text: null, source: null };
}
export function readLevel(perfil: Row): string | null {
  for (const key of ['nivel', 'nivel_cf', 'nivel_hyrox', 'nivel_ocr', 'nivel_carrera', 'experiencia_fuerza']) { const t = text(perfil[key]); if (t) return t; }
  return null;
}
function specialtyStatus(category: unknown, specialty: unknown): 'catalog' | 'legacy_generic' | 'unknown' | null {
  if (!hasCanonicalSpecialty(specialty)) return null;
  if (Object.values(SPECIALTY_CATALOG).some(list => list.includes(specialty))) return 'catalog';
  // Build 7/8A persistieron especialidad = categoria (valor generico, sin familia de estrategia propia).
  if (specialty === category && (PROFILE_CATEGORIES as readonly string[]).includes(specialty)) return 'legacy_generic';
  return 'unknown';
}

// ---------------------------------------------------------------------------------------------
// Estado RESULTANTE de aplicar un payload validado. Puro: no escribe nada.
// ---------------------------------------------------------------------------------------------
export type ProfileRow = {
  modo_entrada?: unknown; categoria?: unknown; especialidad?: unknown; perfil?: unknown;
  objetivo_principal?: unknown; distribucion_semanal?: unknown;
};
export type SourceRow = { owner?: unknown; disciplina?: unknown; dias?: unknown; activo?: unknown };
type ResultingColumns = { categoria: unknown; especialidad: unknown; perfil: Row; objetivo_principal: unknown; distribucion_semanal: unknown };

export type BuildResult =
  | { ok: true; resulting: ResultingColumns; patch: Partial<ResultingColumns>; sources: SourceRow[]; sourceUpserts: Row[] }
  | { ok: false; errors: ProfileError[] };

/**
 * Aplica `profile` validado sobre la fila actual. Preserva TODO lo no incluido (marcas, FC, eventos,
 * restricciones, declaraciones, datos legacy). `now` se inyecta (determinista en tests).
 * `codigo` solo se usa para etiquetar las filas de fuentes que el servicio va a upsertar.
 */
export function buildResultingProfile(current: ProfileRow, currentSources: readonly SourceRow[], input: ValidProfileInput,
  options: { now: string; codigo: string; activate: ActivatableMode | null }): BuildResult {
  const errors: ProfileError[] = [];
  const before = { categoria: current.categoria ?? null, especialidad: current.especialidad ?? null,
    perfil: current.perfil ?? null, objetivo_principal: current.objetivo_principal ?? null, distribucion_semanal: current.distribucion_semanal ?? null };
  if (before.perfil !== null && !isRecord(before.perfil)) return { ok: false, errors: [{ field: 'perfil', code: 'PROFILE_STORED_INVALID' }] };
  const perfil: Row = clone(isRecord(before.perfil) ? before.perfil : {});
  let categoria: unknown = before.categoria, especialidad: unknown = before.especialidad;
  let objetivo = before.objetivo_principal, distribucion = before.distribucion_semanal;

  // --- categoria / especialidad: la especialidad SIEMPRE debe pertenecer a la categoria resultante.
  const categoryChanged = input.category !== undefined && input.category !== categoria;
  if (input.category !== undefined) categoria = input.category;
  if (input.specialty !== undefined) {
    const list = (PROFILE_CATEGORIES as readonly string[]).includes(String(categoria)) ? SPECIALTY_CATALOG[categoria as ProfileCategory] : null;
    if (!list || !list.includes(input.specialty)) errors.push({ field: 'specialty', code: 'SPECIALTY_CATEGORY_MISMATCH' });
    else especialidad = input.specialty;
  } else if (categoryChanged && hasCanonicalSpecialty(especialidad)) {
    const list = SPECIALTY_CATALOG[categoria as ProfileCategory];
    // Una especialidad de otra categoria no sobrevive al cambio de categoria en silencio.
    if (!list.includes(especialidad as string)) errors.push({ field: 'specialty', code: 'SPECIALTY_CATEGORY_MISMATCH' });
  }
  // Reparacion determinista ya existente (ensurePlanningSpecialty): solo Carrera deriva especialidad de la
  // categoria. Solo al activar un modo que la exige; nunca se inventa en un guardado normal.
  if (options.activate && requiresPlanningSpecialty(options.activate) && !hasCanonicalSpecialty(especialidad)) {
    const derived = specialtyFromCategory(categoria);
    if (derived) especialidad = derived;
  }

  // --- objetivo: UNA fuente canonica (objetivo_principal.descripcion, la que escribe saveGoalAnswer y lee el
  // planner). Se retiran los duplicados perfil.objetivo_general/objetivo_principal para no crear conflicto de
  // evidencia. perfil.objetivo_detalle (detalle libre, legacy) NO se toca ni se escribe: no es autoridad.
  if (input.objective !== undefined) {
    const prev = isRecord(objetivo) ? objetivo : null;
    const duplicates = ['objetivo_general', 'objetivo_principal'].filter(k => has(perfil, k));
    const unchanged = prev?.descripcion === input.objective && duplicates.length === 0;
    if (!unchanged) {
      const previousProfileDeclarations: Row = {};
      for (const k of duplicates) { previousProfileDeclarations[k] = perfil[k]; delete perfil[k]; }
      const { resolution: _drop, ...previousPrimary } = prev ?? {} as Row;
      const sameText = prev?.descripcion === input.objective;
      objetivo = { ...(sameText ? previousPrimary : {}), descripcion: input.objective, updated_at: options.now,
        fecha_inicio: sameText && typeof prev?.fecha_inicio === 'string' ? prev.fecha_inicio : options.now.slice(0, 10),
        resolution: { version: 1, source: 'canonical_profile_editor', previousPrimary: prev ? previousPrimary : null, previousProfileDeclarations } };
    }
  }
  // --- campos de perfil (mismas claves que lee el planner / el onboarding web)
  if (input.age !== undefined) perfil.edad = input.age;
  if (input.level !== undefined) perfil.nivel = input.level;
  if (input.sessionDuration !== undefined) perfil.duracion = input.sessionDuration;
  // --- equipamiento: declaraciones explicitas en perfil.prescription_signals["equipment.<id>"] (almacen canonico existente).
  // Reemplaza SOLO las declaraciones explicitas available/unavailable; nunca toca otras senales (skill.*, capability.*) ni
  // infiere material desde la especialidad o el entorno. Ausente = desconocido (nunca concede).
  const sameEquipment = input.equipment !== undefined && JSON.stringify(readEquipment(perfil).map(e => [e.id, e.state]))
    === JSON.stringify([...input.equipment].sort((x, y) => x.id < y.id ? -1 : 1).map(e => [e.id, e.state]));
  if (input.equipment !== undefined && !sameEquipment) {
    const stored = isRecord(perfil.prescription_signals) ? { ...perfil.prescription_signals } : {};
    const previous = { ...stored };
    for (const id of equipmentIds) {
      const entry = previous[`equipment.${id}`];
      if (isRecord(entry) && (EQUIPMENT_STATES as readonly string[]).includes(entry.state)) delete stored[`equipment.${id}`];
    }
    for (const d of input.equipment) {
      const before = previous[`equipment.${d.id}`];
      stored[`equipment.${d.id}`] = isRecord(before) && before.state === d.state && typeof before.updatedAt === 'string' ? before : { state: d.state, updatedAt: options.now };
    }
    if (Object.keys(stored).length) perfil.prescription_signals = stored; else delete perfil.prescription_signals;
  }
  // --- disponibilidad habitual. Misma forma que guardar_campo_mode_change (`{ disponibilidad: [...] }`, serializado) cuando
  // no hay calendario previo; si ya existe UNA categoria de dias (p. ej. `carrera`), se reescribe ESA categoria para no
  // destruir la forma por disciplina que lee el planner; con varias categorias no se adivina cual editar (8C-C).
  if (input.weeklyAvailability !== undefined) {
    const stored = parseStoredAvailability(distribucion);
    const metadata = new Set(['observaciones', 'descripcion', 'duracion_sesion', 'cambio_permanente', 'razon']);
    const dayKeys = stored ? Object.keys(stored).filter(k => !metadata.has(k) && normalizeAvailabilityDays(stored[k]) !== null) : [];
    if (dayKeys.length > 1) errors.push({ field: 'weeklyAvailability', code: 'AVAILABILITY_MULTI_CATEGORY_UNSUPPORTED' });
    else {
      const target = dayKeys[0] ?? 'disponibilidad';
      const normalized = normalizeAvailabilityForStorage({ ...(stored ?? {}), [target]: input.weeklyAvailability.days });
      if (!normalized) errors.push({ field: 'weeklyAvailability', code: 'AVAILABILITY_INVALID' });
      else distribucion = JSON.stringify(normalized);
    }
  }
  if (errors.length) return { ok: false, errors };

  // --- fuentes de entrenamiento: se fusionan con las activas por disciplina (nunca se desactivan otras).
  const key = (s: SourceRow) => normalizeDiscipline(String(s.disciplina ?? ''));
  const merged = new Map<string, SourceRow>();
  for (const s of currentSources) if (s && s.activo !== false) merged.set(key(s), { owner: s.owner, disciplina: s.disciplina, dias: s.dias, activo: true });
  const sourceUpserts: Row[] = [];
  for (const s of input.trainingSources ?? []) {
    const row = { user_codigo: options.codigo, disciplina: s.discipline, owner: s.owner, dias: s.days, activo: true };
    merged.set(s.discipline, { owner: s.owner, disciplina: s.discipline, dias: s.days, activo: true });
    sourceUpserts.push(row);
  }

  const after = { categoria, especialidad, perfil, objetivo_principal: objetivo, distribucion_semanal: distribucion };
  const patch: Partial<ResultingColumns> = {};
  for (const column of ['categoria', 'especialidad', 'perfil', 'objetivo_principal', 'distribucion_semanal'] as const) {
    if (JSON.stringify(before[column]) !== JSON.stringify(after[column])) (patch as Row)[column] = after[column];
  }
  return { ok: true, resulting: after, patch, sources: [...merged.values()], sourceUpserts };
}

/** Estado de planificacion del snapshot resultante para `mode` (misma funcion que 8A: una sola definicion de "ready"). */
export function statusForSnapshot(resulting: Pick<ResultingColumns, 'categoria' | 'especialidad' | 'perfil' | 'objetivo_principal' | 'distribucion_semanal'>,
  sources: readonly SourceRow[], mode: string | null): PlanningProfileStatus {
  return resolvePlanningProfileStatus({ modo_entrada: mode, categoria: resulting.categoria, especialidad: resulting.especialidad,
    perfil: resulting.perfil, objetivo_principal: resulting.objetivo_principal, distribucion_semanal: resulting.distribucion_semanal,
    trainingSources: sources } as OnboardingSnapshot);
}

// ---------------------------------------------------------------------------------------------
// READ MODEL: lista blanca explicita. Nada de select("*"); nunca admin/premium/auth_user_id/id/stripe/tokens/
// historial/notas internas/legacyCodigo.
// ---------------------------------------------------------------------------------------------
export const PROFILE_READ_COLUMNS = ['id', 'modo_entrada', 'categoria', 'especialidad', 'perfil', 'objetivo_principal', 'distribucion_semanal',
  'test_atleta', 'marcas_especificas', 'datos_entrenamiento', 'historial_marcas', 'nombre_mostrar', 'altura_cm', 'peso_kg', 'avatar_url'].join(',');
export const PROFILE_SOURCE_COLUMNS = 'owner,disciplina,dias,activo';

const metric = (running: Row, name: string) => {
  const r = running?.byMetric?.[name];
  const e = r?.resolved;
  return { value: e ? (e.value.value ?? null) : null, unit: e?.value.unit ?? null, source: e?.source ?? null, updatedAt: e?.updatedAt ?? null,
    status: r?.reason ?? 'unknown' };
};

/** Declaraciones explicitas de equipamiento (available/unavailable) del almacen canonico. Ausente = desconocido, no se devuelve. */
export function readEquipment(perfil: Row): { id: string; state: string; updatedAt: string | null }[] {
  const stored = isRecord(perfil.prescription_signals) ? perfil.prescription_signals : {};
  return equipmentIds.flatMap(id => { const e = stored[`equipment.${id}`];
    return isRecord(e) && (EQUIPMENT_STATES as readonly string[]).includes(e.state) ? [{ id, state: e.state as string, updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : null }] : []; });
}

/** `restrictions`: lectura canonica (getCanonicalRestrictions). `null` = lectura no disponible (nunca se presenta como "sin restricciones"). */
export function projectCanonicalProfile(row: Row, sources: readonly SourceRow[], restrictions: CanonicalRestrictions | null = null) {
  const perfil = isRecord(row.perfil) ? row.perfil : {};
  const mode = typeof row.modo_entrada === 'string' && row.modo_entrada.trim() ? row.modo_entrada : null;
  const status = resolvePlanningProfileStatus({ ...row, trainingSources: sources } as OnboardingSnapshot);
  const objective = readObjective(row);
  const active = sources.filter(s => s && s.activo !== false);
  const event = (() => { const e = readTargetEvent(perfil.targetEvent, typeof row.id === 'string' ? row.id : undefined);
    return e ? { status: e.status, eventDate: e.eventDate, eventType: e.eventType, goalId: e.goalId, discipline: e.discipline,
      targetPerformance: e.targetPerformance ?? null } : null; })();
  const prescription = projectAthletePrescriptionProfile(row);
  const marks = Object.fromEntries(Object.entries(prescription.strength.byMovement as Row).map(([id, r]: [string, any]) => [id,
    { status: r.reason, valueKg: r.resolved?.value.referenceType === '1rm' ? r.resolved.value.valueKg : null,
      referenceType: r.resolved?.value.referenceType ?? null, observedAt: r.resolved?.value.dateIfKnown ?? null }]));
  const dayList = weeklyDaysFromStored(row.distribucion_semanal);
  return {
    mode,
    planningProfileStatus: status,
    planStructure: {
      category: typeof row.categoria === 'string' ? row.categoria : null,
      specialty: hasCanonicalSpecialty(row.especialidad) ? row.especialidad : null,
      specialtyStatus: specialtyStatus(row.categoria, row.especialidad),
      objective: objective.text,
      objectiveSource: objective.source,
      objectiveCanonical: objective.source === 'objetivo_principal',
      age: text(perfil.edad),
      level: readLevel(perfil),
      weeklyAvailability: dayList ? { days: dayList } : null,
      sessionDuration: text(perfil.duracion),
      trainingSources: active.map(s => ({ owner: s.owner === 'forge' || s.owner === 'external' ? s.owner : null,
        discipline: typeof s.disciplina === 'string' ? s.disciplina : null,
        days: Array.isArray(s.dias) ? s.dias.filter((d: unknown) => typeof d === 'string') : (typeof s.dias === 'string' && s.dias ? s.dias.split(',').map(d => d.trim()) : null) })),
      targetEvent: event,
      restrictions: restrictions ? projectRestrictions(restrictions) : null,
      restrictionsStatus: restrictions ? 'KNOWN' : 'UNAVAILABLE',
      equipment: readEquipment(perfil),
    },
    prescriptionParameters: {
      marks,
      hrMax: metric(prescription.running, 'maxHr'),
      restingHrReference: metric(prescription.running, 'restingHr'),
      thresholdHr: metric(prescription.running, 'thresholdHr'),
      thresholdPace: metric(prescription.running, 'thresholdPace'),
    },
    context: { displayName: text(row.nombre_mostrar), heightCm: typeof row.altura_cm === 'number' ? row.altura_cm : null,
      weightKg: typeof row.peso_kg === 'number' ? row.peso_kg : null, avatarUrl: text(row.avatar_url) },
    editableFields: [...EDITABLE_PROFILE_FIELDS],
    // Todavia sin editor en este contrato.
    unsupported: { targetEventWrite: 'USE_TARGET_EVENT_ACTION', marksWrite: 'PHASE_8C_E', hrReferencesWrite: 'PHASE_8C_E' },
  };
}
export { FREE_MODE };
