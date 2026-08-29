// FORGE WORKOUT STRUCTURE LIBRARY — formatos reales de sesion, no solo lista de ejercicios.
// La unidad de programacion en CrossFit no es "que ejercicios", es "que estructura + que
// movimientos + que estimulo", y en carrera es "que prescripcion" (distancia/intervalo/
// recuperacion/densidad), no "que movimiento aislado". Esta capa modela ambas.

export type FormatoWOD =
  | "amrap" | "emom" | "e2mom" | "for_time" | "intervals" | "ladder"
  | "chipper" | "couplet" | "triplet" | "rounds" | "death_by" | "density" | "strength_sets" | "complex";

export interface WorkoutStructure {
  id: string;
  discipline: "box" | "carrera";
  formato: FormatoWOD;
  duracion_tipica_min: [number, number]; // rango [min, max]
  stimulus_type: "strength" | "power" | "aerobic" | "anaerobic" | "mixed_modal" | "skill";
  interference: "baja" | "media" | "alta"; // cuanto interfieren entre si los movimientos si se combinan
  descripcion: string;
}

export const WORKOUT_STRUCTURE_LIBRARY: Record<string, WorkoutStructure> = {
  amrap_corto: { id: "amrap_corto", discipline: "box", formato: "amrap", duracion_tipica_min: [8, 12], stimulus_type: "anaerobic", interference: "media", descripcion: "AMRAP corto, alta intensidad, 2-3 movimientos" },
  amrap_largo: { id: "amrap_largo", discipline: "box", formato: "amrap", duracion_tipica_min: [15, 25], stimulus_type: "mixed_modal", interference: "media", descripcion: "AMRAP largo, ritmo sostenible, resistencia a la fatiga" },
  emom_fuerza: { id: "emom_fuerza", discipline: "box", formato: "emom", duracion_tipica_min: [10, 20], stimulus_type: "strength", interference: "baja", descripcion: "EMOM con foco en carga/tecnica, descanso incorporado cada minuto" },
  emom_metcon: { id: "emom_metcon", discipline: "box", formato: "emom", duracion_tipica_min: [10, 16], stimulus_type: "anaerobic", interference: "media", descripcion: "EMOM con foco metabolico, densidad alta por minuto" },
  for_time_corto: { id: "for_time_corto", discipline: "box", formato: "for_time", duracion_tipica_min: [3, 8], stimulus_type: "anaerobic", interference: "alta", descripcion: "For time corto, maxima intensidad, 1-2 movimientos" },
  for_time_medio: { id: "for_time_medio", discipline: "box", formato: "for_time", duracion_tipica_min: [10, 20], stimulus_type: "mixed_modal", interference: "media", descripcion: "For time medio, tipo 21-15-9 o similar" },
  chipper: { id: "chipper", discipline: "box", formato: "chipper", duracion_tipica_min: [15, 30], stimulus_type: "mixed_modal", interference: "media", descripcion: "Chipper largo, muchos movimientos distintos secuenciales" },
  ladder: { id: "ladder", discipline: "box", formato: "ladder", duracion_tipica_min: [8, 15], stimulus_type: "anaerobic", interference: "media", descripcion: "Escalera ascendente/descendente de reps" },
  couplet: { id: "couplet", discipline: "box", formato: "couplet", duracion_tipica_min: [8, 20], stimulus_type: "mixed_modal", interference: "media", descripcion: "2 movimientos combinados, formato variable" },
  triplet: { id: "triplet", discipline: "box", formato: "triplet", duracion_tipica_min: [10, 20], stimulus_type: "mixed_modal", interference: "media", descripcion: "3 movimientos combinados, formato variable" },
  death_by: { id: "death_by", discipline: "box", formato: "death_by", duracion_tipica_min: [5, 15], stimulus_type: "anaerobic", interference: "alta", descripcion: "Death by: +1 rep cada minuto hasta fallo" },
  strength_sets: { id: "strength_sets", discipline: "box", formato: "strength_sets", duracion_tipica_min: [20, 40], stimulus_type: "strength", interference: "baja", descripcion: "Series tradicionales de fuerza, descanso completo entre series" },
  complex_halterofilia: { id: "complex_halterofilia", discipline: "box", formato: "complex", duracion_tipica_min: [15, 25], stimulus_type: "skill", interference: "baja", descripcion: "Complejo tecnico de halterofilia, series cortas con foco tecnico" },

  intervalos_carrera: { id: "intervalos_carrera", discipline: "carrera", formato: "intervals", duracion_tipica_min: [25, 50], stimulus_type: "anaerobic", interference: "baja", descripcion: "Series con recuperacion definida, distancia/tiempo variable" },
  continuo_carrera: { id: "continuo_carrera", discipline: "carrera", formato: "for_time", duracion_tipica_min: [30, 120], stimulus_type: "aerobic", interference: "baja", descripcion: "Carrera continua sin pausas, volumen o tiempo objetivo" },
};

// ============================================================
// DIMENSIONES DE EXPOSICION AMPLIADAS — patron/modalidad/estimulo, no solo movimiento individual.
// Permite que el Exposure Engine agregue por PATRON ("cuanto squat he hecho esta semana, sin
// importar la variante concreta") en vez de solo por movimiento exacto.
// ============================================================
export type ModalidadEjercicio = "barbell" | "dumbbell" | "kettlebell" | "gymnastics" | "erg" | "bodyweight" | "otro";

export const MODALIDAD_POR_MOVIMIENTO: Record<string, ModalidadEjercicio> = {
  back_squat: "barbell", front_squat: "barbell", overhead_squat: "barbell", box_squat: "barbell",
  goblet_squat: "dumbbell", wall_ball: "otro", thruster: "barbell", pistol_squat: "bodyweight",
  deadlift: "barbell", rdl: "barbell", sumo_deadlift: "barbell", kettlebell_swing: "kettlebell", good_morning: "barbell",
  snatch: "barbell", power_snatch: "barbell", hang_snatch: "barbell", snatch_pull: "barbell",
  clean_and_jerk: "barbell", power_clean: "barbell", hang_clean: "barbell", clean_pull: "barbell",
  strict_press: "barbell", push_press: "barbell", push_jerk: "barbell", handstand_push_up: "gymnastics", pike_push_up: "gymnastics", db_shoulder_press: "dumbbell",
  bench_press: "barbell", db_bench_press: "dumbbell", push_up: "bodyweight", dip: "gymnastics",
  pull_up: "gymnastics", chest_to_bar: "gymnastics", muscle_up: "gymnastics", ring_row: "gymnastics", barbell_row: "barbell", toes_to_bar: "gymnastics",
  box_jump: "bodyweight", box_step_up: "bodyweight", double_under: "otro", single_under: "otro", burpee: "bodyweight",
  row_erg: "erg", bike_erg: "erg", ski_erg: "erg", farmers_carry: "otro", sled_push: "otro",
  russian_twist: "otro", hollow_hold: "bodyweight", gh_situp: "otro", knee_raise: "gymnastics", plank: "bodyweight",
  walking_lunge: "bodyweight", bulgarian_split_squat: "bodyweight",
};

/**
 * Agrega exposición por PATRÓN de movimiento (ej: todos los "pull" juntos, sin importar si fue
 * pull-up, chest-to-bar o ring row) — responde "cuánto tirón he hecho" en vez de solo "cuántos
 * pull-ups exactos", que es la pregunta que realmente importa para programar variedad real.
 */
export function agregarExposicionPorPatron(
  exposiciones: { movementId: string; vecesUltimas4Semanas: number }[],
  movementLibrary: Record<string, { movement_pattern: string; discipline: string[] }>
): Record<string, number> {
  const porPatron: Record<string, number> = {};
  exposiciones.forEach(e => {
    const patron = movementLibrary[e.movementId]?.movement_pattern;
    if (patron) porPatron[patron] = (porPatron[patron] || 0) + e.vecesUltimas4Semanas;
  });
  return porPatron;
}

export function agregarExposicionPorModalidad(
  exposiciones: { movementId: string; vecesUltimas4Semanas: number }[]
): Record<string, number> {
  const porModalidad: Record<string, number> = {};
  exposiciones.forEach(e => {
    const modalidad = MODALIDAD_POR_MOVIMIENTO[e.movementId] || "otro";
    porModalidad[modalidad] = (porModalidad[modalidad] || 0) + e.vecesUltimas4Semanas;
  });
  return porModalidad;
}