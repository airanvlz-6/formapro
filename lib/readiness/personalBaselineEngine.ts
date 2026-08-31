// FORGE PERSONAL BASELINE ENGINE — no usamos valores absolutos (HRV=70 es "bueno" para quien?).
// Cada atleta tiene su propio rango normal. Este motor calcula media y desviacion estandar
// personal de los ultimos 28 dias, y compara el dato de HOY contra ESE baseline, no contra
// una tabla generica de rangos "saludables".

export interface PuntoFisiologico {
  fecha: string;
  hrv: number | null;
  rhr: number | null;
  sueno: number | null; // score 0-100 o minutos, segun la fuente real
}

export interface BaselinePersonal {
  metrica: 'hrv' | 'rhr' | 'sueno';
  media: number;
  desviacionEstandar: number;
  diasUsados: number;
  confianza: 'insuficiente' | 'aprendiendo' | 'estable'; // <7 dias / 7-27 dias / 28+ dias
}

export interface ComparacionHoy {
  metrica: 'hrv' | 'rhr' | 'sueno';
  valorHoy: number;
  baseline: BaselinePersonal;
  desviacionZ: number; // cuantas desviaciones estandar por encima/debajo del baseline
  direccion: 'favorable' | 'neutral' | 'desfavorable';
  porcentajeVsBaseline: number; // ej: +8% vs tu baseline
}

function media(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function desviacionEstandar(valores: number[], mediaValores: number): number {
  const varianza = valores.reduce((acc, v) => acc + Math.pow(v - mediaValores, 2), 0) / valores.length;
  return Math.sqrt(varianza);
}

/**
 * Calcula el baseline personal para UNA metrica, a partir de los ultimos N dias reales
 * (excluyendo el dia de hoy, que es lo que vamos a comparar CONTRA el baseline).
 */
export function calcularBaselinePersonal(
  registros: PuntoFisiologico[],
  metrica: 'hrv' | 'rhr' | 'sueno',
  diasVentana: number = 28
): BaselinePersonal {
  const valores = registros
    .slice(0, diasVentana)
    .map(r => r[metrica])
    .filter((v): v is number => v !== null && v !== undefined);

  if (valores.length === 0) {
    return { metrica, media: 0, desviacionEstandar: 0, diasUsados: 0, confianza: 'insuficiente' };
  }

  const mediaValores = media(valores);
  const desviacion = desviacionEstandar(valores, mediaValores);
  const confianza = valores.length < 7 ? 'insuficiente' : valores.length < 28 ? 'aprendiendo' : 'estable';

  return { metrica, media: Math.round(mediaValores * 10) / 10, desviacionEstandar: Math.round(desviacion * 10) / 10, diasUsados: valores.length, confianza };
}

// Para RHR, un valor MAS BAJO es favorable (invertido respecto a HRV/sueño donde mas alto es mejor)
const METRICAS_INVERTIDAS: Array<'hrv' | 'rhr' | 'sueno'> = ['rhr'];

/**
 * Compara el valor de HOY contra el baseline personal ya calculado, determinando si es
 * favorable, neutral o desfavorable respecto al comportamiento habitual del atleta.
 */
export function compararConBaseline(
  valorHoy: number,
  baseline: BaselinePersonal
): ComparacionHoy {
  if (baseline.desviacionEstandar === 0 || baseline.diasUsados === 0) {
    return { metrica: baseline.metrica, valorHoy, baseline, desviacionZ: 0, direccion: 'neutral', porcentajeVsBaseline: 0 };
  }

  const esInvertida = METRICAS_INVERTIDAS.includes(baseline.metrica);
  const desviacionZRaw = (valorHoy - baseline.media) / baseline.desviacionEstandar;
  const desviacionZ = esInvertida ? -desviacionZRaw : desviacionZRaw; // invierte el signo para RHR

  let direccion: 'favorable' | 'neutral' | 'desfavorable' = 'neutral';
  if (desviacionZ > 0.5) direccion = 'favorable';
  else if (desviacionZ < -0.5) direccion = 'desfavorable';

  const porcentajeVsBaseline = Math.round(((valorHoy - baseline.media) / baseline.media) * 100);

  return {
    metrica: baseline.metrica,
    valorHoy,
    baseline,
    desviacionZ: Math.round(desviacionZ * 100) / 100,
    direccion,
    porcentajeVsBaseline: esInvertida ? -porcentajeVsBaseline : porcentajeVsBaseline,
  };
}