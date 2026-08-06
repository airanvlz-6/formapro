// FORGE STRENGTH RECORD PARSER — deteccion 100% deterministica de un posible nuevo PR en el
// mensaje del usuario. Nunca depende del LLM para esta decision — el LLM solo enriquece despues
// con el Forge Insight. Esto es Nivel 1 de la arquitectura por niveles de confianza.

export interface ParsedRecord {
  detected: boolean;
  ejercicio: string | null;
  valor: string | null;
  confidence: number;
}

// Catalogo de ejercicios conocidos: clave normalizada -> variantes de texto que lo identifican
const CATALOGO_EJERCICIOS: Record<string, string[]> = {
  back_squat: ["back squat", "sentadilla trasera", "sentadilla", "squat trasero"],
  front_squat: ["front squat", "sentadilla frontal"],
  deadlift: ["deadlift", "peso muerto", "pesomuerto"],
  bench_press: ["bench press", "press banca", "press de banca"],
  push_press: ["push press", "press militar", "press hombro", "press de hombro"],
  snatch: ["snatch", "arrancada"],
  clean_jerk: ["clean and jerk", "clean & jerk", "clean y jerk", "clean jerk", "cargada y envion", "dos tiempos"],
  clean: ["clean", "cargada"],
  overhead_squat: ["overhead squat", "sentadilla overhead"],
};

// FIX: eliminadas palabras sueltas ambiguas ("max", "marca") que generaban falsos positivos con
// series de trabajo normales. Ahora exige frase clara e inequivoca de reportar un record.
// Reconoce NRM generico (1RM, 3RM, 5RM...) ademas de las frases explicitas de record.
const PALABRAS_CLAVE_RECORD = /\b(nuevo\s*rm|nuevo\s*pr|\d+\s*rm|nuevo\s*r[eé]cord|r[eé]cord\s*personal|marca\s*personal)\b/i;

export function parseStrengthRecord(mensaje: string): ParsedRecord {
  const mensajeLower = mensaje.toLowerCase();

  // Debe contener alguna palabra clave de "record" para considerarse un candidato
  if (!PALABRAS_CLAVE_RECORD.test(mensajeLower)) {
    return { detected: false, ejercicio: null, valor: null, confidence: 0 };
  }

  // Buscar el ejercicio: probar cada variante del catalogo, la coincidencia mas larga gana
  let ejercicioEncontrado: string | null = null;
  let longitudCoincidencia = 0;
  for (const [clave, variantes] of Object.entries(CATALOGO_EJERCICIOS)) {
    for (const variante of variantes) {
      if (mensajeLower.includes(variante) && variante.length > longitudCoincidencia) {
        ejercicioEncontrado = clave;
        longitudCoincidencia = variante.length;
      }
    }
  }

  if (!ejercicioEncontrado) {
    return { detected: false, ejercicio: null, valor: null, confidence: 0 };
  }

  // Buscar un valor numerico con unidad (kg) cerca del ejercicio
  const matchValor = mensaje.match(/(\d+(?:[.,]\d+)?)\s*k(?:g)?\b/i);
  if (!matchValor) {
    return { detected: false, ejercicio: ejercicioEncontrado, valor: null, confidence: 0.3 };
  }

  const valorNumerico = matchValor[1].replace(",", ".");
  return {
    detected: true,
    ejercicio: ejercicioEncontrado,
    valor: `${valorNumerico}kg`,
    confidence: 0.95
  };
}