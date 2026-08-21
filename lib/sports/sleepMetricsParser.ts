// FORGE SLEEP METRICS PARSER — deteccion y extraccion 100% deterministica de metricas de sueño
// reportadas por el usuario. Mismo principio que PR Detection y Pending Actions: el LLM nunca
// tiene autoridad para decidir si se guarda un dato fisiologico critico — el parser decide,
// basandose en lo que el usuario escribio literalmente, nunca en interpretacion del modelo.

export interface ParsedSleepMetrics {
  detected: boolean;
  hrv: number | null;
  sueno: number | null; // puntuacion 0-100
  rhr: number | null; // frecuencia cardiaca reposo/media
  duracionHoras: number | null;
  valoresSospechosos?: { hrv: number | null; sueno: number | null; rhr: number | null };
}

// FIX: ampliado para reconocer TAMBIEN menciones directas de una sola metrica (ej: "VFC 80ms",
// "HRV 65") sin exigir la frase completa de reporte — el usuario a veces reporta datos sueltos
// en mensajes posteriores, y el parser debe seguir detectandolos y guardandolos.
const PATRON_REPORTE_SUENO = /\b(m[eé]tricas? de sue[nñ]o|puntuaci[oó]n del? sue[nñ]o|dorm[ií]|durante la noche|sue[nñ]o profundo|sue[nñ]o rem)\b/i;
const PATRON_METRICA_SUELTA = /\b(hrv|vfc)\s*(?:de)?\s*\d{1,3}\s*(?:ms)?\b/i;

export function parseSleepMetrics(mensaje: string): ParsedSleepMetrics {
  const mensajeLower = mensaje.toLowerCase();

  if (!PATRON_REPORTE_SUENO.test(mensajeLower) && !PATRON_METRICA_SUELTA.test(mensajeLower)) {
    return { detected: false, hrv: null, sueno: null, rhr: null, duracionHoras: null };
  }

  // HRV / VFC — acepta ambos terminos, con "ms" opcional
  const matchHrv = mensaje.match(/(?:hrv|vfc)\s*(?:de)?\s*(\d{1,3})\s*(?:ms)?/i);

  // Puntuacion de sueño (0-100), evitando confundir con HRV/FC — exige contexto "puntuacion"/"score"
  const matchSueno = mensaje.match(/puntuaci[oó]n\s*(?:del?\s*)?sue[nñ]o\s*(?:de)?\s*(\d{1,3})\s*(?:puntos?)?/i);

  // Frecuencia cardiaca (media o reposo) — evita capturar "frecuencia minima" como RHR
  const matchRhr = mensaje.match(/frecuencia\s*card[ií]aca\s*media\s*(\d{2,3})\s*(?:ppm|bpm)?/i)
    || mensaje.match(/fc\s*(?:media|reposo)\s*(\d{2,3})/i);

  // Duracion: "5h 41min" o "5 horas 41 minutos" -> decimal
  const matchDuracion = mensaje.match(/duraci[oó]n\s*(?:del?\s*)?sue[nñ]o\s*:?\s*(\d{1,2})\s*h(?:oras?)?\s*(\d{1,2})?\s*m(?:in(?:utos?)?)?/i);
  const duracionHoras = matchDuracion
    ? parseFloat(matchDuracion[1]) + (matchDuracion[2] ? parseInt(matchDuracion[2]) / 60 : 0)
    : null;

  // FIX CRITICO: validacion de rango fisiologico razonable ANTES de aceptar el valor. Bug real
  // confirmado: "888ms" (typo probable de "88ms") se persistio sin ninguna validacion porque el
  // regex \d{1,3} tecnicamente permite hasta 999 — un HRV real nunca supera ~200ms en reposo.
  // Fuera de rango => se descarta el campo especifico (no todo el reporte) y se marca como
  // "sospechoso" para que el backend pueda pedir confirmacion en vez de guardar silenciosamente.
  const RANGO_HRV = { min: 10, max: 200 };
  const RANGO_SUENO = { min: 0, max: 100 };
  const RANGO_RHR = { min: 30, max: 120 };

  const hrvBruto = matchHrv ? parseInt(matchHrv[1]) : null;
  const suenoBruto = matchSueno ? parseInt(matchSueno[1]) : null;
  const rhrBruto = matchRhr ? parseInt(matchRhr[1]) : null;

  const hrvSospechoso = hrvBruto !== null && (hrvBruto < RANGO_HRV.min || hrvBruto > RANGO_HRV.max);
  const suenoSospechoso = suenoBruto !== null && (suenoBruto < RANGO_SUENO.min || suenoBruto > RANGO_SUENO.max);
  const rhrSospechoso = rhrBruto !== null && (rhrBruto < RANGO_RHR.min || rhrBruto > RANGO_RHR.max);

  const hrv = hrvSospechoso ? null : hrvBruto;
  const sueno = suenoSospechoso ? null : suenoBruto;
  const rhr = rhrSospechoso ? null : rhrBruto;

  // Se considera detectado solo si extrajimos AL MENOS un valor numerico real (ya validado)
  const detected = hrv !== null || sueno !== null || rhr !== null || duracionHoras !== null;

  return {
    detected, hrv, sueno, rhr, duracionHoras,
    valoresSospechosos: {
      hrv: hrvSospechoso ? hrvBruto : null,
      sueno: suenoSospechoso ? suenoBruto : null,
      rhr: rhrSospechoso ? rhrBruto : null,
    }
  };
}