// FORGE BUILD 8A — estado de planificacion DERIVADO (puro, sin DB, sin efectos).
//
// ACCOUNT CREATED != PLANNING PROFILE READY. Este modulo es la unica fuente de "que le falta a este
// atleta para su modo": se calcula siempre desde el estado canonico (usuarios + fuentes de
// entrenamiento activas), nunca desde un boolean persistido que alguien deba acordarse de escribir
// (`usuarios.onboarding_completado` no es autoridad de nada aqui).
//
// Los requisitos por modo (CAMPOS_REQUERIDOS_POR_MODO) y su calculo vivian dentro de
// app/api/chat/route.ts (`calcularEstadoOnboarding`). Se mueven aqui SIN cambiar su semantica para que
// el motor de cambio de modo / confirmar_onboarding y el estado derivado compartan una sola
// implementacion. No se anaden ni se quitan requisitos.

import { hasCanonicalSpecialty, requiresPlanningSpecialty } from '../sports/canonicalSpecialty';

/** Modo de una cuenta que solo tiene identidad: sin planificacion, sin perfil de planificacion. */
export const FREE_MODE = 'free';

// FORGE ONBOARDING STATE MACHINE — campos OBLIGATORIOS por modo. Sin cambios respecto al route.
// Un modo sin entrada aqui (p. ej. 'planificacion', 'consulta', desconocido o null) usa el nucleo de
// `supervision`, igual que antes; `requiresPlanningSpecialty` anade `especialidad` donde corresponde.
export const CAMPOS_REQUERIDOS_POR_MODO: Record<string, string[]> = {
  supervision: ['categoria', 'objetivo', 'edad', 'nivel'],
  coach: ['categoria', 'objetivo', 'edad', 'nivel', 'disponibilidad', 'duracion_sesion'],
  focus: ['categoria', 'objetivo', 'edad', 'nivel', 'duracion_sesion', 'disciplina_forge', 'dias_forge', 'disciplina_externa', 'dias_externos', 'fc_max_o_metodo'],
};

type TrainingSourceRow = { owner?: unknown; dias?: unknown; activo?: unknown };
export type OnboardingSnapshot = {
  modo_entrada?: unknown;
  categoria?: unknown;
  especialidad?: unknown;
  perfil?: unknown;
  objetivo_principal?: unknown;
  distribucion_semanal?: unknown;
  /** Fuentes de entrenamiento ACTIVAS del atleta (athlete_training_sources). */
  trainingSources?: readonly TrainingSourceRow[] | null;
};

export type OnboardingFields = {
  completedFields: Record<string, boolean>;
  missingFields: string[];
  camposRequeridos: string[];
};

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
// Misma comprobacion que el route original (`f.dias?.length > 0`), sin cambiar que formas acepta.
const hasDays = (s: TrainingSourceRow) => ((s.dias as { length?: number } | null | undefined)?.length ?? 0) > 0;

/** Calculo puro de campos completados/faltantes para `mode`. Misma logica que calcularEstadoOnboarding. */
export function computeOnboardingFields(snapshot: OnboardingSnapshot, mode: string): OnboardingFields {
  const perfil = isRecord(snapshot.perfil) ? snapshot.perfil : {};
  const objetivoPrincipal = isRecord(snapshot.objetivo_principal) ? snapshot.objetivo_principal : {};
  const sources = (snapshot.trainingSources ?? []).filter(s => isRecord(s) && s.activo !== false);

  const completedFields: Record<string, boolean> = {};
  completedFields.categoria = !!snapshot.categoria;
  if (requiresPlanningSpecialty(mode)) completedFields.especialidad = hasCanonicalSpecialty(snapshot.especialidad);
  // `perfil.objetivo_general` es donde bootstrapNewAthlete escribe el objetivo (y lo leen los consumidores
  // reales de objetivo: goalResolution / athletePrescriptionContext), asi que cuenta como objetivo.
  const objetivoGeneral = typeof perfil.objetivo_general === 'string' && perfil.objetivo_general.trim().length > 0;
  completedFields.objetivo = !!(objetivoPrincipal.descripcion || perfil.objetivo_detalle || objetivoGeneral);
  completedFields.edad = !!perfil.edad;
  // distintas categorias usan IDs distintos para "nivel": se reconoce cualquier variante real.
  completedFields.nivel = !!(perfil.nivel || perfil.nivel_cf || perfil.nivel_hyrox || perfil.nivel_ocr || perfil.nivel_carrera || perfil.experiencia_fuerza);
  completedFields.disponibilidad = !!snapshot.distribucion_semanal;
  completedFields.duracion_sesion = !!perfil.duracion;
  completedFields.disciplina_forge = sources.some(s => s.owner === 'forge');
  completedFields.dias_forge = sources.some(s => s.owner === 'forge' && hasDays(s));
  completedFields.disciplina_externa = sources.some(s => s.owner === 'external');
  completedFields.dias_externos = sources.some(s => s.owner === 'external' && hasDays(s));
  // fc_max se captura en el formulario general (solo si hay pulsometro); sin dispositivo se usa la
  // formula por edad, asi que se considera completado en cuanto existe `perfil.edad`.
  completedFields.fc_max_o_metodo = !!perfil.edad;

  const base = CAMPOS_REQUERIDOS_POR_MODO[mode] || CAMPOS_REQUERIDOS_POR_MODO.supervision;
  const camposRequeridos = requiresPlanningSpecialty(mode) ? [...base, 'especialidad'] : base;
  const missingFields = camposRequeridos.filter(c => !completedFields[c]);
  return { completedFields, missingFields, camposRequeridos };
}

export type PlanningProfileStatus = {
  /** `modo_entrada` almacenado tal cual (sin renombrar vocabularios), o null si no hay. */
  mode: string | null;
  /** true solo si el modo exige planning profile y esta completo. Free nunca es "ready". */
  ready: boolean;
  /** Requisitos del modo que aun no se cumplen. Free no tiene requisitos: siempre []. */
  missingFields: string[];
};

/**
 * Estado de planificacion derivado de un atleta. Determinista y sin efectos secundarios.
 *
 * - FREE: cuenta solo con identidad. `ready:false` respecto a planificacion NO es un error y no
 *   impide usar Forge Free; no tiene campos pendientes porque no hay modo de planificacion que
 *   los pida.
 * - Resto de modos: requisitos reales del modo (CAMPOS_REQUERIDOS_POR_MODO). Un modo ausente o
 *   desconocido se evalua con el nucleo de supervision, igual que el motor de onboarding actual.
 */
export function resolvePlanningProfileStatus(athlete: OnboardingSnapshot): PlanningProfileStatus {
  const raw = athlete?.modo_entrada;
  const mode = typeof raw === 'string' && raw.trim() ? raw : null;
  if (mode === FREE_MODE) return { mode, ready: false, missingFields: [] };
  const { missingFields } = computeOnboardingFields(athlete ?? {}, mode ?? '');
  return { mode, ready: missingFields.length === 0, missingFields };
}

/**
 * Semantica LEGACY de `verificar_onboarding_completado.completado` (la lee Mobile hoy): "nada
 * bloquea la entrada a la app". Free no tiene onboarding pendiente => true. Resto => `ready`.
 */
export function legacyOnboardingCompleted(status: PlanningProfileStatus): boolean {
  return status.mode === FREE_MODE ? true : status.ready;
}
