// FORGE BUILD 8C-A — servicio del perfil canonico: lectura y guardado + activacion de modo.
// Recibe `db` y el atleta YA resuelto desde el principal verificado (nunca un codigo/email del cliente).
//
// LIMITE DE ATOMICIDAD (explicito): el RPC `change_athlete_mode` solo cambia modo/ciclo; no recibe perfil, y no se
// sustituye en esta fase. Por eso NO hay una transaccion unica perfil+modo. Garantias reales:
//   1. Todo el payload se valida ANTES de escribir: payload invalido => cero escrituras.
//   2. Las columnas de `usuarios` se escriben en UN solo UPDATE (atomico por fila) con compare-and-set sobre el
//      estado leido: una edicion concurrente => 409 PROFILE_CHANGED_RETRY y cero escrituras.
//   3. El modo solo cambia si el estado RESULTANTE esta `ready` para el modo destino y SIEMPRE despues de que el
//      perfil este persistido. Nunca existe "modo nuevo + perfil invalido". Si el RPC falla, el perfil queda
//      guardado y valido, el modo anterior intacto, y la activacion se puede reintentar (idempotente).
//   4. Las fuentes de entrenamiento viven en otra tabla: se escriben despues del UPDATE (upsert idempotente). Si
//      esa escritura falla, el perfil queda guardado, el modo no cambia y se informa PROFILE_PARTIAL_WRITE.

import { PROFILE_READ_COLUMNS, PROFILE_SOURCE_COLUMNS, buildResultingProfile, projectCanonicalProfile, statusForSnapshot,
  validateProfileRequest } from './canonicalProfile';
import type { ProfileError } from './canonicalProfile';
import { executeAthleteModeChange } from './modeChange';
import { persistTrainingSources } from '../sports/coachOwnership';
import { getCanonicalRestrictions } from './getCanonicalRestrictions';
import type { CanonicalRestrictions } from './getCanonicalRestrictions';
import { applyRestrictionPlan, planRestrictionChange } from './restrictionEditor';

export type ServiceResult = { status: number; body: Record<string, unknown> };
export type AthleteRef = { athleteId: string; legacyCodigo: string };
type Clock = { now: () => string };
const systemClock: Clock = { now: () => new Date().toISOString() };
const fail = (status: number, code: string, extra: Record<string, unknown> = {}): ServiceResult =>
  ({ status, body: { ok: false, retryable: false, code, ...extra } });
const JSON_COLUMNS = new Set(['objetivo_principal', 'perfil']);

async function readSnapshot(db: any, codigo: string): Promise<{ row: Record<string, any>; sources: Record<string, any>[] } | ServiceResult> {
  let read, sourcesRead;
  try {
    read = await db.from('usuarios').select(PROFILE_READ_COLUMNS).eq('codigo', codigo).maybeSingle();
    sourcesRead = await db.from('athlete_training_sources').select(PROFILE_SOURCE_COLUMNS).eq('user_codigo', codigo).eq('activo', true);
  } catch { return fail(503, 'PROFILE_READ_UNAVAILABLE'); }
  if (read.error || sourcesRead.error) return fail(503, 'PROFILE_READ_UNAVAILABLE');
  if (!read.data) return fail(404, 'ATHLETE_NOT_LINKED');
  return { row: read.data, sources: Array.isArray(sourcesRead.data) ? sourcesRead.data : [] };
}
/** Lectura canonica de restricciones. Un fallo NUNCA se presenta como "sin restricciones": devuelve null. */
async function readRestrictions(db: any, codigo: string, now: Date): Promise<CanonicalRestrictions | null> {
  try { return await getCanonicalRestrictions(db, codigo, now); } catch { return null; }
}
const isFailure = (v: unknown): v is ServiceResult => !!v && typeof v === 'object' && 'status' in (v as object) && 'body' in (v as object);

/** GET: perfil canonico del atleta autenticado. */
export async function getCanonicalProfile(db: any, athlete: AthleteRef): Promise<ServiceResult> {
  const snapshot = await readSnapshot(db, athlete.legacyCodigo);
  if (isFailure(snapshot)) return snapshot;
  const restrictions = await readRestrictions(db, athlete.legacyCodigo, new Date());
  return { status: 200, body: { ok: true, profile: projectCanonicalProfile(snapshot.row, snapshot.sources, restrictions) } };
}

/** PUT/PATCH: guarda PLAN_STRUCTURE validado y, si se pide, activa supervision|focus|coach reutilizando cambiar_modo_atleta. */
export async function saveCanonicalProfile(db: any, athlete: AthleteRef, body: unknown, clock: Clock = systemClock): Promise<ServiceResult> {
  const validated = validateProfileRequest(body);
  if (!validated.ok) return fail(400, 'PROFILE_INVALID', { errors: validated.errors });
  const { profile, activate } = validated.value;
  const codigo = athlete.legacyCodigo;

  const snapshot = await readSnapshot(db, codigo);
  if (isFailure(snapshot)) return snapshot;
  const { row, sources } = snapshot;
  const built = buildResultingProfile(row, sources, profile, { now: clock.now(), codigo, activate });
  if (!built.ok) return fail(400, 'PROFILE_INVALID', { errors: built.errors as ProfileError[] });

  const currentMode = typeof row.modo_entrada === 'string' && row.modo_entrada.trim() ? row.modo_entrada : null;
  // Estado resultante evaluado para el modo DESTINO (la activacion exige ready) ...
  const targetStatus = activate ? statusForSnapshot(built.resulting, built.sources, activate) : null;
  const activationReady = !!targetStatus && targetStatus.missingFields.length === 0;

  // Restricciones: se planifican ANTES de cualquier escritura (id desconocido / fecha pasada / lectura no disponible => cero escrituras).
  let restrictionPlan: ReturnType<typeof planRestrictionChange> | null = null;
  const writeNow = new Date(clock.now());
  if (profile.restrictions !== undefined) {
    const current = await readRestrictions(db, codigo, writeNow);
    if (!current) return fail(503, 'PROFILE_RESTRICTIONS_UNAVAILABLE');
    restrictionPlan = planRestrictionChange(current, profile.restrictions, codigo, writeNow);
    if (!restrictionPlan.ok) return fail(400, 'PROFILE_INVALID', { errors: restrictionPlan.errors });
  }

  // 1) UN solo UPDATE por fila con compare-and-set sobre el estado leido (zero writes si cambio).
  if (Object.keys(built.patch).length > 0) {
    let query = db.from('usuarios').update(built.patch).eq('codigo', codigo);
    for (const key of ['modo_entrada', 'categoria', 'especialidad', 'objetivo_principal', 'perfil']) {
      const value = row[key];
      query = value == null ? query.is(key, null) : query.eq(key, JSON_COLUMNS.has(key) ? JSON.stringify(value) : value);
    }
    let written;
    try { written = await query.select('codigo'); } catch { return fail(503, 'PROFILE_WRITE_UNAVAILABLE'); }
    if (written.error || !written.data?.length) return fail(409, 'PROFILE_CHANGED_RETRY');
  }
  // 2) Fuentes de entrenamiento (otra tabla): despues, idempotentes.
  if (built.sourceUpserts.length > 0) {
    let saved;
    try { saved = await persistTrainingSources(db, built.sourceUpserts); } catch { saved = { error: true }; }
    if (saved?.error) return fail(500, 'PROFILE_PARTIAL_WRITE', { profileSaved: true, trainingSourcesSaved: false, modeChanged: false });
  }

  // 2b) Restricciones (otras tablas): despues del UPDATE; orden fail-closed dentro del editor (proteger antes de liberar).
  let restrictionsChanged = false;
  if (restrictionPlan?.ok && restrictionPlan.plan.changed) {
    const applied = await applyRestrictionPlan(db, codigo, restrictionPlan.plan, writeNow);
    if (!applied.ok) return fail(500, 'PROFILE_PARTIAL_WRITE', { profileSaved: true, restrictionsSaved: false, restrictionsCode: applied.code, modeChanged: false });
    restrictionsChanged = true;
  }

  // 3) Activacion: solo con perfil persistido Y ready. Reutiliza la transicion existente (con sus propias guardas).
  let activation: Record<string, unknown> = { requested: null, status: 'NOT_REQUESTED' };
  if (activate) {
    if (!activationReady) {
      activation = { requested: activate, status: 'NOT_READY', missingFields: targetStatus!.missingFields };
    } else if (currentMode === activate) {
      activation = { requested: activate, status: 'ALREADY_ACTIVE', missingFields: [] };
    } else {
      const change = await executeAthleteModeChange(db, codigo, activate, 'canonical_profile_activation');
      if (change.status !== 200) {
        const fresh = await readSnapshot(db, codigo);
        return { status: change.status === 500 ? 502 : change.status, body: { ok: false, retryable: change.status === 500, code: 'MODE_CHANGE_FAILED',
          profileSaved: true, modeChanged: false, activation: { requested: activate, status: 'FAILED', detail: change.body?.missingFields ? { missingFields: change.body.missingFields } : change.body?.code ? { code: change.body.code } : null },
          ...(isFailure(fresh) ? {} : { profile: projectCanonicalProfile(fresh.row, fresh.sources, await readRestrictions(db, codigo, new Date())) }) } };
      }
      activation = { requested: activate, status: 'ACTIVATED', missingFields: [] };
    }
  }

  // 4) Relectura: la respuesta refleja lo PERSISTIDO, no lo propuesto.
  const fresh = await readSnapshot(db, codigo);
  if (isFailure(fresh)) return fresh;
  const freshRestrictions = await readRestrictions(db, codigo, new Date());
  return { status: 200, body: { ok: true, saved: Object.keys(built.patch).length > 0 || built.sourceUpserts.length > 0 || restrictionsChanged,
    activation, profile: projectCanonicalProfile(fresh.row, fresh.sources, freshRestrictions) } };
}
