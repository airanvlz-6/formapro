// FORGE RESPONSE ENGINE — decide COMO responder segun el modo del intent, no segun confianza.
// Principio: cuanto mayor la certeza del DATO, menos interviene el LLM.
// STATIC: respuesta 100% determinista, sin ninguna llamada al modelo.
// HYBRID: respuesta base determinista + el LLM añade una frase de contexto/motivacion.
// LLM: el modelo razona libremente (preguntas de coaching sin respuesta unica).

export type ResponseMode = "STATIC" | "HYBRID" | "LLM";

// Registro de que modo corresponde a cada intent. Añadir un intent nuevo = añadir una linea aqui.
export const INTENT_RESPONSE_MODE: Record<string, ResponseMode> = {
  PLAN_HOY: "STATIC",
  PLAN_MANANA: "STATIC",
  PLAN_SEMANA: "STATIC",
  BENCHMARK: "STATIC",
  OBJETIVO: "HYBRID",
  DEBILIDADES: "HYBRID",
  ULTIMO_INSIGHT: "HYBRID",
  HISTORIAL_FISIOLOGICO: "HYBRID",
  REPORTE_ENTRENO: "LLM",
  REPORTE_SUENO: "LLM",
  MODIFICAR_PLAN: "LLM",
  COACHING: "LLM",
  META: "LLM",
  OTRO: "LLM"
};

export function getResponseMode(intent: string): ResponseMode {
  return INTENT_RESPONSE_MODE[intent] || "LLM";
}

// Construye la respuesta STATIC (plantilla pura, sin LLM) para los intents mas simples y deterministas.
export function buildStaticResponse(intent: string, data: any): string | null {
  switch (intent) {
    case "PLAN_HOY": {
      const sesion = data?.valor;
      if (!sesion) return "Hoy no tienes ninguna sesión programada en Mi Plan.";
      return `Hoy tienes programado:\n\n**${sesion.titulo}**\n\n${sesion.descripcion}`;
    }
    case "PLAN_MANANA": {
      const sesion = data?.valor;
      if (!sesion) return "Mañana no tienes ninguna sesión programada en Mi Plan.";
      return `Mañana tienes programado:\n\n**${sesion.titulo}**\n\n${sesion.descripcion}`;
    }
    case "PLAN_SEMANA": {
      const plan = data?.valor;
      if (!plan?.sessions) return "No tienes un plan generado para esta semana todavía.";
      const resumen = plan.sessions.map((s: any) => `**${s.dia}**: ${s.titulo}`).join("\n");
      return `Tu semana (${plan.block_name}):\n\n${resumen}`;
    }
    case "BENCHMARK": {
      const marca = data?.valor;
      if (!marca) return "No tengo ninguna marca registrada para ese ejercicio todavía.";
      if (Array.isArray(marca)) return null; // caso de lista completa, mejor dejar que el LLM lo resuma
      return `Tu última marca registrada: **${marca.ejercicio}: ${marca.valor}** (${marca.fecha})`;
    }
    default:
      return null; // Este intent no tiene plantilla STATIC definida
  }
}