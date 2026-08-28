// FORGE SUBSTITUTION ENGINE — modela explícitamente cuándo una sesión que NO usa el movimiento
// primario prescrito sigue siendo coherente, porque existe una sustitución válida condicionada
// por una restricción activa. Evita el error de decir "bici_estatica === rodaje_largo" (falso
// en general) mientras reconoce que SÍ es una sustitución legítima cuando hay restricción de rodilla.
//
// Hallazgo real que origina esta capa: el Validator marcaba como incoherente una sesión de
// "Bici estática Z2 60min" generada para el estímulo resistencia_especifica (que espera
// rodaje_largo/carrera), cuando en realidad era una sustitución correcta por restricción de rodilla.

export interface RegistroSustitucion {
  movimientoPrimario: string; // id de Movimiento en movementLibrary
  sustitutos: {
    movementIdOSinCatalogar: string; // puede ser un id real de la libreria, o un termino libre si aun no esta catalogado
    condicionRestriccion: string[]; // zonas que, si estan restringidas, habilitan esta sustitucion (ej: "rodilla")
    mantieneEstimulo: boolean; // true si preserva el mismo estimulo fisiologico objetivo
  }[];
}

// V1: sustituciones conocidas para carrera. Se amplia segun se detecten mas casos reales.
export const SUBSTITUTION_MAP: Record<string, RegistroSustitucion> = {
  rodaje_largo: {
    movimientoPrimario: "rodaje_largo",
    sustitutos: [
      { movementIdOSinCatalogar: "bici_estatica", condicionRestriccion: ["rodilla", "tobillo", "rodilla_aguda"], mantieneEstimulo: true },
      { movementIdOSinCatalogar: "row_erg", condicionRestriccion: ["rodilla", "tobillo", "rodilla_aguda"], mantieneEstimulo: true },
      { movementIdOSinCatalogar: "natacion", condicionRestriccion: ["rodilla", "tobillo", "rodilla_aguda", "lumbar"], mantieneEstimulo: true },
    ],
  },
  rodaje_z2: {
    movimientoPrimario: "rodaje_z2",
    sustitutos: [
      { movementIdOSinCatalogar: "bici_estatica", condicionRestriccion: ["rodilla", "tobillo", "rodilla_aguda"], mantieneEstimulo: true },
      { movementIdOSinCatalogar: "row_erg", condicionRestriccion: ["rodilla", "tobillo", "rodilla_aguda"], mantieneEstimulo: true },
    ],
  },
  series_vo2max: {
    movimientoPrimario: "series_vo2max",
    sustitutos: [
      { movementIdOSinCatalogar: "bike_erg", condicionRestriccion: ["rodilla_aguda", "gemelo", "tobillo"], mantieneEstimulo: true },
    ],
  },
  back_squat: {
    movimientoPrimario: "back_squat",
    sustitutos: [
      { movementIdOSinCatalogar: "goblet_squat", condicionRestriccion: ["rodilla", "lumbar"], mantieneEstimulo: false }, // reduce carga, no mantiene intensidad del estimulo
    ],
  },
  deadlift: {
    movimientoPrimario: "deadlift",
    sustitutos: [
      { movementIdOSinCatalogar: "rdl", condicionRestriccion: ["lumbar"], mantieneEstimulo: false },
    ],
  },
};

export type ResultadoSustitucion = "coherente_directo" | "sustitucion_valida" | "sustitucion_no_registrada" | "incoherente";

export interface EvaluacionSustitucion {
  resultado: ResultadoSustitucion;
  explicacion: string;
}

/**
 * Evalúa si una sesión que menciona un termino distinto al movimiento primario esperado
 * es una sustitución legítima, dado el estado de restricciones activas del atleta.
 */
export function evaluarSustitucion(
  movimientoPrimarioEsperado: string,
  terminoEncontradoEnSesion: string,
  zonasRestringidasActivas: string[]
): EvaluacionSustitucion {
  const registro = SUBSTITUTION_MAP[movimientoPrimarioEsperado];
  if (!registro) {
    return { resultado: "sustitucion_no_registrada", explicacion: `No hay registro de sustituciones conocidas para "${movimientoPrimarioEsperado}" — no se puede confirmar si es valida.` };
  }
  const sustitutoEncontrado = registro.sustitutos.find(s => terminoEncontradoEnSesion.toLowerCase().includes(s.movementIdOSinCatalogar.replace(/_/g, " ")));
  if (!sustitutoEncontrado) {
    return { resultado: "sustitucion_no_registrada", explicacion: `"${terminoEncontradoEnSesion}" no esta registrado como sustituto conocido de "${movimientoPrimarioEsperado}".` };
  }
  const hayRestriccionQueLoJustifica = sustitutoEncontrado.condicionRestriccion.some(z => zonasRestringidasActivas.includes(z));
  if (hayRestriccionQueLoJustifica) {
    return { resultado: "sustitucion_valida", explicacion: `Sustitución de "${movimientoPrimarioEsperado}" por "${sustitutoEncontrado.movementIdOSinCatalogar}" justificada por restricción activa. Mantiene estímulo: ${sustitutoEncontrado.mantieneEstimulo ? "sí" : "no completamente"}.` };
  }
  return { resultado: "incoherente", explicacion: `"${terminoEncontradoEnSesion}" es un sustituto conocido de "${movimientoPrimarioEsperado}", pero no hay ninguna restricción activa que la justifique — la sustitución no está condicionada correctamente.` };
}