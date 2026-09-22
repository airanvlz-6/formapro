/** One build-time flag shared by web and server. Absent/other values are OFF. */
export function coachFirstEnabled() {
  return process.env.NEXT_PUBLIC_FORGE_COACH_FIRST === '1';
}

/** Operation names, never human language. Old clients cannot invoke chat writers while ON. */
export const legacyConversationOperations = new Set([
  'procesar_mensaje_contexto', 'verificar_pr_deterministico', 'verificar_metricas_sueno_deterministico',
  'detectar_coaching_note', 'verificar_sesion_completada_deterministico', 'verificar_carga_externa_deterministico',
  'verificar_datos_cambio_modo_deterministico', 'guardar_disponibilidad_actualizada', 'confirmar_pending_action',
  'verificar_correccion_disponibilidad_deterministico',
  'verificar_modificacion_sesion_deterministico', 'verificar_referencia_sesion_futura', 'detectar_propuesta_sesion',
  'extraer_metricas_imagen', 'extraer_sesion_imagen', 'responder_objetivo_principal', 'responder_habito_carrera',
  'responder_dato_prescripcion', 'confirmar_ownership_coach', 'actualizar_usuario', 'registrar_sesion',
  'registrar_evento', 'analizar_bloque_semana', 'planificar_semana', 'construir_sesion_dia', 'guardar_plan_semana',
]);
