// FORGE TRAINING FREQUENCY SAFETY NET — primera barrera determinista de frecuencia entre el
// Block Analyzer (LLM) y el resto del pipeline de planificacion. NUNCA deja al LLM decidir si
// aplicar descanso o no — la disponibilidad reportada por el atleta es el LIMITE SUPERIOR de
// dias de entreno posibles, nunca una obligacion de entrenar todos esos dias.
//
// ALCANCE HONESTO: esto es un Safety Net de FRECUENCIA MINIMA (nunca 7/7 dias), NO todavia el
// modelo completo de carga -> recuperacion -> frecuencia. Ese modelo mas completo (basado en
// volumen/intensidad real acumulada, no solo en el numero de dias) queda para una iteracion
// futura, construida ENCIMA de esta primera barrera.

export interface ResultadoTrainingFrequencySafetyNet {
  diasEntrenoSugeridos: number;
  corregido: boolean;
  motivo?: 'MAX_6_DAYS_NO_ZERO_REST' | 'HIGH_REAL_FREQUENCY';
  original?: number;
  frecuenciaRealRelativa?: number | null;
}

/**
 * Invariante unica y absoluta de este Safety Net: dias_entreno_sugeridos nunca puede ser 7.
 * Se aplica SIEMPRE, independientemente de fase del bloque, objetivo, disponibilidad declarada,
 * o decision del LLM. No modifica ninguna otra decision del Block Analyzer.
 */
export function aplicarTrainingFrequencySafetyNet(
  diasEntrenoSugeridos: number,
  frecuenciaRealRelativa: number | null = null
): ResultadoTrainingFrequencySafetyNet {
  // Regla absoluta: nunca 7/7 dias
  if (diasEntrenoSugeridos >= 7) {
    return {
      diasEntrenoSugeridos: 6,
      corregido: true,
      motivo: 'MAX_6_DAYS_NO_ZERO_REST',
      original: diasEntrenoSugeridos,
      frecuenciaRealRelativa,
    };
  }

  // V1: solo el umbral >=0.85 produce un efecto real distinto (maximo 5). El umbral 0.70 queda
  // registrado para evolucion futura del modelo, pero en V1 no cambia el resultado (max ya es 6).
  if (frecuenciaRealRelativa !== null && frecuenciaRealRelativa >= 0.85 && diasEntrenoSugeridos > 5) {
    return {
      diasEntrenoSugeridos: 5,
      corregido: true,
      motivo: 'HIGH_REAL_FREQUENCY',
      original: diasEntrenoSugeridos,
      frecuenciaRealRelativa,
    };
  }

  return {
    diasEntrenoSugeridos,
    corregido: false,
    frecuenciaRealRelativa,
  };
}

/**
 * FRECUENCIA REAL RELATIVA (V1) — proxy determinista de "cuanto esta entrenando de hecho" el
 * atleta, NUNCA una estimacion del LLM. Mide utilizacion de disponibilidad (sesiones completadas
 * / dias declarados), no volumen fisiologico completo (duracion/carga/intensidad quedan para V2+).
 * Acotado a [0,1]. Si diasDisponibilidadDeclarada es 0 o invalido, devuelve null (caso invalido,
 * el caller debe tratarlo sin aplicar el umbral de frecuencia real, solo el limite absoluto de 7).
 */
export function calcularFrecuenciaRealRelativa(
  workoutHistory: Array<{ fecha: string }>,
  diasDisponibilidadDeclarada: number
): number | null {
  if (!diasDisponibilidadDeclarada || diasDisponibilidadDeclarada <= 0) return null;

  const ahora = new Date();
  const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sesionesCompletadasUltimos7Dias = (workoutHistory || []).filter((w) => new Date(w.fecha) >= hace7dias).length;

  return Math.min(1, sesionesCompletadasUltimos7Dias / diasDisponibilidadDeclarada);
}