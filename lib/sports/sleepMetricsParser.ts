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
}

// Palabras clave que indican que el mensaje es un reporte de sueño (no solo mencion casual)
const PATRON_REPORTE_SUENO = /\b(m[eé]tricas? de sue[nñ]o|puntuaci[oó]n del? sue[nñ]o|dorm[ií]|durante la noche|sue[nñ]o profundo|sue[nñ]o rem)\b/i;

export function parseSleepMetrics(mensaje: string): ParsedSleepMetrics {
  const mensajeLower = mensaje.toLowerCase();

  if (!PATRON_REPORTE_SUENO.test(mensajeLower)) {
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

  const hrv = matchHrv ? parseInt(matchHrv[1]) : null;
  const sueno = matchSueno ? parseInt(matchSueno[1]) : null;
  const rhr = matchRhr ? parseInt(matchRhr[1]) : null;

  // Se considera detectado solo si extrajimos AL MENOS un valor numerico real
  const detected = hrv !== null || sueno !== null || rhr !== null || duracionHoras !== null;

  return { detected, hrv, sueno, rhr, duracionHoras };
}