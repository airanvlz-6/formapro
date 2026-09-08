import { hasCanonicalSpecialty, specialtyFromCategory } from '../sports/canonicalSpecialty';
/** AUTH-1B1 containment only. This is not authentication or athlete ownership. */
export function disabledLegacyOperation(action: unknown) {
  const codes: Record<string, string> = {
    establecer_password_auth_admin: 'AUTH_ADMIN_PASSWORD_UPDATE_DISABLED',
    crear_usuario_desde_registro_movil: 'AUTH_LINK_CREATION_DISABLED',
    obtener_codigo_por_auth_user_id: 'AUTH_IDENTITY_LOOKUP_DISABLED',
    completar_onboarding: 'AUTH_MOBILE_ONBOARDING_DISABLED',
    cambiar_codigo_usuario: 'ACCOUNT_CODE_CHANGE_DISABLED',
    eliminar_cuenta: 'ACCOUNT_DELETE_DISABLED',
    recuperar_por_email: 'ACCOUNT_RECOVERY_DISABLED',
    admin_stats: 'ADMIN_AUTH_REQUIRED',
    obtener_event_log: 'ADMIN_AUTH_REQUIRED',
  };
  if (typeof action !== 'string' || !Object.hasOwn(codes, action)) return null;
  return { ok: false, retryable: false, code: codes[action],
    error: 'Esta operación requiere activación del nuevo sistema de acceso.' };
}

// Only fields emitted by the current web onboarding. Identity/billing defaults
// belong to the server/database; even client-supplied false privileges are dropped.
const createFields = ['codigo', 'categoria', 'especialidad', 'perfil', 'rutina',
  'historial', 'marcas', 'email', 'modo_entrada', 'distribucion_semanal'] as const;

// Legacy functional profile edits only. No alias, identity, privileges, billing,
// server timestamps or client-written counters. This does not authorize the target.
const updateFields = ['email', 'perfil', 'especialidad', 'historial', 'marcas',
  'athlete_state', 'lesiones_actuales', 'plan_proxima_semana', 'notas_coach',
  'perfil_psicologico', 'estado_fisiologico', 'datos_entrenamiento',
  'test_atleta', 'marcas_especificas'] as const;

function project(input: unknown, fields: readonly string[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const field of fields) {
    if (Object.hasOwn(input, field)) result[field] = (input as Record<string, unknown>)[field];
  }
  return result;
}
export function projectLegacyCreate(input: unknown) {
  const result = project(input, createFields);
  if (!hasCanonicalSpecialty(result.especialidad)) {
    delete result.especialidad;
    const specialty = specialtyFromCategory(result.categoria);
    if (specialty) result.especialidad = specialty;
  }
  return result;
}
export function projectLegacyUpdate(input: unknown) {
  const result = project(input, updateFields);
  // Omitting the column preserves persisted authority without another DB read.
  if (!hasCanonicalSpecialty(result.especialidad)) delete result.especialidad;
  return result;
}
