// FORGE BUILD 8C-A — transicion de modo EXISTENTE (cambiar_modo_atleta), extraida de app/api/chat/route.ts
// SIN cambiar su semantica para que el chat y la activacion desde el perfil canonico compartan UNA sola
// implementacion. No sustituye el RPC `change_athlete_mode` (atomico, vive en la base de datos).
//
// Orden de guardas (lo fija canonicalSpecialty.test.mjs): modo valido -> reparacion/validacion de
// especialidad -> campos obligatorios recalculados en servidor -> ciclo -> RPC.

import { computeOnboardingFields } from './planningProfileStatus';
import { ensurePlanningSpecialty } from '../sports/canonicalSpecialty';

/** Modos a los que `cambiar_modo_atleta` puede llevar. `free`, `consulta` y `planificacion` no son destino. */
export const ACTIVATABLE_MODES = ['supervision', 'focus', 'coach'] as const;
export type ActivatableMode = (typeof ACTIVATABLE_MODES)[number];
export const isActivatableMode = (value: unknown): value is ActivatableMode =>
  typeof value === 'string' && (ACTIVATABLE_MODES as readonly string[]).includes(value);

/** Calcula el estado REAL consultando las tablas canonicas (nunca lo que el LLM "cree" completado). */
export async function calculateOnboardingState(db: any, codigo: string, mode: string) {
  const { data: usuarioOnb } = await db.from('usuarios').select('perfil,categoria,especialidad,objetivo_principal,distribucion_semanal').eq('codigo', codigo).maybeSingle();
  const { data: fuentesOnb } = await db.from('athlete_training_sources').select('*').eq('user_codigo', codigo).eq('activo', true);
  return computeOnboardingFields({ ...(usuarioOnb || {}), trainingSources: fuentesOnb || [] }, mode);
}

export type ModeChangeResult = { status: number; body: any };

/**
 * Ejecucion real del cambio de modo. Guard determinista final: nunca confia en que el cliente ya
 * verifico missingFields, lo recalcula aqui antes de construir el nuevo ciclo y llamar a la RPC
 * transaccional change_athlete_mode.
 */
export async function executeAthleteModeChange(db: any, codigo: string, targetMode: unknown, reason?: unknown): Promise<ModeChangeResult> {
  if (!isActivatableMode(targetMode)) return { status: 400, body: { error: 'Modo destino invalido' } };
  const specialtyIntegrity = await ensurePlanningSpecialty(db, codigo, targetMode);
  if (!specialtyIntegrity.ok) return { status: 422, body: { ok: false, code: specialtyIntegrity.code } };
  const { missingFields } = await calculateOnboardingState(db, codigo, targetMode);
  if (missingFields.length > 0) return { status: 400, body: { error: 'Faltan campos obligatorios para este modo', missingFields } };

  // Construir el nuevo ciclo — logica de planificacion, vive en TypeScript, nunca en la RPC
  let nuevoCiclo = null;
  if (targetMode === 'focus' || targetMode === 'coach') {
    const { data: usuarioParaCiclo } = await db.from('usuarios').select('objetivo_principal,perfil').eq('codigo', codigo).single();
    nuevoCiclo = {
      bloque: 'acumulacion',
      semana: 1,
      totalSemanas: 4,
      objetivo: usuarioParaCiclo?.objetivo_principal?.descripcion || usuarioParaCiclo?.perfil?.objetivo_detalle || 'Nueva planificacion',
    };
  }

  const { data: resultadoCambio, error: errorCambio } = await db.rpc('change_athlete_mode', {
    p_codigo: codigo,
    p_target_mode: targetMode,
    p_reason: reason || 'user_requested',
    p_new_cycle: nuevoCiclo,
  });
  if (errorCambio) {
    console.error('Error en cambiar_modo_atleta (RPC):', errorCambio);
    return { status: 500, body: { error: errorCambio.message } };
  }
  console.log(`🔄 MODE CHANGE: ${codigo} — ${JSON.stringify(resultadoCambio)}`);
  return { status: 200, body: resultadoCambio };
}
