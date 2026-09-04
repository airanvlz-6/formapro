// FORGE READINESS ENGINE V1 — score 0-100 real, calculado a partir del baseline personal del
// atleta (nunca valores absolutos genericos). Combina 4 pilares con pesos iniciales, y determina
// el nivel de CONFIANZA segun cuantos dias de historico real existen — nunca muestra un numero
// "inventado" con datos insuficientes, usa el estado BUILDING BASELINE en su lugar.
//
// REGLA ARQUITECTONICA: Readiness es un ESTADO OBSERVADO, nunca un trigger automatico de
// modificacion de sesion. La decision de ajustar pertenece a una capa superior (Forge Decision
// Engine), que solo actua tras confirmacion EXPLICITA del usuario. Este motor solo calcula y
// explica el numero — nunca decide ni ejecuta cambios en la planificacion.

import { PuntoFisiologico, calcularBaselinePersonal, compararConBaseline, ComparacionHoy, BaselinePersonal } from './personalBaselineEngine';

export type PreparedReadinessBaselines = Record<'hrv' | 'rhr' | 'duracionSueno', BaselinePersonal>;

export interface ReadinessResultado {
  score: number | null; // 0-100, o null si confianza es "insuficiente"
  estado: 'BUILDING_BASELINE' | 'EARLY_READINESS' | 'READY';
  nivelConfianza: 'insuficiente' | 'aprendiendo' | 'estable'; // basado en dias de historico (baseline)
  // FIX: separado de nivelConfianza — dataCompleteness mide cuantas señales del DIA DE HOY estan
  // realmente disponibles (0-100), independiente de cuantos dias de historico tenga el baseline.
  // Un atleta con baseline "estable" (28+ dias) puede tener dataCompleteness bajo HOY si HealthKit
  // aun no midio HRV/RHR esta mañana — son preguntas distintas: "¿confio en mi baseline?" vs
  // "¿tengo los datos de hoy?"
  dataCompleteness: number;
  missingSignals: string[];
  contribuyentes: {
    hrv: ComparacionHoy | null;
    rhr: ComparacionHoy | null;
    duracionSueno: ComparacionHoy | null;
    // FIX SEMANTICO: renombrado de 'carga' a 'frecuencia' — la señal real que alimenta este pilar
    // (calcularFrecuenciaRealRelativa) mide UTILIZACION de disponibilidad (sesiones completadas /
    // dias declarados), nunca carga fisiologica real (volumen x intensidad). Llamarlo "carga"
    // habria sido una falsa precision fisiologica que Forge todavia no puede sostener con datos.
    frecuencia: { valor: 'baja' | 'normal' | 'alta'; descripcion: string } | null;
  };
  resumenTexto: string; // frase corta explicando el porque, para mostrar en UI
}

const PESOS = { hrv: 0.30, rhr: 0.25, duracionSueno: 0.25, frecuencia: 0.20 };

// Convierte una comparacion (desviacion Z) a una puntuacion parcial 0-100 para ese pilar.
// Z=0 (exactamente en el baseline) = 70 puntos (neutral-bueno, no "malo por defecto").
// Z=+1.5 o mas = 100. Z=-1.5 o menos = 30. Escala lineal entre medio.
function comparacionAPuntuacion(comparacion: ComparacionHoy): number {
  const z = comparacion.desviacionZ;
  const puntuacion = 70 + (z * 20); // cada desviacion estandar mueve +/-20 puntos desde el neutral 70
  return Math.max(0, Math.min(100, Math.round(puntuacion)));
}

function frecuenciaAPuntuacion(nivelFrecuencia: 'baja' | 'normal' | 'alta'): number {
  if (nivelFrecuencia === 'baja') return 85; // frecuencia baja = mas margen para entrenar fuerte
  if (nivelFrecuencia === 'alta') return 45; // frecuencia alta reciente = menos margen
  return 70; // normal
}

/**
 * Calcula el Readiness real del atleta para HOY, a partir de su historico de physiology_records
 * (ya consultado por el caller) y una estimacion simple de carga reciente (0-1, ya calculada
 * por el caller a partir de weekly_plan/workout_history).
 */
export function calcularReadiness(
  historicoFisiologico: PuntoFisiologico[], // ya ordenado mas reciente primero, incluye HOY en [0]
  cargaRecienteRelativa: number, // 0-1, ej: volumen_relativo del ciclo actual o similar
  preparedBaselines?: PreparedReadinessBaselines // Canonical adapter selects real prior observations per signal.
): ReadinessResultado {
  const hoy = historicoFisiologico[0];
  const historicoSinHoy = historicoFisiologico.slice(1); // el baseline se calcula SIN el dia de hoy

  if (!hoy) {
    return {
      score: null, estado: 'BUILDING_BASELINE', nivelConfianza: 'insuficiente',
      dataCompleteness: 0, missingSignals: ['hrv', 'rhr', 'duracionSueno'],
      contribuyentes: { hrv: null, rhr: null, duracionSueno: null, frecuencia: null },
      resumenTexto: 'Necesitamos algunos días de datos para conocer tu normal.',
    };
  }

  const baselineHrv = preparedBaselines?.hrv ?? calcularBaselinePersonal(historicoSinHoy, 'hrv');
  const baselineRhr = preparedBaselines?.rhr ?? calcularBaselinePersonal(historicoSinHoy, 'rhr');
  const baselineSueno = preparedBaselines?.duracionSueno ?? calcularBaselinePersonal(historicoSinHoy, 'duracionSueno');

  const confianzaMinima = [baselineHrv, baselineRhr, baselineSueno]
    .map(b => b.confianza)
    .reduce((peor, actual) => {
      const orden = { insuficiente: 0, aprendiendo: 1, estable: 2 };
      return orden[actual] < orden[peor] ? actual : peor;
    }, 'estable' as 'insuficiente' | 'aprendiendo' | 'estable');

  if (confianzaMinima === 'insuficiente') {
    return {
      score: null, estado: 'BUILDING_BASELINE', nivelConfianza: 'insuficiente',
      dataCompleteness: 0, missingSignals: ['hrv', 'rhr', 'duracionSueno'],
      contribuyentes: { hrv: null, rhr: null, duracionSueno: null, frecuencia: null },
      resumenTexto: 'Necesitamos algunos días de datos para conocer tu normal.',
    };
  }

  const compHrv = hoy.hrv !== null ? compararConBaseline(hoy.hrv, baselineHrv) : null;
  const compRhr = hoy.rhr !== null ? compararConBaseline(hoy.rhr, baselineRhr) : null;
  const compSueno = hoy.duracionSueno !== null ? compararConBaseline(hoy.duracionSueno, baselineSueno) : null;

  const nivelCarga: 'baja' | 'normal' | 'alta' = cargaRecienteRelativa < 0.4 ? 'baja' : cargaRecienteRelativa > 0.75 ? 'alta' : 'normal';

  const puntuaciones: number[] = [];
  const pesosUsados: number[] = [];
  if (compHrv) { puntuaciones.push(comparacionAPuntuacion(compHrv) * PESOS.hrv); pesosUsados.push(PESOS.hrv); }
  if (compRhr) { puntuaciones.push(comparacionAPuntuacion(compRhr) * PESOS.rhr); pesosUsados.push(PESOS.rhr); }
  if (compSueno) { puntuaciones.push(comparacionAPuntuacion(compSueno) * PESOS.duracionSueno); pesosUsados.push(PESOS.duracionSueno); }
  puntuaciones.push(frecuenciaAPuntuacion(nivelCarga) * PESOS.frecuencia);
  pesosUsados.push(PESOS.frecuencia);

  const sumaPesos = pesosUsados.reduce((a, b) => a + b, 0);
  const score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / sumaPesos);

  const estado = confianzaMinima === 'aprendiendo' ? 'EARLY_READINESS' : 'READY';

  // Resumen: identifica el contribuyente mas destacado (mejor o peor) para dar contexto real
  const comparacionesValidas = [compHrv, compRhr, compSueno].filter((c): c is ComparacionHoy => c !== null);
  const masDesfavorable = comparacionesValidas.filter(c => c.direccion === 'desfavorable').sort((a, b) => a.desviacionZ - b.desviacionZ)[0];
  const masFavorable = comparacionesValidas.filter(c => c.direccion === 'favorable').sort((a, b) => b.desviacionZ - a.desviacionZ)[0];

  // FIX: mensaje SIEMPRE derivado del estado real (READY/MODERATE/RECOVER/RESET), nunca la
  // misma frase generica por defecto — coherente con que el usuario debe poder leer "por que"
  // en la misma frase que ve el numero, sin necesitar interpretarlo el mismo.
  const estadoParaMensaje = score >= 80 ? 'READY' : score >= 60 ? 'MODERATE' : score >= 40 ? 'RECOVER' : 'RESET';
  let resumenTexto =
    estadoParaMensaje === 'READY' ? 'Tu recuperación está por encima de tu normal.' :
    estadoParaMensaje === 'MODERATE' ? 'Tu recuperación está dentro de tu rango habitual.' :
    estadoParaMensaje === 'RECOVER' ? 'Tu recuperación está por debajo de tu normal.' :
    'Tus señales indican que necesitas recuperar.';
  if (score >= 80 && masFavorable) resumenTexto = `Tu recuperación está por encima de tu normal. Hoy tienes margen para una sesión exigente.`;
  else if (score < 50 && masDesfavorable) resumenTexto = `Tu ${masDesfavorable.metrica === 'hrv' ? 'HRV' : masDesfavorable.metrica === 'rhr' ? 'FC en reposo' : 'sueño'} está por debajo de tu normal.`;
  else if (nivelCarga === 'alta') resumenTexto = 'Vienes acumulando carga elevada en los últimos días.';

  // FIX: dataCompleteness/missingSignals separado de nivelConfianza (baseline historico).
  // Mide especificamente cuantas de las 3 señales fisiologicas del DIA DE HOY estan disponibles
  // (peso real usado / peso total posible de esos 3 pilares), para comunicar honestamente cuando
  // el score se calculo con datos parciales (ej: HRV/RHR ausentes hoy), sin deformar el score en
  // si — Score y Confidence quedan como dos preguntas separadas, coherente con la arquitectura.
  const pesoMaximoTresSeniales = PESOS.hrv + PESOS.rhr + PESOS.duracionSueno;
  const pesoRealUsadoTresSeniales = (compHrv ? PESOS.hrv : 0) + (compRhr ? PESOS.rhr : 0) + (compSueno ? PESOS.duracionSueno : 0);
  const dataCompleteness = Math.round((pesoRealUsadoTresSeniales / pesoMaximoTresSeniales) * 100);
  const missingSignals: string[] = [];
  if (!compHrv) missingSignals.push('hrv');
  if (!compRhr) missingSignals.push('rhr');
  if (!compSueno) missingSignals.push('duracionSueno');

  return {
    score,
    estado,
    nivelConfianza: confianzaMinima,
    dataCompleteness,
    missingSignals,
    contribuyentes: {
      hrv: compHrv, rhr: compRhr, duracionSueno: compSueno,
      frecuencia: { valor: nivelCarga, descripcion: nivelCarga === 'alta' ? 'Frecuencia elevada reciente' : nivelCarga === 'baja' ? 'Frecuencia baja, buen margen' : 'Frecuencia dentro de lo habitual' },
    },
    resumenTexto,
  };
}

// ============================================================
// FORGE STATE — traduce el score numerico a un estado comprensible. El NUMERO no es el
// producto, el ESTADO es el producto (coherente con el diseño: "87 - READY", no solo "87").
// ============================================================
export type ForgeStateLabel = 'READY' | 'MODERATE' | 'RECOVER' | 'RESET';

export function scoreAForgeState(score: number | null): ForgeStateLabel | null {
  if (score === null) return null;
  if (score >= 80) return 'READY';
  if (score >= 60) return 'MODERATE';
  if (score >= 40) return 'RECOVER';
  return 'RESET';
}

// ============================================================
// SUBJECTIVE CHECK-IN COMO SEÑAL — nunca modifica el score de Readiness. Se combina con el
// resultado como CONTEXTO adicional, para que Forge pueda detectar discrepancias reales
// (ej: datos fisiologicos buenos + atleta reporta fatiga alta = señal a revisar, no promedio).
// ============================================================
export type NivelFatigaPercibida = 1 | 2 | 3 | 4 | 5; // 1=muy mal, 5=con energia

export interface ContextoConCheckin {
  readiness: ReadinessResultado;
  fatigaPercibida: NivelFatigaPercibida | null;
  hayDiscrepancia: boolean; // true si datos fisiologicos buenos pero percepcion mala, o viceversa
  mensajeDiscrepancia: string | null;
}

export function combinarConCheckinSubjetivo(readiness: ReadinessResultado, fatigaPercibida: NivelFatigaPercibida | null): ContextoConCheckin {
  if (fatigaPercibida === null || readiness.score === null) {
    return { readiness, fatigaPercibida, hayDiscrepancia: false, mensajeDiscrepancia: null };
  }

  const fisiologiaFavorable = readiness.score >= 70;
  const percepcionMala = fatigaPercibida <= 2;
  const fisiologiaDesfavorable = readiness.score < 50;
  const percepcionBuena = fatigaPercibida >= 4;

  let hayDiscrepancia = false;
  let mensajeDiscrepancia: string | null = null;

  if (fisiologiaFavorable && percepcionMala) {
    hayDiscrepancia = true;
    mensajeDiscrepancia = `Tus datos fisiológicos son favorables, pero hoy reportas fatiga alta. Forge no ha modificado tu sesión automáticamente.`;
  } else if (fisiologiaDesfavorable && percepcionBuena) {
    hayDiscrepancia = true;
    mensajeDiscrepancia = `Tu percepción es buena, aunque tus datos fisiológicos están algo por debajo de tu normal.`;
  }

  return { readiness, fatigaPercibida, hayDiscrepancia, mensajeDiscrepancia };
}
