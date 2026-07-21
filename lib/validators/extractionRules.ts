// FORGE EXTRACTION VALIDATOR — Biblioteca de reglas deterministas que verifican
// que el LLM extractor no haya inventado datos que no estan explicitamente en el texto.
// Filosofia: el LLM propone una extraccion, el backend la verifica, solo entonces se persiste.
// Cada validador es independiente, pequeño y testeable — igual que Scientific Rules Library.

interface EstadoFisiologico {
  hrv: number | null;
  sueno: number | null;
  rhr: number | null;
  fatiga_aguda: number | null;
  tendencia: string | null;
}

// 001 — Validador de fisiologia: si el texto no menciona explicitamente cada metrica,
// esa metrica concreta debe ser null, sin importar lo que devolviera el LLM.
export function validatePhysiologyExtraction(estadoFisiologico: any, textoOriginal: string): EstadoFisiologico {
  if (!estadoFisiologico) {
    return { hrv: null, sueno: null, rhr: null, fatiga_aguda: null, tendencia: null };
  }
  const texto = textoOriginal.toLowerCase();

  const mencionaHRV = /hrv|vfc/i.test(texto);
  const mencionaSueno = /sueño|dormí|puntuaci[oó]n.*sueño|durmiendo/i.test(texto);
  const mencionaFC = /frecuencia.*(noche|nocturna|reposo|m[ií]nima)/i.test(texto);
  const mencionaFatiga = /fatiga (sist[eé]mica|acumulada|general)/i.test(texto);
  // Mencion generica de sueño sin metricas especificas (caso limite: "dormi muy bien")
  const hayMencionGenericaSueno = mencionaSueno && !/\d/.test(texto.match(/sueño|dormí/i)?.[0] || "");

  return {
    hrv: mencionaHRV ? estadoFisiologico.hrv : null,
    sueno: mencionaSueno ? estadoFisiologico.sueno : null,
    rhr: mencionaFC ? estadoFisiologico.rhr : null,
    fatiga_aguda: mencionaFatiga ? estadoFisiologico.fatiga_aguda : null,
    // tendencia solo tiene sentido si hay al menos una metrica real confirmada
    tendencia: (mencionaHRV || mencionaSueno || mencionaFC) ? estadoFisiologico.tendencia : null
  };
}

// 002 — Validador de nueva marca: si el numero/valor de la marca no aparece literalmente
// en el texto, se descarta la marca completa (evita que el LLM invente un valor).
export function validateMarkExtraction(nuevaMarca: string | null | undefined, textoOriginal: string): string | null {
  if (!nuevaMarca || nuevaMarca === "vacío" || nuevaMarca === "") return null;
  const partes = nuevaMarca.split(":");
  if (partes.length < 2) return null;
  const valor = partes.slice(1).join(":").trim();
  // Extraer solo los digitos del valor para comparar contra el texto original
  const digitosValor = valor.replace(/[^0-9]/g, "");
  if (digitosValor.length === 0) return nuevaMarca; // valores no numericos (ej: tiempos con formato especial) se dejan pasar
  const digitosEnTexto = textoOriginal.replace(/[^0-9]/g, "");
  if (!digitosEnTexto.includes(digitosValor)) {
    return null; // el valor no aparece en el texto original, descartamos
  }
  return nuevaMarca;
}

// 003 — Validador de lesiones: si el texto no contiene palabras relacionadas con dolor/lesion,
// no se debe reportar ninguna lesion nueva.
export function validateInjuryExtraction(lesiones: string | null | undefined, textoOriginal: string): string {
  if (!lesiones || lesiones === "vacío" || lesiones === "") return "";
  const texto = textoOriginal.toLowerCase();
  const mencionaLesion = /dolor|molestia|lesi[oó]n|lumbar|rodilla|hombro|tobillo|mu[ñn]eca|codo|cadera/i.test(texto);
  return mencionaLesion ? lesiones : "";
}

// Punto de entrada unico: aplica todas las reglas de extraccion relevantes sobre el objeto
// extraido por el LLM, usando el texto original como unica fuente de verdad.
export function validateExtraction(extracted: any, textoOriginal: string) {
  return {
    ...extracted,
    estado_fisiologico: validatePhysiologyExtraction(extracted.estado_fisiologico, textoOriginal),
    nueva_marca: validateMarkExtraction(extracted.nueva_marca, textoOriginal),
    lesiones: validateInjuryExtraction(extracted.lesiones, textoOriginal)
  };
}