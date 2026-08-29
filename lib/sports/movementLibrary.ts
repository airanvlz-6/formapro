// FORGE MOVEMENT & STIMULUS LIBRARY — contrato de conocimiento estructurado, separado en capas.
// Responde a la pregunta: no "que ejercicios existen" sino "que estimulo necesito producir y con
// que movimiento lo produzco". El LLM redacta la sesion final, pero NUNCA decide el estimulo ni
// selecciona el movimiento sin pasar por este contrato — evita el mismo patron de fragilidad ya
// corregido varias veces en Forge (confiar en que el LLM "sepa" programar correctamente).
//
// Cobertura: BOX/CROSSFIT y CARRERA completas — las dos disciplinas mas utilizadas en Forge.

// ============================================================
// NIVEL 3-4 — MOVIMIENTOS (patron + variante concreta)
// ============================================================
export type PatronMovimiento =
  | "squat" | "hinge" | "horizontal_push" | "vertical_push" | "horizontal_pull" | "vertical_pull"
  | "olympic_lift" | "carry" | "run" | "jump" | "core_antirotacion" | "core_flexion"
  | "core_antiextension" | "locomotion" | "lunge" | "rotational" | "cyclic" | "inverted_locomotion";

export interface Movimiento {
  id: string;
  discipline: ("box" | "carrera" | "fuerza")[];
  movement_pattern: PatronMovimiento;
  stimulus: string[];
  equipment: string[];
  technical_demand: "baja" | "media" | "alta";
  impact: "bajo" | "medio" | "alto";
  axial_load: "bajo" | "medio" | "alto";
  scalable: boolean;
  progressions?: string[];
  regressions?: string[];
  variants?: string[];
  suitable_for: string[];
  avoid_with?: string[];
  fatigue_cost: "bajo" | "medio" | "alto";
  recovery_cost_horas: number;
}

// ============================================================
// BOX / CROSSFIT — movimientos completos
// ============================================================
const MOVIMIENTOS_BOX: Record<string, Movimiento> = {
  // --- SQUAT ---
  back_squat: { id: "back_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_maxima", "hipertrofia"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "alto", scalable: true, progressions: ["back_squat_pausa"], regressions: ["goblet_squat"], variants: ["front_squat", "box_squat", "overhead_squat"], suitable_for: ["fuerza_maxima", "hipertrofia"], avoid_with: ["rodilla", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  front_squat: { id: "front_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_maxima", "halterofilia_soporte"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "alto", scalable: true, variants: ["back_squat"], suitable_for: ["fuerza_maxima", "halterofilia_soporte"], avoid_with: ["rodilla", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  overhead_squat: { id: "overhead_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["halterofilia_soporte", "movilidad_tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, suitable_for: ["halterofilia_soporte"], avoid_with: ["hombro", "rodilla", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  box_squat: { id: "box_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_maxima"], equipment: ["barra", "cajon"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: true, suitable_for: ["fuerza_maxima"], avoid_with: ["rodilla", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  goblet_squat: { id: "goblet_squat", discipline: ["box", "carrera"], movement_pattern: "squat", stimulus: ["fuerza_general", "tecnica", "fuerza_corredor"], equipment: ["mancuerna", "kettlebell"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["front_squat"], suitable_for: ["fuerza_general", "tecnica", "fuerza_corredor"], fatigue_cost: "bajo", recovery_cost_horas: 24 },
  wall_ball: { id: "wall_ball", discipline: ["box"], movement_pattern: "squat", stimulus: ["capacidad_glucolitica", "capacidad_aerobica"], equipment: ["balon_medicinal"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica", "capacidad_aerobica"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  thruster: { id: "thruster", discipline: ["box"], movement_pattern: "squat", stimulus: ["capacidad_glucolitica", "potencia"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["capacidad_glucolitica", "potencia"], avoid_with: ["hombro", "rodilla", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  pistol_squat: { id: "pistol_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["gimnasticos", "fuerza_general"], equipment: [], technical_demand: "alta", impact: "medio", axial_load: "bajo", scalable: false, regressions: ["goblet_squat"], suitable_for: ["gimnasticos"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- HINGE ---
  deadlift: { id: "deadlift", discipline: ["box"], movement_pattern: "hinge", stimulus: ["fuerza_maxima", "cadena_posterior"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: true, variants: ["sumo_deadlift", "rdl", "deficit_deadlift"], suitable_for: ["fuerza_maxima", "cadena_posterior"], avoid_with: ["lumbar"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  rdl: { id: "rdl", discipline: ["box", "carrera"], movement_pattern: "hinge", stimulus: ["cadena_posterior", "fuerza_general", "fuerza_corredor"], equipment: ["barra", "mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, variants: ["deadlift", "single_leg_rdl"], suitable_for: ["cadena_posterior", "fuerza_corredor"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  sumo_deadlift: { id: "sumo_deadlift", discipline: ["box"], movement_pattern: "hinge", stimulus: ["fuerza_maxima"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: true, variants: ["deadlift"], suitable_for: ["fuerza_maxima"], avoid_with: ["lumbar", "cadera"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  kettlebell_swing: { id: "kettlebell_swing", discipline: ["box"], movement_pattern: "hinge", stimulus: ["capacidad_glucolitica", "cadena_posterior"], equipment: ["kettlebell"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["capacidad_glucolitica", "cadena_posterior"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  good_morning: { id: "good_morning", discipline: ["box"], movement_pattern: "hinge", stimulus: ["cadena_posterior"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["cadena_posterior"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  single_leg_rdl: { id: "single_leg_rdl", discipline: ["box", "carrera"], movement_pattern: "hinge", stimulus: ["cadena_posterior", "fuerza_corredor", "coordinacion"], equipment: ["mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["rdl"], suitable_for: ["fuerza_corredor", "coordinacion"], avoid_with: ["lumbar", "tobillo"], fatigue_cost: "bajo", recovery_cost_horas: 12 },

  // --- OLYMPIC LIFT ---
  snatch: { id: "snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, progressions: ["snatch_pull", "hang_snatch"], variants: ["power_snatch", "hang_snatch", "muscle_snatch", "snatch_balance"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "muñeca", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  power_snatch: { id: "power_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, variants: ["snatch"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  hang_snatch: { id: "hang_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, progressions: ["snatch"], suitable_for: ["halterofilia_tecnica"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  snatch_pull: { id: "snatch_pull", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_soporte", "fuerza_maxima"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: true, progressions: ["hang_snatch"], suitable_for: ["halterofilia_soporte"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  clean_and_jerk: { id: "clean_and_jerk", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, progressions: ["clean_pull", "hang_clean"], variants: ["power_clean", "hang_clean", "squat_clean"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "muñeca", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  power_clean: { id: "power_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, variants: ["clean_and_jerk"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  hang_clean: { id: "hang_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, progressions: ["clean_and_jerk"], suitable_for: ["halterofilia_tecnica"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  clean_pull: { id: "clean_pull", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_soporte", "fuerza_maxima"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: true, progressions: ["hang_clean"], suitable_for: ["halterofilia_soporte"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- VERTICAL PUSH ---
  strict_press: { id: "strict_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["fuerza_general", "halterofilia_soporte"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, variants: ["push_press", "push_jerk"], suitable_for: ["fuerza_general"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  push_press: { id: "push_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["potencia", "fuerza_general"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, variants: ["strict_press", "push_jerk"], suitable_for: ["potencia", "fuerza_general"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  push_jerk: { id: "push_jerk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["potencia", "halterofilia_soporte"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "medio", scalable: false, variants: ["push_press"], suitable_for: ["potencia"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  handstand_push_up: { id: "handstand_push_up", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["pike_push_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  pike_push_up: { id: "pike_push_up", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos", "fuerza_general"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["handstand_push_up"], suitable_for: ["gimnasticos"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  db_shoulder_press: { id: "db_shoulder_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["fuerza_general", "hipertrofia"], equipment: ["mancuerna"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "hipertrofia"], avoid_with: ["hombro"], fatigue_cost: "bajo", recovery_cost_horas: 12 },

  // --- HORIZONTAL PUSH ---
  bench_press: { id: "bench_press", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["fuerza_maxima", "hipertrofia"], equipment: ["barra", "banco"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["db_bench_press", "close_grip_bench"], suitable_for: ["fuerza_maxima", "hipertrofia"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  db_bench_press: { id: "db_bench_press", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["hipertrofia", "fuerza_general"], equipment: ["mancuerna", "banco"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["bench_press"], suitable_for: ["hipertrofia", "fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  push_up: { id: "push_up", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["fuerza_general", "capacidad_glucolitica"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "capacidad_glucolitica"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  dip: { id: "dip", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["gimnasticos", "fuerza_general"], equipment: ["paralelas"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, regressions: ["push_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- PULL ---
  pull_up: { id: "pull_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos", "fuerza_general"], equipment: ["barra_dominadas"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["muscle_up"], regressions: ["ring_row"], variants: ["kipping_pull_up", "chest_to_bar", "strict_pull_up"], suitable_for: ["gimnasticos", "fuerza_general"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  chest_to_bar: { id: "chest_to_bar", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["barra_dominadas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["pull_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  muscle_up: { id: "muscle_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["barra_dominadas", "anillas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["pull_up", "dip"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  ring_row: { id: "ring_row", discipline: ["box"], movement_pattern: "horizontal_pull", stimulus: ["fuerza_general", "tecnica"], equipment: ["anillas"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["pull_up"], suitable_for: ["fuerza_general", "tecnica"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  barbell_row: { id: "barbell_row", discipline: ["box"], movement_pattern: "horizontal_pull", stimulus: ["hipertrofia", "fuerza_general"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["hipertrofia", "fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  toes_to_bar: { id: "toes_to_bar", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos", "capacidad_glucolitica"], equipment: ["barra_dominadas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["knee_raise"], suitable_for: ["gimnasticos", "capacidad_glucolitica"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- JUMP / IMPACT ---
  box_jump: { id: "box_jump", discipline: ["box"], movement_pattern: "jump", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["cajon"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, regressions: ["box_step_up"], suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  box_step_up: { id: "box_step_up", discipline: ["box"], movement_pattern: "jump", stimulus: ["fuerza_general"], equipment: ["cajon"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["box_jump"], suitable_for: ["fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  double_under: { id: "double_under", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica", "coordinacion"], equipment: ["comba"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: false, regressions: ["single_under"], suitable_for: ["capacidad_glucolitica"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  single_under: { id: "single_under", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_aerobica"], equipment: ["comba"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, progressions: ["double_under"], suitable_for: ["capacidad_aerobica"], avoid_with: ["rodilla"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  burpee: { id: "burpee", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica"], equipment: [], technical_demand: "baja", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica"], avoid_with: ["rodilla", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 12 },

  // --- CARRY / MONOSTRUCTURAL ---
  row_erg: { id: "row_erg", discipline: ["box"], movement_pattern: "cyclic", stimulus: ["capacidad_aerobica", "capacidad_glucolitica"], equipment: ["remo"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_aerobica", "capacidad_glucolitica"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  bike_erg: { id: "bike_erg", discipline: ["box"], movement_pattern: "cyclic", stimulus: ["capacidad_aerobica", "capacidad_glucolitica"], equipment: ["bici_estatica"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_aerobica", "capacidad_glucolitica"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  ski_erg: { id: "ski_erg", discipline: ["box"], movement_pattern: "cyclic", stimulus: ["capacidad_aerobica", "capacidad_glucolitica"], equipment: ["ski_erg"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_aerobica", "capacidad_glucolitica"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  farmers_carry: { id: "farmers_carry", discipline: ["box"], movement_pattern: "carry", stimulus: ["fuerza_general", "capacidad_aerobica"], equipment: ["mancuerna", "kettlebell"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  sled_push: { id: "sled_push", discipline: ["box"], movement_pattern: "carry", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["sled"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["rodilla"], fatigue_cost: "alto", recovery_cost_horas: 24 },

  // --- CORE ---
  russian_twist: { id: "russian_twist", discipline: ["box"], movement_pattern: "rotational", stimulus: ["fuerza_general"], equipment: ["disco"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  hollow_hold: { id: "hollow_hold", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos", "fuerza_general"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["gimnasticos", "fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  gh_situp: { id: "gh_situp", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos"], equipment: ["ghd"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["gimnasticos"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  knee_raise: { id: "knee_raise", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["fuerza_general"], equipment: ["barra_dominadas"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["toes_to_bar"], suitable_for: ["fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  plank: { id: "plank", discipline: ["box"], movement_pattern: "core_antiextension", stimulus: ["fuerza_general", "tecnica"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "tecnica"], fatigue_cost: "bajo", recovery_cost_horas: 6 },
  v_up: { id: "v_up", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos", "fuerza_general"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, regressions: ["sit_up"], suitable_for: ["gimnasticos", "fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  sit_up: { id: "sit_up", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["fuerza_general"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["v_up"], suitable_for: ["fuerza_general"], fatigue_cost: "bajo", recovery_cost_horas: 6 },

  // --- LUNGE ---
  walking_lunge: { id: "walking_lunge", discipline: ["box", "carrera"], movement_pattern: "lunge", stimulus: ["fuerza_general", "capacidad_aerobica", "fuerza_corredor"], equipment: [], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["overhead_lunge", "db_lunge"], suitable_for: ["fuerza_general", "fuerza_corredor"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  bulgarian_split_squat: { id: "bulgarian_split_squat", discipline: ["box", "carrera"], movement_pattern: "lunge", stimulus: ["fuerza_general", "hipertrofia", "fuerza_corredor"], equipment: ["banco"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general", "hipertrofia", "fuerza_corredor"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  overhead_lunge: { id: "overhead_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["halterofilia_soporte", "coordinacion"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "medio", scalable: false, variants: ["walking_lunge"], suitable_for: ["halterofilia_soporte"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- HALTEROFILIA: variantes tecnicas adicionales ---
  snatch_balance: { id: "snatch_balance", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "coordinacion"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, suitable_for: ["halterofilia_tecnica", "coordinacion"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  drop_snatch: { id: "drop_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "coordinacion"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, variants: ["snatch_balance"], suitable_for: ["halterofilia_tecnica"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  muscle_snatch: { id: "muscle_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_soporte", "fuerza_general"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["halterofilia_soporte"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  sotts_press: { id: "sotts_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["halterofilia_soporte", "movilidad_tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "medio", scalable: false, suitable_for: ["halterofilia_soporte", "movilidad_tecnica"], avoid_with: ["hombro", "rodilla", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  clean_and_jerk_complex: { id: "clean_and_jerk_complex", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, variants: ["clean_and_jerk"], suitable_for: ["halterofilia_tecnica"], avoid_with: ["hombro", "muñeca", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 48 },

  // --- GIMNASTICOS avanzados ---
  bar_muscle_up: { id: "bar_muscle_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["barra_dominadas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["chest_to_bar", "pull_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  ring_muscle_up: { id: "ring_muscle_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["anillas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["pull_up", "dip"], variants: ["bar_muscle_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  l_sit: { id: "l_sit", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos", "fuerza_general"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: true, regressions: ["hollow_hold"], suitable_for: ["gimnasticos"], avoid_with: ["muñeca"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  freestanding_handstand: { id: "freestanding_handstand", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos", "coordinacion"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, suitable_for: ["gimnasticos", "coordinacion"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  handstand_hold: { id: "handstand_hold", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["freestanding_handstand"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  handstand_shoulder_tap: { id: "handstand_shoulder_tap", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos", "coordinacion"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["handstand_hold"], suitable_for: ["gimnasticos", "coordinacion"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  wall_walk: { id: "wall_walk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos", "capacidad_glucolitica"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["pike_push_up"], suitable_for: ["gimnasticos", "capacidad_glucolitica"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  handstand_walk: { id: "handstand_walk", discipline: ["box"], movement_pattern: "inverted_locomotion", stimulus: ["gimnasticos", "coordinacion"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, suitable_for: ["gimnasticos", "coordinacion"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  strict_pull_up: { id: "strict_pull_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos", "fuerza_general"], equipment: ["barra_dominadas"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["chest_to_bar"], regressions: ["ring_row"], suitable_for: ["gimnasticos", "fuerza_general"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  deficit_hspu: { id: "deficit_hspu", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos"], equipment: ["bumper"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["handstand_push_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  pike_handstand_push_up: { id: "pike_handstand_push_up", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["gimnasticos"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["handstand_push_up"], regressions: ["pike_push_up"], suitable_for: ["gimnasticos"], fatigue_cost: "bajo", recovery_cost_horas: 12 },

  // --- MONOSTRUCTURAL adicional ---
  assault_bike: { id: "assault_bike", discipline: ["box"], movement_pattern: "cyclic", stimulus: ["capacidad_glucolitica", "capacidad_aerobica"], equipment: ["assault_bike"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["bike_erg"], suitable_for: ["capacidad_glucolitica", "capacidad_aerobica"], fatigue_cost: "alto", recovery_cost_horas: 12 },
  echo_bike: { id: "echo_bike", discipline: ["box"], movement_pattern: "cyclic", stimulus: ["capacidad_glucolitica", "capacidad_aerobica"], equipment: ["echo_bike"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["assault_bike"], suitable_for: ["capacidad_glucolitica", "capacidad_aerobica"], fatigue_cost: "alto", recovery_cost_horas: 12 },
  run_400m: { id: "run_400m", discipline: ["box"], movement_pattern: "run", stimulus: ["capacidad_glucolitica", "capacidad_aerobica"], equipment: [], technical_demand: "baja", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica", "capacidad_aerobica"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  shuttle_run: { id: "shuttle_run", discipline: ["box"], movement_pattern: "run", stimulus: ["capacidad_glucolitica", "coordinacion"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica", "coordinacion"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 12 },

  // --- OTROS MOVIMIENTOS COMUNES DE WOD ---
  devil_press: { id: "devil_press", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["capacidad_glucolitica", "potencia"], equipment: ["mancuerna"], technical_demand: "media", impact: "alto", axial_load: "medio", scalable: true, suitable_for: ["capacidad_glucolitica", "potencia"], avoid_with: ["hombro", "lumbar", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  db_snatch: { id: "db_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  man_makers: { id: "man_makers", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["capacidad_glucolitica", "fuerza_general"], equipment: ["mancuerna"], technical_demand: "media", impact: "alto", axial_load: "medio", scalable: true, suitable_for: ["capacidad_glucolitica", "fuerza_general"], avoid_with: ["hombro", "muñeca", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  db_clean_and_jerk: { id: "db_clean_and_jerk", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["mancuerna"], technical_demand: "media", impact: "medio", axial_load: "medio", scalable: true, suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  sandbag_carry: { id: "sandbag_carry", discipline: ["box"], movement_pattern: "carry", stimulus: ["fuerza_general", "capacidad_aerobica"], equipment: ["sandbag"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  yoke_carry: { id: "yoke_carry", discipline: ["box"], movement_pattern: "carry", stimulus: ["fuerza_maxima"], equipment: ["yoke"], technical_demand: "media", impact: "bajo", axial_load: "alto", scalable: false, suitable_for: ["fuerza_maxima"], avoid_with: ["lumbar", "hombro"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  gh_back_extension: { id: "gh_back_extension", discipline: ["box"], movement_pattern: "hinge", stimulus: ["cadena_posterior", "fuerza_general"], equipment: ["ghd"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["cadena_posterior", "fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  sandbag_clean: { id: "sandbag_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "capacidad_glucolitica"], equipment: ["sandbag"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general", "capacidad_glucolitica"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  sandbag_to_shoulder: { id: "sandbag_to_shoulder", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "capacidad_glucolitica"], equipment: ["sandbag"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general", "capacidad_glucolitica"], avoid_with: ["lumbar", "hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  plate_ground_to_overhead: { id: "plate_ground_to_overhead", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["capacidad_glucolitica", "fuerza_general"], equipment: ["disco"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica", "fuerza_general"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },

  // --- ROPE / VERTICAL PULL adicional ---
  rope_climb: { id: "rope_climb", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["cuerda"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: true, regressions: ["pull_up"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  legless_rope_climb: { id: "legless_rope_climb", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["cuerda"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["rope_climb"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  kipping_pull_up: { id: "kipping_pull_up", discipline: ["box"], movement_pattern: "vertical_pull", stimulus: ["gimnasticos"], equipment: ["barra_dominadas"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["strict_pull_up", "chest_to_bar"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  knees_to_elbows: { id: "knees_to_elbows", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["gimnasticos"], equipment: ["barra_dominadas"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, progressions: ["toes_to_bar"], suitable_for: ["gimnasticos"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  ring_dip: { id: "ring_dip", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["gimnasticos", "fuerza_general"], equipment: ["anillas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, regressions: ["dip"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  strict_ring_dip: { id: "strict_ring_dip", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["gimnasticos", "fuerza_general"], equipment: ["anillas"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, variants: ["ring_dip"], suitable_for: ["gimnasticos"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  hand_release_push_up: { id: "hand_release_push_up", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["fuerza_general", "capacidad_glucolitica"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["push_up"], suitable_for: ["fuerza_general", "capacidad_glucolitica"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  bar_facing_burpee: { id: "bar_facing_burpee", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica"], equipment: ["barra"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, variants: ["burpee"], suitable_for: ["capacidad_glucolitica"], avoid_with: ["rodilla", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 12 },
  bar_over_burpee: { id: "bar_over_burpee", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica"], equipment: ["barra"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, variants: ["burpee", "bar_facing_burpee"], suitable_for: ["capacidad_glucolitica"], avoid_with: ["rodilla", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 12 },

  // --- JERK / OLYMPIC variantes adicionales ---
  squat_clean: { id: "squat_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "alto", scalable: false, variants: ["power_clean"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "muñeca", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  hang_power_clean: { id: "hang_power_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, variants: ["hang_clean", "power_clean"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  split_jerk: { id: "split_jerk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "medio", scalable: false, variants: ["push_jerk", "power_jerk"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "rodilla", "tobillo"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  power_jerk: { id: "power_jerk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["potencia"], equipment: ["barra"], technical_demand: "media", impact: "medio", axial_load: "medio", scalable: true, variants: ["push_jerk", "split_jerk"], suitable_for: ["potencia"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  clean_high_pull: { id: "clean_high_pull", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_soporte"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["halterofilia_soporte"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  snatch_high_pull: { id: "snatch_high_pull", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["halterofilia_soporte"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["halterofilia_soporte"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },

  // --- KETTLEBELL basicos ---
  kb_clean: { id: "kb_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "coordinacion"], equipment: ["kettlebell"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "coordinacion"], avoid_with: ["muñeca"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  kb_snatch: { id: "kb_snatch", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["kettlebell"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: false, suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["hombro"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  kb_push_press: { id: "kb_push_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["fuerza_general", "potencia"], equipment: ["kettlebell"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "potencia"], avoid_with: ["hombro"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  turkish_get_up: { id: "turkish_get_up", discipline: ["box"], movement_pattern: "core_antirotacion", stimulus: ["fuerza_general", "tecnica"], equipment: ["kettlebell"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "tecnica"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  kb_goblet_squat: { id: "kb_goblet_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_general", "tecnica"], equipment: ["kettlebell"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["goblet_squat"], suitable_for: ["fuerza_general", "tecnica"], fatigue_cost: "bajo", recovery_cost_horas: 24 },
  kb_lunge: { id: "kb_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general"], equipment: ["kettlebell"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["walking_lunge"], suitable_for: ["fuerza_general"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  kb_clean_and_press: { id: "kb_clean_and_press", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "potencia"], equipment: ["kettlebell"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "potencia"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },

  // --- DUMBBELL basicos ---
  db_thruster: { id: "db_thruster", discipline: ["box"], movement_pattern: "squat", stimulus: ["capacidad_glucolitica", "potencia"], equipment: ["mancuerna"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["thruster"], suitable_for: ["capacidad_glucolitica", "potencia"], avoid_with: ["rodilla", "hombro"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  db_push_press: { id: "db_push_press", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["fuerza_general", "potencia"], equipment: ["mancuerna"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["push_press"], suitable_for: ["fuerza_general", "potencia"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_push_jerk: { id: "db_push_jerk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["potencia"], equipment: ["mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["db_push_press"], suitable_for: ["potencia"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_deadlift: { id: "db_deadlift", discipline: ["box"], movement_pattern: "hinge", stimulus: ["cadena_posterior", "fuerza_general"], equipment: ["mancuerna"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["deadlift"], suitable_for: ["cadena_posterior", "fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  db_step_up: { id: "db_step_up", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general"], equipment: ["mancuerna", "cajon"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["rodilla"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  db_front_rack_lunge: { id: "db_front_rack_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general", "capacidad_aerobica"], equipment: ["mancuerna"], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, variants: ["walking_lunge"], suitable_for: ["fuerza_general"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_lunge: { id: "db_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general"], equipment: ["mancuerna"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["walking_lunge"], suitable_for: ["fuerza_general"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_clean: { id: "db_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "coordinacion"], equipment: ["mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "coordinacion"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_power_clean: { id: "db_power_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["potencia"], equipment: ["mancuerna"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["db_clean"], suitable_for: ["potencia"], avoid_with: ["hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  db_box_step_up: { id: "db_box_step_up", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general"], equipment: ["mancuerna", "cajon"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["db_step_up"], suitable_for: ["fuerza_general"], avoid_with: ["rodilla"], fatigue_cost: "bajo", recovery_cost_horas: 12 },

  // --- BARBELL adicional ---
  barbell_lunge: { id: "barbell_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["fuerza_general", "hipertrofia"], equipment: ["barra"], technical_demand: "media", impact: "medio", axial_load: "medio", scalable: true, variants: ["front_rack_lunge"], suitable_for: ["fuerza_general", "hipertrofia"], avoid_with: ["rodilla", "hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  front_rack_lunge: { id: "front_rack_lunge", discipline: ["box"], movement_pattern: "lunge", stimulus: ["halterofilia_soporte", "coordinacion"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "medio", scalable: false, variants: ["barbell_lunge"], suitable_for: ["halterofilia_soporte"], avoid_with: ["rodilla", "hombro"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  jerk: { id: "jerk", discipline: ["box"], movement_pattern: "vertical_push", stimulus: ["halterofilia_tecnica", "potencia"], equipment: ["barra"], technical_demand: "alta", impact: "medio", axial_load: "medio", scalable: false, variants: ["split_jerk", "power_jerk", "push_jerk"], suitable_for: ["halterofilia_tecnica", "potencia"], avoid_with: ["hombro", "rodilla"], fatigue_cost: "alto", recovery_cost_horas: 24 },

  // --- ODD OBJECTS / SLED adicional ---
  sled_drag: { id: "sled_drag", discipline: ["box"], movement_pattern: "carry", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["sled"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, variants: ["sled_push"], suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["rodilla", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  sled_pull: { id: "sled_pull", discipline: ["box"], movement_pattern: "carry", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["sled"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, variants: ["sled_drag"], suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["lumbar"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  overhead_carry: { id: "overhead_carry", discipline: ["box"], movement_pattern: "carry", stimulus: ["fuerza_general"], equipment: ["mancuerna", "kettlebell"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["hombro", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  bear_hug_carry: { id: "bear_hug_carry", discipline: ["box"], movement_pattern: "carry", stimulus: ["fuerza_general"], equipment: ["sandbag"], technical_demand: "baja", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_general"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  med_ball_clean: { id: "med_ball_clean", discipline: ["box"], movement_pattern: "olympic_lift", stimulus: ["fuerza_general", "capacidad_glucolitica"], equipment: ["balon_medicinal"], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_general", "capacidad_glucolitica"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  med_ball_slam: { id: "med_ball_slam", discipline: ["box"], movement_pattern: "core_flexion", stimulus: ["capacidad_glucolitica", "potencia"], equipment: ["balon_medicinal"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["capacidad_glucolitica", "potencia"], avoid_with: ["lumbar"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  med_ball_throw: { id: "med_ball_throw", discipline: ["box"], movement_pattern: "rotational", stimulus: ["potencia", "capacidad_glucolitica"], equipment: ["balon_medicinal"], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, variants: ["med_ball_slam"], suitable_for: ["potencia", "capacidad_glucolitica"], avoid_with: ["lumbar", "hombro"], fatigue_cost: "medio", recovery_cost_horas: 12 },

  // --- SALTOS adicionales ---
  lateral_box_jump: { id: "lateral_box_jump", discipline: ["box"], movement_pattern: "jump", stimulus: ["potencia", "coordinacion"], equipment: ["cajon"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, variants: ["box_jump"], suitable_for: ["potencia"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  broad_jump: { id: "broad_jump", discipline: ["box", "carrera"], movement_pattern: "jump", stimulus: ["potencia", "potencia_carrera"], equipment: [], technical_demand: "baja", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["potencia", "potencia_carrera"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  jumping_lunge: { id: "jumping_lunge", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica", "potencia"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, variants: ["walking_lunge"], suitable_for: ["capacidad_glucolitica", "potencia"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  tuck_jump: { id: "tuck_jump", discipline: ["box"], movement_pattern: "jump", stimulus: ["potencia"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["potencia"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  lateral_jump: { id: "lateral_jump", discipline: ["box", "carrera"], movement_pattern: "jump", stimulus: ["potencia", "coordinacion", "potencia_carrera"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["potencia", "coordinacion", "potencia_carrera"], avoid_with: ["rodilla", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 12 },
  burpee_box_jump: { id: "burpee_box_jump", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica"], equipment: ["cajon"], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, variants: ["burpee", "box_jump"], suitable_for: ["capacidad_glucolitica"], avoid_with: ["rodilla", "tobillo", "muñeca"], fatigue_cost: "alto", recovery_cost_horas: 24 },
  burpee_box_step_up: { id: "burpee_box_step_up", discipline: ["box"], movement_pattern: "jump", stimulus: ["capacidad_glucolitica"], equipment: ["cajon"], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["burpee", "box_step_up"], suitable_for: ["capacidad_glucolitica"], avoid_with: ["muñeca"], fatigue_cost: "medio", recovery_cost_horas: 12 },

  // --- FUERZA/POTENCIA PARA CORREDORES ---
  nordic_curl: { id: "nordic_curl", discipline: ["box", "carrera"], movement_pattern: "hinge", stimulus: ["fuerza_corredor", "cadena_posterior"], equipment: [], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_corredor", "cadena_posterior"], avoid_with: ["isquio"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  calf_raise: { id: "calf_raise", discipline: ["box", "carrera"], movement_pattern: "hinge", stimulus: ["fuerza_corredor"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["fuerza_corredor"], avoid_with: ["gemelo", "tobillo"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  hip_thrust: { id: "hip_thrust", discipline: ["box", "carrera"], movement_pattern: "hinge", stimulus: ["fuerza_corredor", "potencia_carrera"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, suitable_for: ["fuerza_corredor", "potencia_carrera"], avoid_with: ["lumbar", "cadera"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  bounding: { id: "bounding", discipline: ["carrera"], movement_pattern: "jump", stimulus: ["potencia_carrera", "economia_carrera"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "bajo", scalable: true, suitable_for: ["potencia_carrera", "economia_carrera"], avoid_with: ["rodilla_aguda", "gemelo", "tobillo"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  strides: { id: "strides", discipline: ["carrera"], movement_pattern: "run", stimulus: ["economia_carrera", "velocidad"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["economia_carrera", "velocidad"], avoid_with: ["isquio", "gemelo"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  skipping_a: { id: "skipping_a", discipline: ["carrera"], movement_pattern: "run", stimulus: ["economia_carrera"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["economia_carrera"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  skipping_b: { id: "skipping_b", discipline: ["carrera"], movement_pattern: "run", stimulus: ["economia_carrera"], equipment: [], technical_demand: "alta", impact: "medio", axial_load: "bajo", scalable: true, variants: ["skipping_a"], suitable_for: ["economia_carrera"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
  ankling: { id: "ankling", discipline: ["carrera"], movement_pattern: "run", stimulus: ["economia_carrera"], equipment: [], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["economia_carrera"], fatigue_cost: "bajo", recovery_cost_horas: 6 },

  // --- PRIORIDAD 2: variantes tecnicas (tempo/pausa/deficit/unilateral) ---
  back_squat_pausa: { id: "back_squat_pausa", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_maxima", "tecnica"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "alto", scalable: true, variants: ["back_squat"], suitable_for: ["fuerza_maxima", "tecnica"], avoid_with: ["rodilla", "lumbar"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  deficit_deadlift: { id: "deficit_deadlift", discipline: ["box"], movement_pattern: "hinge", stimulus: ["fuerza_maxima", "cadena_posterior"], equipment: ["barra"], technical_demand: "alta", impact: "bajo", axial_load: "alto", scalable: false, variants: ["deadlift"], suitable_for: ["fuerza_maxima", "cadena_posterior"], avoid_with: ["lumbar"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  tempo_squat: { id: "tempo_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["hipertrofia", "tecnica"], equipment: ["barra"], technical_demand: "media", impact: "bajo", axial_load: "medio", scalable: true, variants: ["back_squat", "back_squat_pausa"], suitable_for: ["hipertrofia", "tecnica"], avoid_with: ["rodilla", "lumbar"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  single_leg_box_squat: { id: "single_leg_box_squat", discipline: ["box"], movement_pattern: "squat", stimulus: ["fuerza_general", "coordinacion"], equipment: ["cajon"], technical_demand: "alta", impact: "bajo", axial_load: "bajo", scalable: true, regressions: ["box_step_up"], suitable_for: ["fuerza_general", "coordinacion"], avoid_with: ["rodilla"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  close_grip_bench: { id: "close_grip_bench", discipline: ["box"], movement_pattern: "horizontal_push", stimulus: ["hipertrofia", "fuerza_general"], equipment: ["barra", "banco"], technical_demand: "media", impact: "bajo", axial_load: "bajo", scalable: true, variants: ["bench_press"], suitable_for: ["hipertrofia", "fuerza_general"], avoid_with: ["hombro", "muñeca"], fatigue_cost: "medio", recovery_cost_horas: 24 },
};

// ============================================================
// CARRERA — movimientos/tipos de sesion completos
// ============================================================
const MOVIMIENTOS_CARRERA: Record<string, Movimiento> = {
  rodaje_z1: { id: "rodaje_z1", discipline: ["carrera"], movement_pattern: "run", stimulus: ["recuperacion_activa"], equipment: [], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["recuperacion_activa"], avoid_with: ["rodilla_aguda"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  rodaje_z2: { id: "rodaje_z2", discipline: ["carrera"], movement_pattern: "run", stimulus: ["base_aerobica"], equipment: [], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["rodaje_largo"], suitable_for: ["base_aerobica"], avoid_with: ["rodilla_aguda"], fatigue_cost: "medio", recovery_cost_horas: 18 },
  rodaje_largo: { id: "rodaje_largo", discipline: ["carrera"], movement_pattern: "run", stimulus: ["base_aerobica", "resistencia_especifica"], equipment: [], technical_demand: "baja", impact: "medio", axial_load: "bajo", scalable: true, variants: ["rodaje_z2"], suitable_for: ["base_aerobica", "resistencia_especifica"], avoid_with: ["rodilla_aguda"], fatigue_cost: "alto", recovery_cost_horas: 36 },
  tempo_run: { id: "tempo_run", discipline: ["carrera"], movement_pattern: "run", stimulus: ["umbral"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["umbral"], avoid_with: ["rodilla_aguda"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  series_umbral: { id: "series_umbral", discipline: ["carrera"], movement_pattern: "run", stimulus: ["umbral"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, variants: ["tempo_run", "series_vo2max"], suitable_for: ["umbral"], avoid_with: ["rodilla_aguda"], fatigue_cost: "alto", recovery_cost_horas: 36 },
  series_vo2max: { id: "series_vo2max", discipline: ["carrera"], movement_pattern: "run", stimulus: ["vo2max"], equipment: [], technical_demand: "alta", impact: "alto", axial_load: "bajo", scalable: false, suitable_for: ["vo2max"], avoid_with: ["rodilla_aguda", "gemelo"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  fartlek: { id: "fartlek", discipline: ["carrera"], movement_pattern: "run", stimulus: ["vo2max", "umbral"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["vo2max", "umbral"], avoid_with: ["rodilla_aguda"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  cuestas: { id: "cuestas", discipline: ["carrera"], movement_pattern: "run", stimulus: ["potencia_carrera", "vo2max"], equipment: [], technical_demand: "media", impact: "alto", axial_load: "medio", scalable: true, suitable_for: ["potencia_carrera", "vo2max"], avoid_with: ["rodilla_aguda", "gemelo"], fatigue_cost: "alto", recovery_cost_horas: 36 },
  sprint: { id: "sprint", discipline: ["carrera"], movement_pattern: "run", stimulus: ["velocidad"], equipment: [], technical_demand: "alta", impact: "alto", axial_load: "bajo", scalable: false, suitable_for: ["velocidad"], avoid_with: ["isquio", "gemelo"], fatigue_cost: "alto", recovery_cost_horas: 48 },
  drills_tecnica: { id: "drills_tecnica", discipline: ["carrera"], movement_pattern: "run", stimulus: ["economia_carrera"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["economia_carrera"], fatigue_cost: "bajo", recovery_cost_horas: 12 },
  progresivo: { id: "progresivo", discipline: ["carrera"], movement_pattern: "run", stimulus: ["base_aerobica", "umbral"], equipment: [], technical_demand: "media", impact: "medio", axial_load: "bajo", scalable: true, suitable_for: ["base_aerobica", "umbral"], avoid_with: ["rodilla_aguda"], fatigue_cost: "medio", recovery_cost_horas: 24 },
  regenerativo: { id: "regenerativo", discipline: ["carrera"], movement_pattern: "run", stimulus: ["recuperacion_activa"], equipment: [], technical_demand: "baja", impact: "bajo", axial_load: "bajo", scalable: true, suitable_for: ["recuperacion_activa"], fatigue_cost: "bajo", recovery_cost_horas: 8 },
};

export const MOVEMENT_LIBRARY: Record<string, Movimiento> = { ...MOVIMIENTOS_BOX, ...MOVIMIENTOS_CARRERA };

// ============================================================
// NIVEL 2 — ESTIMULOS
// ============================================================
export interface Estimulo {
  id: string;
  discipline: "box" | "carrera" | "fuerza";
  descripcion: string;
  sistema_energetico: "fosfageno" | "glucolitico" | "aerobico" | "mixto";
}

export const STIMULUS_LIBRARY: Record<string, Estimulo> = {
  // Box
  fuerza_maxima: { id: "fuerza_maxima", discipline: "box", descripcion: "Cargas altas, bajas repeticiones, foco en 1RM/fuerza absoluta", sistema_energetico: "fosfageno" },
  hipertrofia: { id: "hipertrofia", discipline: "box", descripcion: "Volumen moderado-alto, tension muscular sostenida", sistema_energetico: "mixto" },
  halterofilia_tecnica: { id: "halterofilia_tecnica", discipline: "box", descripcion: "Snatch/clean&jerk con foco tecnico, no maxima carga", sistema_energetico: "fosfageno" },
  halterofilia_soporte: { id: "halterofilia_soporte", discipline: "box", descripcion: "Fuerza que sostiene la halterofilia (pulls, front squat)", sistema_energetico: "fosfageno" },
  potencia: { id: "potencia", discipline: "box", descripcion: "Velocidad de ejecucion con carga submaxima", sistema_energetico: "fosfageno" },
  gimnasticos: { id: "gimnasticos", discipline: "box", descripcion: "Movimientos de peso corporal, control y fuerza relativa", sistema_energetico: "mixto" },
  capacidad_glucolitica: { id: "capacidad_glucolitica", discipline: "box", descripcion: "Esfuerzo intenso 1-5min, metcons cortos-medios", sistema_energetico: "glucolitico" },
  capacidad_aerobica: { id: "capacidad_aerobica", discipline: "box", descripcion: "Esfuerzo sostenido, base metabolica", sistema_energetico: "aerobico" },
  cadena_posterior: { id: "cadena_posterior", discipline: "box", descripcion: "Hinge/deadlift pattern, gluteo-isquios-lumbar", sistema_energetico: "fosfageno" },
  fuerza_general: { id: "fuerza_general", discipline: "box", descripcion: "Trabajo de fuerza no especializado, base/regresion", sistema_energetico: "mixto" },
  tecnica: { id: "tecnica", discipline: "box", descripcion: "Foco en calidad de movimiento, carga baja", sistema_energetico: "mixto" },
  coordinacion: { id: "coordinacion", discipline: "box", descripcion: "Destreza motora, no carga metabolica ni de fuerza", sistema_energetico: "mixto" },
  movilidad_tecnica: { id: "movilidad_tecnica", discipline: "box", descripcion: "Rango de movimiento bajo carga tecnica", sistema_energetico: "mixto" },
  // Carrera
  recuperacion_activa: { id: "recuperacion_activa", discipline: "carrera", descripcion: "Muy baja intensidad, favorece recuperacion", sistema_energetico: "aerobico" },
  base_aerobica: { id: "base_aerobica", discipline: "carrera", descripcion: "Z2, volumen, capacidad aerobica de base", sistema_energetico: "aerobico" },
  umbral: { id: "umbral", discipline: "carrera", descripcion: "Ritmo sostenible cerca del umbral anaerobico", sistema_energetico: "mixto" },
  vo2max: { id: "vo2max", discipline: "carrera", descripcion: "Intervalos cortos-medios a intensidad alta", sistema_energetico: "glucolitico" },
  velocidad: { id: "velocidad", discipline: "carrera", descripcion: "Sprints, maxima velocidad, series muy cortas", sistema_energetico: "fosfageno" },
  economia_carrera: { id: "economia_carrera", discipline: "carrera", descripcion: "Tecnica, eficiencia de zancada", sistema_energetico: "mixto" },
  potencia_carrera: { id: "potencia_carrera", discipline: "carrera", descripcion: "Cuestas, fuerza aplicada a la zancada", sistema_energetico: "mixto" },
  resistencia_especifica: { id: "resistencia_especifica", discipline: "carrera", descripcion: "Volumen especifico a la distancia objetivo", sistema_energetico: "aerobico" },
  fuerza_corredor: { id: "fuerza_corredor", discipline: "carrera", descripcion: "Fuerza complementaria para corredores — resistencia a lesion y economia", sistema_energetico: "fosfageno" },
};

// ============================================================
// FUNCIONES DE CONSULTA — el motor las usa, el LLM nunca decide directamente
// FIX: discipline es ahora array — .includes() en vez de === para soportar movimientos
// multidisciplinares (ej: goblet_squat valido en box Y carrera)
// ============================================================

export function getMovimientosPorEstimulo(estimuloId: string, disciplina: string): Movimiento[] {
  return Object.values(MOVEMENT_LIBRARY).filter(
    m => m.discipline.includes(disciplina as any) && m.suitable_for.includes(estimuloId)
  );
}

export function getMovimientosCompatiblesConRestriccion(estimuloId: string, disciplina: string, zonasRestringidas: string[]): Movimiento[] {
  return getMovimientosPorEstimulo(estimuloId, disciplina).filter(
    m => !m.avoid_with?.some(zona => zonasRestringidas.includes(zona))
  );
}

// Diversificacion controlada: dado un historial reciente de movement_ids usados, sugiere
// evitar repetir el mismo movimiento si ya tuvo exposicion reciente alta para el mismo estimulo.
export function sugerirMovimientoNoRepetido(estimuloId: string, disciplina: string, zonasRestringidas: string[], idsRecientes: string[]): Movimiento | null {
  const candidatos = getMovimientosCompatiblesConRestriccion(estimuloId, disciplina, zonasRestringidas);
  const noRepetidos = candidatos.filter(m => !idsRecientes.includes(m.id));
  return (noRepetidos[0] || candidatos[0]) || null;
}

export function getEstimulosDeDisciplina(disciplina: string): Estimulo[] {
  return Object.values(STIMULUS_LIBRARY).filter(e => e.discipline === disciplina);
}

// ============================================================
// FASE 4 — RANKING DE CANDIDATOS: el Session Builder recibe candidatos YA priorizados,
// no elige libremente sobre toda la libreria. El ranking combina exposicion reciente
// (menos expuesto = mas prioritario) y restricciones activas, de forma determinista.
// ============================================================
export interface CandidatoMovimiento extends Movimiento {
  vecesExpuestoReciente: number;
  prioridadRanking: number; // menor = mas prioritario
}

export function rankearCandidatos(
  estimuloId: string,
  disciplina: string,
  zonasRestringidas: string[],
  exposicionesRecientes: { movementId: string; vecesUltimas4Semanas: number }[]
): CandidatoMovimiento[] {
  const candidatosValidos = getMovimientosCompatiblesConRestriccion(estimuloId, disciplina, zonasRestringidas);
  const mapaExposicion = new Map(exposicionesRecientes.map(e => [e.movementId, e.vecesUltimas4Semanas]));

  return candidatosValidos
    .map(m => ({
      ...m,
      vecesExpuestoReciente: mapaExposicion.get(m.id) || 0,
      prioridadRanking: mapaExposicion.get(m.id) || 0,
    }))
    .sort((a, b) => a.prioridadRanking - b.prioridadRanking);
}

// ============================================================
// FASE 5 — VALIDADOR DE COHERENCIA ESTIMULO-SESION: verifica que la sesion generada
// realmente sirva al estimulo que el Week Planner decidio, no solo que "pertenezca" a
// la disciplina correcta. Deterministico — nunca confia en que el LLM se haya autoevaluado.
// ============================================================
export interface ValidacionEstimulo {
  valido: boolean;
  motivo: string;
}

export function validarCoherenciaEstimulo(
  estimuloObjetivo: string,
  disciplina: string,
  descripcionSesion: string
): ValidacionEstimulo {
  const movimientosDelEstimulo = getMovimientosPorEstimulo(estimuloObjetivo, disciplina);
  if (movimientosDelEstimulo.length === 0) {
    return { valido: true, motivo: "Estimulo sin movimientos catalogados aun, no se puede validar por biblioteca — se acepta por defecto." };
  }
  const textoNormalizado = descripcionSesion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const algunoAparece = movimientosDelEstimulo.some(m => {
    const terminos = [m.id.replace(/_/g, " "), m.id.replace(/_/g, "-")];
    return terminos.some(t => textoNormalizado.includes(t));
  });
  if (!algunoAparece) {
    return {
      valido: false,
      motivo: `La sesion no contiene ningun movimiento asociado al estimulo "${estimuloObjetivo}" (candidatos esperados: ${movimientosDelEstimulo.map(m => m.id).join(", ")}). Puede que el Session Builder haya generado el estimulo equivocado.`
    };
  }
  return { valido: true, motivo: "Movimiento coherente con el estimulo objetivo." };
}