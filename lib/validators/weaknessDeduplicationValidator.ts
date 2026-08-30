// FORGE WEAKNESS DEDUPLICATION VALIDATOR — detecta cuando el Coach registra una nueva debilidad
// que, en realidad, describe el MISMO problema real que otra ya existente, solo con nombre distinto.
// Bug real confirmado con evidencia: 3 registros separados (snatch_tercer_tiron_codos,
// snatch_timing_cadera, snatch_balance_adelantado) describian exactamente el mismo problema
// tecnico (extension de cadera adelantada en snatch), nunca fusionados porque la deduplicacion
// anterior solo comparaba el campo "indicador" con igualdad EXACTA de texto.
//
// Mismo principio que sessionDuplicationValidator: el codigo decide, el LLM propone.

interface DebilidadExistente {
  area: string;
  indicador: string;
  nombre_visible: string;
  diagnostico: string;
}

interface DebilidadNueva {
  area: string;
  indicador: string;
  nombre_visible: string;
  diagnostico: string;
}

// Similitud simple por palabras compartidas (mismo enfoque que sessionDuplicationValidator,
// suficiente para detectar solapamiento real sin necesitar embeddings/IA adicional)
function calcularSimilitudTexto(textoA: string, textoB: string): number {
  const normalizar = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const palabrasA = new Set(normalizar(textoA).split(/\W+/).filter(p => p.length > 3));
  const palabrasB = new Set(normalizar(textoB).split(/\W+/).filter(p => p.length > 3));
  if (palabrasA.size === 0 || palabrasB.size === 0) return 0;
  const interseccion = [...palabrasA].filter(p => palabrasB.has(p)).length;
  const union = new Set([...palabrasA, ...palabrasB]).size;
  return interseccion / union; // Jaccard similarity
}

export interface ResultadoDeduplicacionDebilidad {
  esDuplicadoSemantico: boolean;
  indiceExistente: number;
  similitud: number;
  motivo: string;
}

/**
 * Compara una debilidad nueva contra todas las existentes de la MISMA area, buscando
 * solapamiento semantico real (no solo coincidencia exacta de "indicador").
 * Umbral 0.35: calibrado para detectar el caso real confirmado (3 registros de snatch con
 * ~40-50% de palabras compartidas en diagnostico) sin generar falsos positivos entre
 * debilidades genuinamente distintas de la misma area.
 */
export function detectarDebilidadDuplicada(
  nueva: DebilidadNueva,
  existentes: DebilidadExistente[],
  umbral: number = 0.35
): ResultadoDeduplicacionDebilidad {
  // Coincidencia exacta de indicador (caso ya cubierto, pero lo mantenemos como atajo)
  const idxExacto = existentes.findIndex(d => d.indicador?.toLowerCase() === nueva.indicador?.toLowerCase());
  if (idxExacto >= 0) {
    return { esDuplicadoSemantico: true, indiceExistente: idxExacto, similitud: 1, motivo: 'Indicador identico' };
  }

  // Deduplicacion semantica real: solo compara dentro de la MISMA area (evita falsos positivos
  // entre p.ej. una debilidad de "Fuerza" y otra de "Técnica" que compartan pocas palabras)
  let mejorMatch = { idx: -1, similitud: 0 };
  existentes.forEach((existente, idx) => {
    if (existente.area !== nueva.area) return;
    const textoNuevo = `${nueva.nombre_visible} ${nueva.diagnostico}`;
    const textoExistente = `${existente.nombre_visible} ${existente.diagnostico}`;
    const similitud = calcularSimilitudTexto(textoNuevo, textoExistente);
    if (similitud > mejorMatch.similitud) mejorMatch = { idx, similitud };
  });

  if (mejorMatch.idx >= 0 && mejorMatch.similitud >= umbral) {
    return {
      esDuplicadoSemantico: true,
      indiceExistente: mejorMatch.idx,
      similitud: mejorMatch.similitud,
      motivo: `Similitud semantica ${Math.round(mejorMatch.similitud * 100)}% con "${existentes[mejorMatch.idx].nombre_visible}" — probable mismo problema real registrado con nombre distinto.`,
    };
  }

  return { esDuplicadoSemantico: false, indiceExistente: -1, similitud: mejorMatch.similitud, motivo: 'Sin solapamiento semantico relevante.' };
}