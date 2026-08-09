// FORGE SESSION DUPLICATION VALIDATOR — capa determinista que se ejecuta DESPUES del Session Builder,
// ANTES de aceptar la sesion generada. Detecta si el LLM copio literalmente una sesion pasada en vez
// de generar contenido nuevo. El LLM propone, el backend decide — nunca al reves.

export interface SesionParaComparar {
  titulo?: string;
  descripcion?: string;
  descripcion_real?: string; // el reporte REAL que el atleta hizo de una sesion pasada
}

function normalizarTexto(t: string): string {
  return (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

// Similitud simple por solapamiento de palabras significativas (Jaccard sobre tokens de 4+ letras)
function calcularSimilitud(textoA: string, textoB: string): number {
  const tokensA = new Set(normalizarTexto(textoA).split(/\s+/).filter(w => w.length >= 4));
  const tokensB = new Set(normalizarTexto(textoB).split(/\s+/).filter(w => w.length >= 4));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const interseccion = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return interseccion / union;
}

export interface ResultadoDuplicacion {
  esDuplicado: boolean;
  similitudMaxima: number;
  sesionParecida: string | null;
}

// UMBRAL: por encima de 0.55 de solapamiento de palabras clave, se considera sospechosamente similar
// (una sesion nueva bien generada rara vez comparte tantos terminos especificos con una pasada)
const UMBRAL_DUPLICADO = 0.55;

export function detectarSesionDuplicada(sesionNueva: SesionParaComparar, sesionesRecientes: SesionParaComparar[]): ResultadoDuplicacion {
  const textoNuevo = `${sesionNueva.titulo || ""} ${sesionNueva.descripcion || ""}`;
  let similitudMaxima = 0;
  let sesionParecida: string | null = null;

  for (const sesionPasada of sesionesRecientes) {
    // Comparamos contra el titulo Y contra el reporte real (descripcion_real), que es lo mas probable de copiarse
    const textoPasado = `${sesionPasada.titulo || ""} ${sesionPasada.descripcion_real || sesionPasada.descripcion || ""}`;
    const similitud = calcularSimilitud(textoNuevo, textoPasado);
    if (similitud > similitudMaxima) {
      similitudMaxima = similitud;
      sesionParecida = sesionPasada.titulo || null;
    }
  }

  return {
    esDuplicado: similitudMaxima >= UMBRAL_DUPLICADO,
    similitudMaxima: Math.round(similitudMaxima * 100) / 100,
    sesionParecida
  };
}