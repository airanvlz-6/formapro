// FORGE READINESS ENGINE V1 — score 0-100 real, calculado a partir del baseline personal del
// atleta (nunca valores absolutos genericos). Combina 4 pilares con pesos iniciales, y determina
// el nivel de CONFIANZA segun cuantos dias de historico real existen — nunca muestra un numero
// "inventado" con datos insuficientes, usa el estado BUILDING BASELINE en su lugar.
//
// REGLA ARQUITECTONICA: Readiness es un ESTADO OBSERVADO, nunca un trigger automatico de
// modificacion de sesion. La decision de ajustar pertenece a una capa superior (Forge Decision
// Engine), que solo actua tras confirmacion EXPLICITA del usuario. Este motor solo calcula y
// explica el numero — nunca decide ni ejecuta cambios en la planificacion.

import { PuntoFisiologico, calcularBaselinePersonal, compararConBaseline, ComparacionHoy } from './personalBaselineEngine';

export interface ReadinessResultado {
  score: number | null; // 0-100, o null si confianza es "insuficiente"
  estado: 'BUILDING_BASELINE' | 'EARLY_READINESS' | 'READY';
  nivelConfianza: 'insuficiente' | 'aprendiendo' | 'estable';
  contribuyentes: {
    hrv: ComparacionHoy | null;
    rhr: ComparacionHoy | null;
    sueno: ComparacionHoy | null;
    carga: { valor: 'baja' | 'normal' | 'alta'; descripcion: string } | null;
  };
  resumenTexto: string; // frase corta explicando el porque, para mostrar en UI
}

const PESOS = { hrv: 0.30, rhr: 0.25, sueno: 0.25, carga: 0.20 };

// Convierte una comparacion (desviacion Z) a una puntuacion parcial 0-100 para ese pilar.
// Z=0 (exactamente en el baseline) = 70 puntos (neutral-bueno, no "malo por defecto").
// Z=+1.5 o mas = 100. Z=-1.5 o menos = 30. Escala lineal entre medio.
function comparacionAPuntuacion(comparacion: ComparacionHoy): number {
  const z = comparacion.desviacionZ;
  const puntuacion = 70 + (z * 20); // cada desviacion estandar mueve +/-20 puntos desde el neutral 70
  return Math.max(0, Math.min(100, Math.round(puntuacion)));
}

function cargaAPuntuacion(nivelCarga: 'baja' | 'normal' | 'alta'): number {
  if (nivelCarga === 'baja') return 85; // carga baja = mas margen para entrenar fuerte
  if (nivelCarga === 'alta') return 45; // carga alta reciente = menos margen
  return 70; // normal
}

/**
 * Calcula el Readiness real del atleta para HOY, a partir de su historico de physiology_records
 * (ya consultado por el caller) y una estimacion simple de carga reciente (0-1, ya calculada
 * por el caller a partir de weekly_plan/workout_history).
 */
export function calcularReadiness(
  historicoFisiologico: PuntoFisiologico[], // ya ordenado mas reciente primero, incluye HOY en [0]
  cargaRecienteRelativa: number // 0-1, ej: volumen_relativo del ciclo actual o similar
): ReadinessResultado {
  const hoy = historicoFisiologico[0];
  const historicoSinHoy = historicoFisiologico.slice(1); // el baseline se calcula SIN el dia de hoy

  if (!hoy) {
    return {
      score: null, estado: 'BUILDING_BASELINE', nivelConfianza: 'insuficiente',
      contribuyentes: { hrv: null, rhr: null, sueno: null, carga: null },
      resumenTexto: 'Necesitamos algunos días de datos para conocer tu normal.',
    };
  }

  const baselineHrv = calcularBaselinePersonal(historicoSinHoy, 'hrv');
  const baselineRhr = calcularBaselinePersonal(historicoSinHoy, 'rhr');
  const baselineSueno = calcularBaselinePersonal(historicoSinHoy, 'sueno');

  const confianzaMinima = [baselineHrv, baselineRhr, baselineSueno]
    .map(b => b.confianza)
    .reduce((peor, actual) => {
      const orden = { insuficiente: 0, aprendiendo: 1, estable: 2 };
      return orden[actual] < orden[peor] ? actual : peor;
    }, 'estable' as 'insuficiente' | 'aprendiendo' | 'estable');

  if (confianzaMinima === 'insuficiente') {
    return {
      score: null, estado: 'BUILDING_BASELINE', nivelConfianza: 'insuficiente',
      contribuyentes: { hrv: null, rhr: null, sueno: null, carga: null },
      resumenTexto: 'Necesitamos algunos días de datos para conocer tu normal.',
    };
  }

  const compHrv = hoy.hrv !== null ? compararConBaseline(hoy.hrv, baselineHrv) : null;
  const compRhr = hoy.rhr !== null ? compararConBaseline(hoy.rhr, baselineRhr) : null;
  const compSueno = hoy.sueno !== null ? compararConBaseline(hoy.sueno, baselineSueno) : null;

  const nivelCarga: 'baja' | 'normal' | 'alta' = cargaRecienteRelativa < 0.4 ? 'baja' : cargaRecienteRelativa > 0.75 ? 'alta' : 'normal';

  const puntuaciones: number[] = [];
  const pesosUsados: number[] = [];
  if (compHrv) { puntuaciones.push(comparacionAPuntuacion(compHrv) * PESOS.hrv); pesosUsados.push(PESOS.hrv); }
  if (compRhr) { puntuaciones.push(comparacionAPuntuacion(compRhr) * PESOS.rhr); pesosUsados.push(PESOS.rhr); }
  if (compSueno) { puntuaciones.push(comparacionAPuntuacion(compSueno) * PESOS.sueno); pesosUsados.push(PESOS.sueno); }
  puntuaciones.push(cargaAPuntuacion(nivelCarga) * PESOS.carga);
  pesosUsados.push(PESOS.carga);

  const sumaPesos = pesosUsados.reduce((a, b) => a + b, 0);
  const score = Math.round(puntuaciones.reduce((a, b) => a + b, 0) / sumaPesos);

  const estado = confianzaMinima === 'aprendiendo' ? 'EARLY_READINESS' : 'READY';

  // Resumen: identifica el contribuyente mas destacado (mejor o peor) para dar contexto real
  const comparacionesValidas = [compHrv, compRhr, compSueno].filter((c): c is ComparacionHoy => c !== null);
  const masDesfavorable = comparacionesValidas.filter(c => c.direccion === 'desfavorable').sort((a, b) => a.desviacionZ - b.desviacionZ)[0];
  const masFavorable = comparacionesValidas.filter(c => c.direccion === 'favorable').sort((a, b) => b.desviacionZ - a.desviacionZ)[0];

  let resumenTexto = 'Tus indicadores están dentro de tu rango habitual.';
  if (score >= 80 && masFavorable) resumenTexto = `Tu recuperación está por encima de tu normal. Hoy tienes margen para una sesión exigente.`;
  else if (score < 50 && masDesfavorable) resumenTexto = `Tu ${masDesfavorable.metrica === 'hrv' ? 'HRV' : masDesfavorable.metrica === 'rhr' ? 'FC en reposo' : 'sueño'} está por debajo de tu normal.`;
  else if (nivelCarga === 'alta') resumenTexto = 'Vienes acumulando carga elevada en los últimos días.';

  return {
    score,
    estado,
    nivelConfianza: confianzaMinima,
    contribuyentes: {
      hrv: compHrv, rhr: compRhr, sueno: compSueno,
      carga: { valor: nivelCarga, descripcion: nivelCarga === 'alta' ? 'Carga elevada reciente' : nivelCarga === 'baja' ? 'Carga baja, buen margen' : 'Carga dentro de lo habitual' },
    },
    resumenTexto,
  };
}