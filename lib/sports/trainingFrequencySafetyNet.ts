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
  motivo?: 'MAX_6_DAYS_NO_ZERO_REST';
  original?: number;
}

/**
 * Invariante unica y absoluta de este Safety Net: dias_entreno_sugeridos nunca puede ser 7.
 * Se aplica SIEMPRE, independientemente de fase del bloque, objetivo, disponibilidad declarada,
 * o decision del LLM. No modifica ninguna otra decision del Block Analyzer.
 */
export function aplicarTrainingFrequencySafetyNet(
  diasEntrenoSugeridos: number
): ResultadoTrainingFrequencySafetyNet {
  if (diasEntrenoSugeridos >= 7) {
    return {
      diasEntrenoSugeridos: 6,
      corregido: true,
      motivo: 'MAX_6_DAYS_NO_ZERO_REST',
      original: diasEntrenoSugeridos,
    };
  }

  return {
    diasEntrenoSugeridos,
    corregido: false,
  };
}