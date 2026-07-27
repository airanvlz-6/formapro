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
      if (Array.isArray(marca)) return null;
      return `Tu última marca registrada: **${marca.ejercicio}: ${marca.valor}** (${marca.fecha})`;
    }
    default:
      return null;
  }
}

// FORGE CAPABILITY REGISTRY — define que puede MENCIONAR el Coach en su respuesta segun el intent.
// Principio 7 del Forge Truth Principle: el Coach nunca introduce informacion estructurada por
// iniciativa propia. Solo puede mencionar lo que el intent detectado le autoriza explicitamente.
export interface Capabilities {
  canMentionPlan: boolean;
  canMentionBenchmarks: boolean;
  canMentionInsights: boolean;
  canMentionPhysiology: boolean;
}

const NONE: Capabilities = { canMentionPlan: false, canMentionBenchmarks: false, canMentionInsights: false, canMentionPhysiology: false };

export const INTENT_CAPABILITIES: Record<string, Capabilities> = {
  PLAN_HOY: { ...NONE, canMentionPlan: true },
  PLAN_MANANA: { ...NONE, canMentionPlan: true },
  PLAN_SEMANA: { ...NONE, canMentionPlan: true },
  BENCHMARK: { ...NONE, canMentionBenchmarks: true },
  OBJETIVO: { ...NONE },
  DEBILIDADES: { ...NONE },
  ULTIMO_INSIGHT: { ...NONE, canMentionInsights: true },
  HISTORIAL_FISIOLOGICO: { ...NONE, canMentionPhysiology: true },
  REPORTE_ENTRENO: { ...NONE, canMentionPlan: true, canMentionPhysiology: true },
  REPORTE_SUENO: { ...NONE, canMentionPhysiology: true },
  MODIFICAR_PLAN: { ...NONE, canMentionPlan: true },
  COACHING: { ...NONE },
  META: { ...NONE },
  OTRO: { ...NONE }
};

export function getCapabilities(intent: string): Capabilities {
  return INTENT_CAPABILITIES[intent] || NONE;
}

// Genera el bloque de texto que se inyecta en el prompt, dejando explicito que puede y que NO puede mencionar
export function buildCapabilityInstruction(capabilities: Capabilities): string {
  const lineas = [
    `PLAN/SESIONES: ${capabilities.canMentionPlan ? "SI puedes mencionar" : "NO menciones ninguna sesion, ejercicio, serie, repeticion o peso"}`,
    `BENCHMARKS/PRs: ${capabilities.canMentionBenchmarks ? "SI puedes mencionar" : "NO menciones ninguna marca personal o PR"}`,
    `FORGE INSIGHTS: ${capabilities.canMentionInsights ? "SI puedes mencionar" : "NO menciones ningun resumen semanal previo"}`,
    `FISIOLOGIA (HRV/sueño): ${capabilities.canMentionPhysiology ? "SI puedes mencionar" : "NO menciones HRV, sueño, ni ninguna metrica fisiologica"}`
  ];
  return `CAPACIDADES DE ESTA RESPUESTA (regla estricta, no violar):\n${lineas.join("\n")}\nSi no tienes autorizacion para mencionar algo, no lo menciones aunque lo consideres relevante o util — limita tu respuesta a conversacion, explicacion o motivacion.`;
}