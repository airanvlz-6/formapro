import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";
import { validateExtraction } from "@/lib/validators/extractionRules";
import { buildCatalogoPrompt, validarCatalogoDisciplina } from "@/lib/sports/disciplineCatalog";
import { buildExposureReport, exposureReportToPromptText } from "@/lib/sports/exposureEngine";
import { detectarDebilidadDuplicada } from "@/lib/validators/weaknessDeduplicationValidator";
import { rankearCandidatos, validarCoherenciaEstimulo, STIMULUS_LIBRARY, getMovimientosPorEstimulo, MOVEMENT_LIBRARY } from "@/lib/sports/movementLibrary";
import { evaluarSustitucion } from "@/lib/sports/substitutionEngine";
import { agregarExposicionPorPatron, agregarExposicionPorModalidad } from "@/lib/sports/workoutStructureLibrary";
import { parseStrengthRecord } from "@/lib/sports/strengthRecordParser";
import { parseSleepMetrics } from "@/lib/sports/sleepMetricsParser";
import { parseSessionProposal } from "@/lib/sports/proposalParser";
import { detectarSesionDuplicada } from "@/lib/validators/sessionDuplicationValidator";
import { buildAthleteKnowledge, knowledgeRouter, getObjectiveProgress } from "@/lib/knowledge/athleteKnowledge";
import { getResponseMode, buildStaticResponse, getCapabilities, buildCapabilityInstruction } from "@/lib/response/responseEngine";
import { sendEmail } from "@/lib/email/sendEmail";
import FounderEmail from "@/lib/email/templates/FounderEmail";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// FORGE BLOCK NARRATIVE — construye la secuencia completa de resumenes semanales del bloque ACTUAL
// (no solo la ultima semana), para que el Coach pueda explicar decisiones con la historia real del
// atleta ("la semana pasada bajaste calidad tecnica, por eso...") en vez de teoria generica.
async function buildBlockNarrative(supabase: any, codigo: string): Promise<string> {
  const { data: usuario } = await supabase.from("usuarios").select("ciclo_actual").eq("codigo", codigo).single();
  const bloqueActual = usuario?.ciclo_actual?.bloque;
  if (!bloqueActual) return "Sin bloque activo registrado.";

  const { data: resumenes } = await supabase
    .from("block_week_summary")
    .select("*")
    .eq("user_codigo", codigo)
    .eq("bloque", bloqueActual)
    .order("week_start", { ascending: true });

  if (!resumenes || resumenes.length === 0) {
    return `Bloque actual: ${bloqueActual}. Sin semanas previas registradas todavia en este bloque (primera semana o sin datos).`;
  }

  const lineas = resumenes.map((r: any) =>
    `Semana ${r.semana_del_bloque}/${r.total_semanas_bloque}: objetivo "${r.objetivo_semanal}" — resultado ${r.resultado}, fatiga ${r.fatiga}, recuperacion ${r.recuperacion}. Adaptaciones: ${(r.adaptaciones_conseguidas || []).join(", ") || "ninguna"}. Pendiente: ${(r.pendiente || []).join(", ") || "nada"}.`
  );

  return `NARRATIVA DEL BLOQUE ACTUAL (${bloqueActual}, ${resumenes.length} semana(s) registrada(s)):\n${lineas.join("\n")}`;
}

async function generarEstadoCanonico(supabase: any, codigo: string) {
  const DIAS_MAP = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const ahora = new Date();
  const hoyStr = ahora.toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
  const hoyFecha = new Date(hoyStr + 'T12:00:00');
  const diaSemanaHoy = DIAS_MAP[hoyFecha.getDay()];
  const mananaFecha = new Date(hoyFecha); mananaFecha.setDate(mananaFecha.getDate()+1);
  const diaSemanaManana = DIAS_MAP[mananaFecha.getDay()];

  const diaSemanaNum = hoyFecha.getDay() || 7;
  const lunesFecha = new Date(hoyFecha); lunesFecha.setDate(hoyFecha.getDate() - diaSemanaNum + 1);
  const weekStart = lunesFecha.toISOString().split('T')[0];

  const { data: usuario } = await supabase.from("usuarios").select("ciclo_actual,estado_fisiologico,objetivo_principal,debilidades,athlete_development").eq("codigo", codigo).single();
  const { data: plan } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStart).single();

  // FIX CRITICO: cuando "mañana" cruza a otra semana (ej: hoy domingo, mañana lunes de la semana
  // siguiente), sesion_manana debe buscarse en el plan de LA SEMANA DE MAÑANA, no en el plan de
  // hoy — bug real confirmado: mostraba el lunes YA COMPLETADO de la semana actual como si fuera
  // la sesion de mañana, porque ambos comparten el mismo nombre de dia pero pertenecen a weeks distintas.
  const cruzaSemana = mananaFecha.getDay() === 1; // mañana es lunes = cruza a semana siguiente
  let planParaManana = plan;
  if (cruzaSemana) {
    const { data: planSiguiente } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", mananaFecha.toISOString().split('T')[0]).maybeSingle();
    planParaManana = planSiguiente || null;
  }

  // FORGE ATHLETE STATE ENGINE — estado activo del atleta (normal/restricted/paused/etc). Fuente
  // unica de verdad consultada tanto por el Coach conversacional como por el Block Analyzer, para
  // que ambos sepan si el atleta esta en un periodo de restriccion que gobierna toda la planificacion.
  const { data: estadoAtletaActivo } = await supabase.from("athlete_state_events").select("estado,motivo,fecha_inicio").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
  // FUENTE ATOMICA: physiology_records reemplaza el JSON historial_fisiologico, elimina RMW
  const { data: fisioRecords } = await supabase.from("physiology_records").select("fecha,hrv,sueno,rhr,fatiga_aguda").eq("user_codigo", codigo).order("fecha", { ascending: false }).limit(30);
  const historialFisiologicoAtomico = (fisioRecords || []).map((r: any) => ({ fecha: r.fecha, hrv: r.hrv, sueno: r.sueno, rhr: r.rhr, fatiga_aguda: r.fatiga_aguda }));

  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const sesionHoy = plan?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaHoy));
  const sesionManana = planParaManana?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaManana));

  const histFisio = historialFisiologicoAtomico;
  const ultimosRegistrosFisio = [...histFisio].sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 3);
  const ultimoRegistroFisio = ultimosRegistrosFisio[0];

  let tendenciaFisio = null;
  if (ultimosRegistrosFisio.length >= 2) {
    const suenoValores = ultimosRegistrosFisio.filter((r: any) => r.sueno).map((r: any) => r.sueno).reverse();
    const hrvValores = ultimosRegistrosFisio.filter((r: any) => r.hrv).map((r: any) => r.hrv).reverse();
    const esAscendente = (arr: number[]) => arr.length >= 2 && arr.every((v, i) => i === 0 || v >= arr[i - 1]);
    const esDescendente = (arr: number[]) => arr.length >= 2 && arr.every((v, i) => i === 0 || v <= arr[i - 1]);
    tendenciaFisio = {
      ultimas_noches_sueno: suenoValores,
      ultimas_noches_hrv: hrvValores,
      sueno_tendencia: esAscendente(suenoValores) ? "ascendente" : esDescendente(suenoValores) ? "descendente" : "estable",
      hrv_tendencia: esAscendente(hrvValores) ? "ascendente" : esDescendente(hrvValores) ? "descendente" : "estable"
    };
  }

  const estado = {
    fecha_hoy: hoyStr,
    dia_semana_hoy: diaSemanaHoy,
    dia_semana_manana: diaSemanaManana,
    fecha_manana: mananaFecha.toISOString().split('T')[0],
    ciclo: usuario?.ciclo_actual || null,
    sesion_hoy: sesionHoy ? {
      titulo: sesionHoy.titulo,
      completada: !!sesionHoy.completada,
      descripcion: sesionHoy.descripcion,
      por_que: sesionHoy.por_que
    } : null,
    sesion_manana: sesionManana ? {
      titulo: sesionManana.titulo,
      completada: !!sesionManana.completada,
      descripcion: sesionManana.descripcion,
      por_que: sesionManana.por_que
    } : null,
    ultimo_registro_fisiologico: ultimoRegistroFisio || null,
    tendencia_fisiologica: tendenciaFisio,
    objetivo_principal: usuario?.objetivo_principal || null,
    debilidades_activas: (usuario?.athlete_development || []).filter((d: any) => d.estado !== "resuelta").map((d: any) => d.nombre_visible || d.indicador),
    athlete_state: estadoAtletaActivo ? { estado: estadoAtletaActivo.estado, motivo: estadoAtletaActivo.motivo, desde: estadoAtletaActivo.fecha_inicio } : { estado: "normal" },
    generado_at: ahora.toISOString()
  };

  return estado;
}

// FORGE INTENT CLASSIFIER — clasifica el mensaje del usuario por FAMILIA de intencion,
// no por evento. Esto determina si el mensaje es una consulta (READ), un registro (WRITE),
// una modificacion de planificacion (PLAN), una pregunta de coaching (COACHING), o algo
// de configuracion/cuenta (META). Cada familia se procesa de forma distinta.
interface IntentClassification {
  intent: "PLAN_HOY" | "PLAN_MANANA" | "PLAN_SEMANA" | "ULTIMO_INSIGHT" | "BENCHMARK" | "OBJETIVO" | "DEBILIDADES" | "HISTORIAL_FISIOLOGICO" | "REPORTE_ENTRENO" | "REPORTE_SUENO" | "MODIFICAR_PLAN" | "GENERAR_SEMANA_COMPLETA" | "COACHING" | "META" | "OTRO";
  familia: "READ" | "WRITE" | "PLAN" | "COACHING" | "META";
  confidence: number;
}

async function clasificarIntencion(apiKey: string, mensaje: string): Promise<IntentClassification> {
  const prompt = `Clasifica este mensaje de un atleta a su coach de entrenamiento. Responde SOLO con JSON, sin texto adicional ni markdown.

INTENCIONES POSIBLES Y SU FAMILIA:
- PLAN_HOY (familia READ): pregunta qué toca hoy, qué entreno tiene hoy
- PLAN_MANANA (familia READ): pregunta qué toca mañana
- PLAN_SEMANA (familia READ): pregunta por el resto de la semana o el plan completo
- ULTIMO_INSIGHT (familia READ): pregunta por su último resumen semanal o progreso reciente
- BENCHMARK (familia READ): pregunta por una marca personal, PR, o resultado de un benchmark concreto
- OBJETIVO (familia READ): pregunta cuál es su objetivo principal
- DEBILIDADES (familia READ): pregunta qué debilidades o áreas de desarrollo tiene activas
- HISTORIAL_FISIOLOGICO (familia READ): pregunta por su HRV, sueño, o tendencia fisiológica reciente
- REPORTE_ENTRENO (familia WRITE): reporta haber completado un entrenamiento
- REPORTE_SUENO (familia WRITE): reporta métricas de sueño/recuperación nocturna
- MODIFICAR_PLAN (familia PLAN): pide cambiar, mover, o ajustar UNA sesion especifica o su disponibilidad puntual
- GENERAR_SEMANA_COMPLETA (familia PLAN): pide generar, crear, planificar o preparar la SEMANA COMPLETA (7 dias) de entrenamiento, ya sea la proxima semana o una nueva planificacion completa. INCLUYE TAMBIEN confirmaciones cortas de arranque cuando el mensaje ANTERIOR del asistente proponia empezar la planificacion (ej: "confirmo esta estructura", "arrancamos", "adelante", "vale, empezamos", "si, dale") — estas frases equivalen a pedir que se genere la semana ahora.
- COACHING (familia COACHING): pregunta abierta que requiere razonamiento (por qué, cómo mejorar, qué opinas, explicación técnica)
- META (familia META): preguntas sobre la cuenta, premium, configuración de Forge, no sobre entrenamiento
- OTRO (familia COACHING): cualquier cosa que no encaje claramente en las anteriores

Mensaje: "${mensaje}"

Responde con este formato exacto:
{"intent":"NOMBRE_INTENCION","familia":"READ|WRITE|PLAN|COACHING|META","confidence":0.0-1.0}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 100, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const texto = data.content?.map((b: any) => b.text || "").join("") || "{}";
    const clean = texto.replace(/```json|```/gi, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON valido");
    const resultado = JSON.parse(match[0]);
    return {
      intent: resultado.intent || "OTRO",
      familia: resultado.familia || "COACHING",
      confidence: typeof resultado.confidence === "number" ? resultado.confidence : 0.5
    };
  } catch {
    // Fallback seguro: si el clasificador falla, tratamos como COACHING (el LLM razona normalmente, sin dato inmutable forzado)
    return { intent: "OTRO", familia: "COACHING", confidence: 0 };
  }
}

// FORGE EVENT AGGREGATOR — determina a que evento pertenece cada mensaje del usuario,
// y entrega SOLO los mensajes de ese evento al extractor correspondiente. El backend
// es la unica fuente de verdad: nunca depende del frontend para clasificar.
async function clasificarMensajeEnBackend(apiKey: string, mensaje: string): Promise<string> {
  const clasificarPrompt = `Clasifica este mensaje de un atleta a su coach en UNA sola categoría. Responde SOLO con una palabra, sin explicación:
TRAINING_REPORT — si reporta haber completado un entrenamiento (menciona ejercicios, series, reps, sensaciones durante el esfuerzo, WOD, etc.)
SLEEP_REPORT — si reporta EXCLUSIVAMENTE métricas de sueño/recuperación nocturna (HRV, horas dormidas, puntuación de sueño, sin mencionar entrenamiento)
OTHER — cualquier otra cosa (preguntas, confirmaciones, charla general)

Mensaje: "${mensaje}"`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 10, messages: [{ role: "user", content: clasificarPrompt }] }),
    });
    const data = await res.json();
    const texto = (data.content?.map((b: any) => b.text || "").join("") || "OTHER").trim().toUpperCase();
    if (texto.includes("TRAINING")) return "TRAINING_REPORT";
    if (texto.includes("SLEEP")) return "SLEEP_REPORT";
    return "OTHER";
  } catch {
    return "OTHER";
  }
}

// Parametros configurables del Event Aggregator — ajustar aqui, sin tocar la logica interna
const EVENT_CLOSE_WINDOW_MS = 15 * 60 * 1000; // tiempo de inactividad tras el cual un evento se considera cerrado definitivamente
const EVENT_CORRECTION_WINDOW_MS = 3 * 60 * 1000; // ventana tras la extraccion durante la cual se permiten correcciones

// FORGE EVENT PIPELINE (Fase 1) — punto unico de emision de eventos canonicos del atleta.
// No importa el origen (banner, extractor, futura integracion Garmin/Strava): todos emiten
// el mismo evento canonico, y los consumidores (Conversation Memory, Discovery Engine, etc.)
// solo necesitan escuchar el evento, sin conocer quien lo produjo.
// REGLA: los eventos son INMUTABLES. Ningun consumidor debe modificar un evento ya emitido —
// si algo cambia, se emite un evento nuevo.
interface ForgeEventParams {
  entityType?: string;
  entityId?: string;
  source: string;
  payload: any;
}

async function emitirEventoForge(supabase: any, codigo: string, eventType: string, params: ForgeEventParams) {
  await supabase.from("forge_events").insert({
    user_codigo: codigo,
    event_type: eventType,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    source: params.source,
    payload: params.payload,
    version: 1
  });
}

async function forgeEventAggregator(supabase: any, apiKey: string, codigo: string, mensajeActual: string): Promise<{ eventType: string; mensajesDelEvento: string[]; esCorreccion: boolean }> {
  const tipoDetectado = await clasificarMensajeEnBackend(apiKey, mensajeActual);

  const { data: eventoActivo } = await supabase.from("active_events").select("*").eq("user_codigo", codigo).single();

  const ahora = new Date();
  const msDesdeUltimaActividad = eventoActivo?.updated_at ? ahora.getTime() - new Date(eventoActivo.updated_at).getTime() : Infinity;
  const eventoCerradoDefinitivo = msDesdeUltimaActividad > EVENT_CLOSE_WINDOW_MS;
  const dentroVentanaCorreccion = eventoActivo?.status === "extracted" && msDesdeUltimaActividad <= EVENT_CORRECTION_WINDOW_MS;

  let mensajesEvento: string[];
  let esCorreccion = false;

  const mismoTipoQueActivo = eventoActivo && eventoActivo.event_type === tipoDetectado && tipoDetectado !== "OTHER";

  if (mismoTipoQueActivo && eventoActivo.status === "collecting" && !eventoCerradoDefinitivo) {
    // Evento sigue en recoleccion activa: añadir mensaje normalmente
    mensajesEvento = [...(eventoActivo.messages || []), mensajeActual];
    await supabase.from("active_events").update({ messages: mensajesEvento, status: "collecting", updated_at: ahora.toISOString() }).eq("user_codigo", codigo);

  } else if (mismoTipoQueActivo && dentroVentanaCorreccion) {
    // Evento ya se extrajo, pero seguimos en ventana de correccion: reabrir para incluir el dato corregido
    esCorreccion = true;
    mensajesEvento = [...(eventoActivo.messages || []), mensajeActual];
    await supabase.from("active_events").update({ messages: mensajesEvento, status: "collecting", updated_at: ahora.toISOString() }).eq("user_codigo", codigo);

  } else {
    // Nuevo evento: el anterior (si habia) queda cerrado implicitamente al ser sobreescrito
    mensajesEvento = [mensajeActual];
    await supabase.from("active_events").upsert({
      user_codigo: codigo,
      event_id: `evt_${Date.now()}`,
      event_type: tipoDetectado,
      status: "collecting",
      messages: mensajesEvento,
      updated_at: ahora.toISOString()
    });
  }

  return { eventType: tipoDetectado, mensajesDelEvento: mensajesEvento, esCorreccion };
}

// FORGE CONTEXT BUILDER — construye el contexto conversacional que recibe el Coach.
// En vez de "ultimos N mensajes" cronologicos, incluye: el evento activo actual completo,
// el ultimo evento cerrado relevante (resumido via su event_context), y evita que el Coach
// "olvide" un evento importante solo porque hubo conversacion intermedia.
// FORGE CONVERSATION MEMORY — hechos deterministas de lo que YA ha ocurrido HOY en la conversacion.
// No es texto, son flags. Se reconstruye cada vez desde event_log + active_events del dia actual.
// Resuelve la familia de bugs "el Coach pregunta algo que el usuario ya respondio esta misma conversacion".
interface ConversationFacts {
  trainingTodayReported: boolean;
  sleepTodayReported: boolean;
  todayPlanModified: boolean;
  giOrHealthIssueReportedToday: boolean;
}

async function buildConversationFacts(supabase: any, codigo: string): Promise<ConversationFacts> {
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const inicioHoy = new Date(hoyStr + 'T00:00:00').toISOString();

  const { data: eventosHoy } = await supabase
    .from("event_log")
    .select("event_type,closed_at")
    .eq("user_codigo", codigo)
    .gte("closed_at", inicioHoy);

  const { data: eventoActivoActual } = await supabase
    .from("active_events")
    .select("event_type,messages,updated_at")
    .eq("user_codigo", codigo)
    .single();

  const eventosDeHoy = eventosHoy || [];
  const tipoActivoEsHoy = eventoActivoActual && new Date(eventoActivoActual.updated_at) >= new Date(inicioHoy);

  // FORGE EVENT PIPELINE — consumimos el evento canonico TrainingReported, sin importar su origen
  // (banner, extractor, futuras integraciones). Esta es la fuente de verdad preferida.
  const { data: eventosPipelineHoy } = await supabase
    .from("forge_events")
    .select("event_type,created_at")
    .eq("user_codigo", codigo)
    .eq("event_type", "WorkoutRegistered")
    .gte("created_at", inicioHoy);
  const huboTrainingPipeline = (eventosPipelineHoy || []).length > 0;

  const huboTraining = huboTrainingPipeline || eventosDeHoy.some((e: any) => e.event_type === "TRAINING_REPORT") || (tipoActivoEsHoy && eventoActivoActual.event_type === "TRAINING_REPORT");
  const huboSueno = eventosDeHoy.some((e: any) => e.event_type === "SLEEP_REPORT") || (tipoActivoEsHoy && eventoActivoActual.event_type === "SLEEP_REPORT");

  // Molestia de salud reportada hoy: heuristica simple sobre el texto del evento activo/reciente si es OTHER
  const textoEventoActivo = (eventoActivoActual?.messages || []).join(" ").toLowerCase();
  const huboMolestiaSalud = /est[oó]mago|gastrointestinal|malestar|dolor|molestia|mareo|fiebre|resfriado|gripe/i.test(textoEventoActivo) && tipoActivoEsHoy;

  return {
    trainingTodayReported: huboTraining,
    sleepTodayReported: huboSueno,
    todayPlanModified: false, // se amplia en el futuro conectando con actualizar_sesion_plan
    giOrHealthIssueReportedToday: huboMolestiaSalud
  };
}

function buildConversationFactsInstruction(facts: ConversationFacts): string {
  const lineas: string[] = [];
  if (facts.trainingTodayReported) lineas.push("✓ El entrenamiento de HOY ya fue reportado en esta conversación. NUNCA preguntes si podrá entrenar hoy ni si tiene pensado entrenar — ya ocurrió.");
  if (facts.sleepTodayReported) lineas.push("✓ Las métricas de sueño de esta noche ya fueron reportadas en esta conversación.");
  if (facts.giOrHealthIssueReportedToday) lineas.push("✓ El atleta ya mencionó una molestia de salud hoy — no le preguntes de nuevo si podrá entrenar, ya sabes que el entreno de hoy (si tocaba) ya se resolvió o se está gestionando.");
  if (lineas.length === 0) return "";
  return `HECHOS YA CONOCIDOS EN ESTA CONVERSACIÓN DE HOY (no los ignores ni preguntes de nuevo):\n${lineas.join("\n")}`;
}

async function forgeContextBuilder(supabase: any, codigo: string, eventoActivoActual: { eventType: string; mensajesDelEvento: string[] }): Promise<string> {
  const partes: string[] = [];

  // FORGE MODO DE ENTRADA — restriccion de maxima prioridad: si el atleta eligio "ya tengo
  // entrenador" o "solo consulta", el Coach NUNCA debe generar ni modificar planificacion semanal,
  // sin importar lo que pida el intent detectado. Solo puede analizar, responder y registrar.
  const { data: usuarioModo } = await supabase.from("usuarios").select("modo_entrada").eq("codigo", codigo).single();
  const instruccionLenguajeSinPlan = `\nLENGUAJE: NUNCA digas "hoy toca..." ni menciones ninguna sesion planificada por Forge (no existe). En su lugar, cuando sea relevante, usa un lenguaje orientado a la espera de datos, por ejemplo: "cuando registres tu proximo entreno analizare recuperacion, carga y progresion" o "cuentame como fue tu ultima sesion y te doy mi valoracion".`;
    if (usuarioModo?.modo_entrada === "supervision") {
    partes.push(`MODO DE ENTRADA: SUPERVISION EXTERNA (restriccion maxima prioridad, nunca la ignores).\nEste atleta tiene su PROPIA planificacion o entrenador externo. NUNCA generes, sugieras cambiar, ni propongas una planificacion semanal completa — ni aunque el atleta lo pida directamente ("genera mi semana", "hazme un plan"). Si lo pide, explica amablemente que en este modo no generas planificaciones, pero que puedes ayudarle a analizar/adaptar UNA sesion puntual si la comparte contigo. Tu rol es: registrar entrenos, responder dudas tecnicas, dar opinion sobre sesiones concretas que el atleta comparta, y avisar si detectas señales de fatiga/riesgo.${instruccionLenguajeSinPlan}`);
  } else if (usuarioModo?.modo_entrada === "consulta") {
    partes.push(`MODO DE ENTRADA: SOLO CONSULTA (prioridad alta). Este atleta no tiene planificacion formal todavia y no la ha pedido. NO generes una planificacion semanal completa por iniciativa propia — solo si el atleta la pide explicitamente. Tu rol principal es ir conociendolo a traves de la conversacion, registrar lo que comparta, y responder dudas puntuales.${instruccionLenguajeSinPlan}`);
  }

  // FORGE CONVERSATIONAL CONTEXT SEPARATION — regla explicita general, critica ahora que el historial
  // conversacional se amplio a 10 mensajes. El Coach debe recibir esto SIEMPRE, sin excepcion.
  partes.push(`REGLA FUNDAMENTAL — SEPARACION ENTRE CONVERSACION Y VERDAD:
El historial conversacional reciente sirve UNICAMENTE para continuidad, referencias y comprension del dialogo ("como te decia antes", "eso que comentamos").
NUNCA utilices un mensaje anterior como fuente de verdad para datos estructurados.
Para cualquier dato estructurado, la UNICA autoridad es el contexto estructurado proporcionado aqui: Estado Canonico, objetivo, ciclo actual, disponibilidad, weekly_plan, workout_history, Athlete Knowledge, recuperacion y metricas verificadas.
Si existe cualquier contradiccion entre el historial conversacional y los datos estructurados, SIEMPRE prevalecen los datos estructurados.
Un comentario, hipotesis, duda, error o afirmacion del usuario en una conversacion anterior NO modifica por si mismo ningun dato estructurado.
Solo considera real un cambio cuando haya sido procesado y reflejado por el sistema correspondiente (aparece en los datos estructurados de este contexto).`);

  // FORGE COACHING NOTES BOUNDARY — regla critica: el Coach NUNCA anuncia ni promete cambios a una
  // sesion ya planificada (hoy, mañana, o cualquier dia de la semana actual) en respuesta a una
  // observacion tecnica o debilidad mencionada en conversacion. El plan vigente es inmutable salvo
  // modificacion EXPLICITA solicitada y confirmada por el usuario a traves del flujo de Pending Actions.
  partes.push(`REGLA FUNDAMENTAL — OBSERVACIONES TECNICAS NUNCA MODIFICAN EL PLAN DIRECTAMENTE:
Cuando el atleta reporte una debilidad, dificultad tecnica, o algo a trabajar (ej: "se me cae la barra hacia delante", "quiero mejorar mi estabilidad"), tu respuesta debe limitarse a: reconocer la observacion, dar tu analisis tecnico si aporta valor, y confirmar que queda registrado para tenerlo en cuenta en proxima planificacion.
NUNCA anuncies ni prometas cambios concretos a la sesion de HOY, MAÑANA, o cualquier dia ya planificado de la semana actual (ej: "añade esto antes de tu sesion de mañana", "mañana meto este drill") — el plan vigente es inmutable salvo que el atleta pida explicitamente modificar una sesion y lo confirme.
La decision de incorporar trabajo especifico sobre una debilidad detectada corresponde exclusivamente a la planificacion de la SIGUIENTE semana (Weekly Strategy), nunca a la conversacion actual.
Respuesta correcta: "Anotado — vamos a tenerlo en cuenta para las proximas sesiones cuando encaje con la estructura del bloque."
Respuesta INCORRECTA (nunca hagas esto): dar una prescripcion tecnica detallada con series/repeticiones/pesos para ejecutar mañana como si ya formara parte del plan.`);

  // FORGE PLANNED SESSION REFERENCE — SIEMPRE presente, sin importar el intent de la conversacion.
  // Regla de capacidad (no de intent): si el Coach va a mencionar que sesion toca hoy/mañana,
  // DEBE usar estos nombres exactos, nunca inventar contenido de sesion durante conversacion libre.
  const estadoParaReferencia = await generarEstadoCanonico(supabase, codigo);
  const tituloHoyRef = estadoParaReferencia.sesion_hoy?.titulo || "sin sesión programada";
  const tituloMananaRef = estadoParaReferencia.sesion_manana?.titulo || "sin sesión programada";
  partes.push(`REFERENCIA DE SESIONES PLANIFICADAS (dato inmutable, usar SIEMPRE que menciones qué toca hoy/mañana, nunca inventar otro contenido):\nHoy (${estadoParaReferencia.dia_semana_hoy}): ${tituloHoyRef}\nMañana (${estadoParaReferencia.dia_semana_manana}): ${tituloMananaRef}`);

  // FORGE CURRENT_CYCLE / CURRENT_OBJECTIVE / CURRENT_AVAILABILITY — snapshots explicitos y aislados
  // de lectura obligatoria. El Coach debe usar SIEMPRE estos valores exactos si menciona ciclo,
  // objetivo o disponibilidad — nunca reconstruirlos desde la conversacion o inventarlos.
  const { data: usuarioSnapshots } = await supabase.from("usuarios").select("ciclo_actual,objetivo_principal,distribucion_semanal").eq("codigo", codigo).single();
  if (usuarioSnapshots?.ciclo_actual) {
    partes.push(`CURRENT_CYCLE (fuente unica de verdad del ciclo — NUNCA lo cambies ni lo reinterpretes por algo dicho en la conversacion): ${JSON.stringify(usuarioSnapshots.ciclo_actual)}`);
  }
  if (usuarioSnapshots?.objetivo_principal) {
    partes.push(`CURRENT_OBJECTIVE (fuente unica de verdad del objetivo — NUNCA lo cambies por una mencion casual en la conversacion): ${JSON.stringify(usuarioSnapshots.objetivo_principal)}`);
  }
  if (usuarioSnapshots?.distribucion_semanal) {
    partes.push(`CURRENT_AVAILABILITY (fuente unica de verdad de la disponibilidad — NUNCA la cambies por una mencion casual en la conversacion): ${JSON.stringify(usuarioSnapshots.distribucion_semanal)}`);
  }

  // FORGE BLOCK NARRATIVE — historia real del bloque actual, semana a semana. Permite al Coach
  // explicar decisiones con la evolucion real del atleta ("la semana pasada...") en vez de teoria generica.
  const narrativaBloque = await buildBlockNarrative(supabase, codigo);
  partes.push(narrativaBloque);

  // FORGE ATHLETE RESPONSE ENGINE — patrones de respuesta especificos y confirmados del atleta
  // (que estimulos generan que efectos), para que el Coach pueda justificar decisiones con evidencia real.
  const { data: patronesConfirmados } = await supabase.from("athlete_response_patterns").select("patron,categoria,confianza").eq("user_codigo", codigo).eq("activo", true).order("confianza", { ascending: false }).limit(5);
  if (patronesConfirmados && patronesConfirmados.length > 0) {
    partes.push(`PATRONES DE RESPUESTA CONFIRMADOS DE ESTE ATLETA (usa esto para justificar decisiones con evidencia real, nunca los inventes ni los ignores si son relevantes a la pregunta):\n${patronesConfirmados.map((p: any) => `- ${p.patron}`).join("\n")}`);
  }

  // FORGE CONVERSATION MEMORY — hechos ya conocidos de HOY, evita preguntas/recomendaciones repetidas
  const facts = await buildConversationFacts(supabase, codigo);
  const instruccionFacts = buildConversationFactsInstruction(facts);
  if (instruccionFacts) partes.push(instruccionFacts);

  // FORGE KNOWLEDGE ENGINE — informacion determinista, sin razonamiento, el Coach decide que hacer con ella
  const knowledge = await buildAthleteKnowledge(codigo);
  const lineasKnowledge: string[] = [];
  if (knowledge.objective) lineasKnowledge.push(`Objetivo: ${knowledge.objective}`);
  if (knowledge.block) lineasKnowledge.push(`Bloque: ${knowledge.block.bloque} — Semana ${knowledge.block.semana}/${knowledge.block.totalSemanas}`);
  if (knowledge.weaknesses.length > 0) lineasKnowledge.push(`Debilidad activa: ${knowledge.weaknesses[0]}`);
  if (knowledge.latestInsight) lineasKnowledge.push(`Último Insight: ${knowledge.latestInsight.substring(0, 150)}`);
  if (knowledge.recovery?.hrv) lineasKnowledge.push(`Recuperación actual: HRV ${knowledge.recovery.hrv}ms, sueño ${knowledge.recovery.sueno}/100, tendencia ${knowledge.recovery.tendencia || "sin datos"}`);
  if (lineasKnowledge.length > 0) partes.push(`FORGE KNOWLEDGE:\n${lineasKnowledge.join("\n")}`);

  partes.push(`EVENTO ACTUAL (${eventoActivoActual.eventType}):\n${eventoActivoActual.mensajesDelEvento.join("\n")}`);

  // Buscar el ultimo evento cerrado de tipo DIFERENTE al actual, que tenga event_context util
  const { data: ultimosEventos } = await supabase
    .from("event_log")
    .select("event_type,event_context,closed_at")
    .eq("user_codigo", codigo)
    .neq("event_type", eventoActivoActual.eventType)
    .order("closed_at", { ascending: false })
    .limit(3);

  const eventoRelevante = (ultimosEventos || []).find((e: any) => e.event_context?.summary);
  if (eventoRelevante) {
    const horasDesdeEvento = (Date.now() - new Date(eventoRelevante.closed_at).getTime()) / (60 * 60 * 1000);
    if (horasDesdeEvento < 24) { // solo relevante si fue en las ultimas 24h
      partes.push(`EVENTO ANTERIOR RELEVANTE (${eventoRelevante.event_type}, hace ${Math.round(horasDesdeEvento * 10) / 10}h): ${eventoRelevante.event_context.summary}`);
    }
  }

  return partes.join("\n\n---\n\n");
}

// Genera una "fotografia contextual" estructurada del evento, usando una llamada pequeña
// y dedicada (Haiku), separada del Coach principal. No da consejos, no inventa informacion.
// FORGE DISCOVERY ENGINE (v2) — sistema de niveles de evidencia, nunca especula.
// Nivel 1 OBSERVACION: "He detectado que..." (3+ puntos de datos)
// Nivel 2 PATRON_CONFIRMADO: "Tras N sesiones ya puedo afirmar..." (8+ puntos de datos, patron repetido)
// Nivel 3 RECOMENDACION: "A partir de ahora adaptaré..." (patron confirmado + accion concreta derivada)
// Regla estricta: prohibido usar "creo que" / "quizas" / "podria ser" — solo lenguaje de evidencia.
// FORGE CELEBRATIONS ENGINE — deteccion 100% determinista (sin LLM) de hitos objetivos.
// No solo PRs: constancia, semanas completas, recuperacion, adherencia sostenida.
interface Celebration {
  tipo: string;
  mensaje: string;
  emoji: string;
}

async function detectarCelebraciones(supabase: any, codigo: string): Promise<Celebration[]> {
  const celebraciones: Celebration[] = [];
  const { data } = await supabase.from("usuarios").select("workout_history,historial_fisiologico").eq("codigo", codigo).single();
  const workoutHistory = data?.workout_history || [];
  const fisioHistory = data?.historial_fisiologico || [];

  // 1. Racha de semanas consecutivas con adherencia completa (usando athlete_events forge_insight)
  const { data: insightsRecientes } = await supabase.from("athlete_events").select("data,date").eq("user_codigo", codigo).eq("type", "forge_insight").order("date", { ascending: false }).limit(4);
  const semanasCompletas = (insightsRecientes || []).filter((i: any) => {
    const adherencia = i.data?.adherencia || "";
    const match = adherencia.match(/(\d+)\/(\d+)/);
    return match && match[1] === match[2];
  }).length;
  if (semanasCompletas === 4) {
    celebraciones.push({ tipo: "constancia", emoji: "🔥", mensaje: "4 semanas seguidas con adherencia completa. Esto ya no es suerte — es un hábito consolidado." });
  } else if (semanasCompletas === 2) {
    celebraciones.push({ tipo: "constancia", emoji: "💪", mensaje: "2 semanas seguidas completando el 100% de tus sesiones. Vas construyendo una racha real." });
  }

  // 2. Tendencia de recuperacion ascendente sostenida (HRV subiendo en las ultimas 5 mediciones)
  const ultimosHRV = fisioHistory.slice(-5).map((f: any) => f.hrv).filter((v: any) => v !== null && v !== undefined);
  if (ultimosHRV.length >= 5) {
    const esAscendente = ultimosHRV.every((v: number, i: number) => i === 0 || v >= ultimosHRV[i - 1] - 5); // tolerancia pequeña
    if (esAscendente && ultimosHRV[ultimosHRV.length - 1] > ultimosHRV[0]) {
      celebraciones.push({ tipo: "recuperacion", emoji: "🧬", mensaje: `Tu HRV lleva 5 mediciones seguidas mejorando (${ultimosHRV[0]}ms → ${ultimosHRV[ultimosHRV.length - 1]}ms). Tu cuerpo está respondiendo muy bien al entrenamiento.` });
    }
  }

  // 3. Volumen total de sesiones registradas (hitos redondos: 25, 50, 100)
  const totalSesiones = workoutHistory.length;
  if ([25, 50, 100, 150, 200].includes(totalSesiones)) {
    celebraciones.push({ tipo: "volumen", emoji: "📊", mensaje: `Acabas de registrar tu sesión número ${totalSesiones} en Forge. Cada una ha construido el conocimiento que hoy tenemos sobre ti.` });
  }

  return celebraciones;
}

// FORGE ATHLETE RESPONSE ENGINE — a diferencia del Discovery Engine (patrones generales), este
// componente busca correlaciones ESPECIFICAS entre estimulos concretos y respuesta del atleta:
// que ejercicios/intensidades generan mejor adaptacion, cuales generan mas fatiga, como responde
// el sueño al tipo de sesion previa, etc. Requiere evidencia real, nunca especula. Se ejecuta con
// menor frecuencia que Discovery (necesita mas datos acumulados para ser fiable).
async function ejecutarAthleteResponseEngine(supabase: any, apiKey: string, codigo: string): Promise<{ generado: boolean }> {
  const { data: usuario } = await supabase.from("usuarios").select("workout_history,historial_fisiologico").eq("codigo", codigo).single();
  const workoutHistory = (usuario?.workout_history || []).slice(-40);
  const fisioHistory = (usuario?.historial_fisiologico || []).slice(-40);

  if (workoutHistory.length < 10) {
    return { generado: false }; // necesita suficiente historial para correlaciones fiables
  }

  const { data: patronesExistentes } = await supabase.from("athlete_response_patterns").select("patron").eq("user_codigo", codigo).eq("activo", true).limit(10);

  const responsePrompt = `Eres el Forge Athlete Response Engine. Tu unica tarea es analizar datos reales de entrenamiento
y fisiologia de un atleta buscando UNA correlacion especifica y verificable entre un ESTIMULO CONCRETO
(un ejercicio, tipo de sesion, o patron de sueño) y la RESPUESTA del atleta (fatiga, calidad, recuperacion).

NUNCA generes observaciones genericas tipo "entrenar es bueno para ti". Busca correlaciones ESPECIFICAS,
por ejemplo: "las sesiones con [ejercicio X] a partir de [condicion Y] generan [efecto Z]".

HISTORIAL DE ENTRENOS (hasta 40 ultimos):
${JSON.stringify(workoutHistory.map((w: any) => ({ tipo: w.tipo, fecha: w.fecha, sensacion: w.sensacion, notas: (w.notas || "").substring(0, 150) })))}

HISTORIAL FISIOLOGICO (hasta 40 ultimos dias):
${JSON.stringify(fisioHistory)}

PATRONES YA CONFIRMADOS ANTERIORMENTE (no repitas, busca uno DIFERENTE):
${(patronesExistentes || []).map((p: any) => p.patron).join(" | ") || "ninguno todavia"}

Si encuentras una correlacion especifica con al menos 3 puntos de evidencia real que la respalden, responde SOLO con este JSON:
{"hay_patron": true, "patron": "frase corta y especifica del patron detectado, en tercera persona sobre el atleta", "categoria": "fatiga|recuperacion|rendimiento|sueno|tecnica", "puntos_evidencia": numero_real_de_puntos_que_lo_respaldan}

Si NO hay evidencia suficientemente especifica y solida, responde SOLO con:
{"hay_patron": false}`;

  try {
    const responseRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 350, messages: [{ role: "user", content: responsePrompt }] }),
    });
    const responseData = await responseRes.json();
    const responseTexto = responseData.content?.map((b: any) => b.text || "").join("") || "{}";
    const responseClean = responseTexto.replace(/```json|```/gi, "").trim();
    const responseMatch = responseClean.match(/\{[\s\S]*\}/);
    if (!responseMatch) return { generado: false };

    const resultado = JSON.parse(responseMatch[0]);
    if (!resultado.hay_patron || !resultado.patron) return { generado: false };

    // FORGE ATHLETE KNOWLEDGE — pipeline correcto: nace como "candidato" con confianza baja.
    // Solo asciende a "activo" cuando la evidencia acumulada supera el umbral — nunca directamente
    // desde una sola deteccion del LLM, evitando el mismo error que tuvo aprendizajes_atleta.
    const puntosEvidenciaNuevo = resultado.puntos_evidencia || 3;
    const esActivo = puntosEvidenciaNuevo >= 8;
    await supabase.from("athlete_knowledge_points").insert({
      user_codigo: codigo,
      categoria: resultado.categoria || "respuesta_entrenamiento",
      conocimiento: resultado.patron,
      confianza: esActivo ? 0.8 : 0.5,
      puntos_evidencia: puntosEvidenciaNuevo,
      estado: esActivo ? "activo" : "candidato",
      fuente: "athlete_response_engine",
      ultima_evidencia: new Date().toISOString()
    });

    // NOTA: ya no se escribe en aprendizajes_atleta (deprecado). athlete_knowledge_points es ahora
    // la unica fuente real del Nivel de Conocimiento, calculado dinamicamente en obtener_daily_briefing.
    return { generado: true };
  } catch {
    return { generado: false };
  }
}

async function ejecutarDiscoveryEngine(supabase: any, apiKey: string, codigo: string): Promise<{ generado: boolean; nivel?: string }> {
  const { data: usuarioDiscovery } = await supabase.from("usuarios").select("workout_history,historial_fisiologico").eq("codigo", codigo).single();
  const historialCompleto = (usuarioDiscovery?.workout_history || []).slice(-30);
  const fisioCompleto = (usuarioDiscovery?.historial_fisiologico || []).slice(-30);

  if (historialCompleto.length < 3 && fisioCompleto.length < 3) {
    return { generado: false }; // sin datos suficientes, ni lo intentamos
  }

  const discoveryPrompt = `Eres el Forge Discovery Engine. Analiza estos datos reales de un atleta y busca UN patrón genuino y verificable. NUNCA inventes uno si no hay evidencia clara. NUNCA uses "creo que", "quizás", "podría ser" — solo lenguaje de evidencia directa: "he detectado", "he confirmado", "ya tengo evidencia de".

HISTORIAL DE ENTRENOS (hasta 30 últimos):
${JSON.stringify(historialCompleto.map((w: any) => ({ tipo: w.tipo, fecha: w.fecha, sensacion: w.sensacion })))}

HISTORIAL FISIOLÓGICO (hasta 30 últimos días):
${JSON.stringify(fisioCompleto)}

NIVELES DE EVIDENCIA (elige el nivel correcto según cuántos puntos de datos respaldan el patrón):
- OBSERVACION (3-7 puntos de datos): un patrón inicial, aún acumulando evidencia. Lenguaje: "He detectado que..."
- PATRON_CONFIRMADO (8+ puntos de datos consistentes): un patrón sólido y repetido. Lenguaje: "Tras X sesiones/días ya puedo confirmar que..."
- RECOMENDACION (patrón confirmado + acción concreta derivable): no solo el patrón, sino qué harás distinto a partir de ahora. Lenguaje: "A partir de ahora adaptaré..."

Busca patrones como: relación entre tipo de entreno y sensación/recuperación posterior, relación entre sueño y rendimiento, tendencias de mejora, correlaciones entre HRV y tipo de sesión previa, tolerancia a volumen o intensidad.

Si encuentras un patrón con evidencia real, responde SOLO con este JSON:
{"hay_patron": true, "nivel": "OBSERVACION|PATRON_CONFIRMADO|RECOMENDACION", "descubrimiento": "frase corta y natural usando el lenguaje de evidencia correcto para el nivel", "categoria": "recuperacion|rendimiento|sueno|entrenamiento", "puntos_evidencia": número real de puntos de datos que lo respaldan}

Si NO hay evidencia suficientemente clara para ningún nivel, responde SOLO con:
{"hay_patron": false}`;

  try {
    const discoveryRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 350, messages: [{ role: "user", content: discoveryPrompt }] }),
    });
    const discoveryData = await discoveryRes.json();
    const discoveryTexto = discoveryData.content?.map((b: any) => b.text || "").join("") || "{}";
    const discoveryClean = discoveryTexto.replace(/```json|```/gi, "").trim();
    const discoveryMatch = discoveryClean.match(/\{[\s\S]*\}/);
    if (!discoveryMatch) return { generado: false };

    const discoveryResult = JSON.parse(discoveryMatch[0]);
    if (!discoveryResult.hay_patron || !discoveryResult.descubrimiento) return { generado: false };

    // Deduplicacion: no guardar si ya existe un descubrimiento muy similar reciente (ultimos 8)
    const { data: descubrimientosRecientes } = await supabase.from("forge_discoveries").select("descubrimiento").eq("user_codigo", codigo).order("created_at", { ascending: false }).limit(8);
    const yaExisteSimilar = (descubrimientosRecientes || []).some((d: any) => d.descubrimiento?.toLowerCase().includes(discoveryResult.descubrimiento.toLowerCase().substring(0, 30)));
    if (yaExisteSimilar) return { generado: false };

    await supabase.from("forge_discoveries").insert({
      user_codigo: codigo,
      descubrimiento: discoveryResult.descubrimiento,
      categoria: discoveryResult.categoria || "general",
      confianza: discoveryResult.puntos_evidencia >= 8 ? 85 : 60,
      nivel: (discoveryResult.nivel || "observacion").toLowerCase(),
      puntos_evidencia: discoveryResult.puntos_evidencia || 3,
      visto: false,
      presentado_al_usuario: false
    });

    return { generado: true, nivel: discoveryResult.nivel };
  } catch {
    return { generado: false };
  }
}

async function generarEventContext(apiKey: string, eventType: string, mensajes: string[]): Promise<any> {
  const textoEvento = mensajes.join("\n\n");
  const prompt = `Resume este evento en una fotografia estructurada. NO des consejos. NO inventes informacion que no este en el texto. Responde SOLO con JSON valido, sin markdown:

Tipo de evento: ${eventType}
Texto del evento:
${textoEvento}

Formato de respuesta:
{
  "summary": "resumen en maximo 20 palabras de lo que ocurrio",
  "status": "completed|reported|mentioned",
  "entities": {
    "workout": ["ejercicios mencionados, vacio si no aplica"],
    "injuries": ["molestias o lesiones mencionadas, vacio si no aplica"],
    "physiology": ["metricas mencionadas como hrv/sueno/fc, vacio si no aplica"]
  }
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const texto = data.content?.map((b: any) => b.text || "").join("") || "{}";
    const clean = texto.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Marca el evento activo como ya extraido, iniciando la ventana de correccion de 3 minutos.
// Ademas registra un log inmutable del evento con su event_context (fotografia estructurada)
// para el Event Inspector y para el futuro Forge Context Builder.
async function marcarEventoComoExtraido(supabase: any, apiKey: string, codigo: string, extraccionExitosa: boolean) {
  const { data: eventoActual } = await supabase.from("active_events").select("*").eq("user_codigo", codigo).single();
  if (eventoActual) {
    const yaEstabaExtraido = eventoActual.status === "extracted";
    const eventContext = await generarEventContext(apiKey, eventoActual.event_type, eventoActual.messages || []);
    await supabase.from("event_log").insert({
      user_codigo: codigo,
      event_id: eventoActual.event_id,
      event_type: eventoActual.event_type,
      status: "extracted",
      mensajes_count: (eventoActual.messages || []).length,
      fue_correccion: yaEstabaExtraido,
      extraccion_exitosa: extraccionExitosa,
      event_context: eventContext,
      closed_at: new Date().toISOString()
    });
  }
  await supabase.from("active_events").update({ status: "extracted" }).eq("user_codigo", codigo);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 500 });
  }

  const { messages, system, model, max_tokens, action, codigo, datos, email, codigoConjunto } = await req.json();

  // FORGE MOBILE IDENTITY BRIDGE — colocada AQUI AL PRINCIPIO (antes del rate limiting y cualquier
  // otra logica) porque esta accion no envia "codigo" en el nivel raiz del payload (solo authUserId
  // dentro de datos) — colocarla mas abajo en la cadena de ifs la exponia a fallar por logica
  // intermedia que asumia la presencia de codigo sin verificarla explicitamente.
  if (action === "verificar_email_registrado") {
    // FORGE MOBILE — verificacion honesta de email ya existente ANTES del registro. Supabase Auth
    // signUp() nunca devuelve error real para emails ya registrados (por diseño de seguridad, evita
    // enumeracion de cuentas desde el cliente) — el frontend recibia "exito" y el mensaje enganoso
    // "revisa tu correo" aunque el email ya existiera. Esta accion consulta directamente auth.users
    // con la service_role key (solo disponible en backend) para dar feedback honesto al usuario.
    try {
      const { email } = datos || {};
      if (!email) return NextResponse.json({ error: "Falta email" }, { status: 400 });
      const { data: usuarioExistente } = await supabase.from("usuarios").select("codigo").eq("email", email.toLowerCase().trim()).maybeSingle();
      return NextResponse.json({ yaExiste: !!usuarioExistente });
    } catch (err: any) {
      console.error("Error en verificar_email_registrado:", err);
      return NextResponse.json({ yaExiste: false });
    }
  }

  if (action === "obtener_codigo_por_auth_user_id") {
    try {
      const { authUserId } = datos || {};
      if (!authUserId) return NextResponse.json({ error: "Falta authUserId" }, { status: 400 });
      const { data: usuarioPorAuth, error: errorPorAuth } = await supabase.from("usuarios").select("codigo").eq("auth_user_id", authUserId).single();
      if (errorPorAuth || !usuarioPorAuth) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, codigo: usuarioPorAuth.codigo });
    } catch (err: any) {
      console.error("Error en obtener_codigo_por_auth_user_id:", err);
      return NextResponse.json({ error: "Error interno: " + err.message }, { status: 500 });
    }
  }

  // FORGE MOBILE — DIAGNOSTICO TEMPORAL: verifica que getAthleteContext() construye correctamente
  // el contexto antes de conectar nada mas. Se eliminara una vez confirmada la prueba de equivalencia.
  if (action === "verificar_onboarding_completado") {
    // Consulta minima y rapida, solo lectura, para que el movil sepa si mostrar Onboarding u Home.
    const { data: usuarioOnb } = await supabase.from("usuarios").select("onboarding_completado").eq("codigo", codigo).single();
    return NextResponse.json({ completado: !!usuarioOnb?.onboarding_completado });
  }

  if (action === "completar_onboarding") {
    // FORGE MOBILE ONBOARDING V1 — backend-first, idempotente. El movil manda datos minimos
    // (categoria, objetivo, disponibilidad) y el backend hace TODO el trabajo: validar identidad,
    // completar el perfil, generar el mensaje de bienvenida (parte LLM/generativa), y persistir.
    // Idempotencia REAL: si ya existe bienvenida generada, no se repite nada, se devuelve el estado ya completado.
    try {
      const { authUserId, categoria, objetivo, disponibilidad, modoEntrada } = datos || {};
      if (!authUserId || !categoria) {
        return NextResponse.json({ error: "Faltan datos obligatorios (authUserId, categoria)" }, { status: 400 });
      }

      // Verificacion de identidad real, mismo patron que enviar_mensaje_coach
      const { data: usuarioOnboarding, error: errorUsuarioOnboarding } = await supabase.from("usuarios").select("codigo,auth_user_id,onboarding_completado,historial,perfil,categoria").eq("codigo", codigo).single();
      if (errorUsuarioOnboarding || !usuarioOnboarding) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      if (usuarioOnboarding.auth_user_id !== authUserId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      // IDEMPOTENCIA: si ya se completo el onboarding, no repetir nada — devolver estado ya existente
      if (usuarioOnboarding.onboarding_completado) {
        return NextResponse.json({
          ok: true,
          yaCompletado: true,
          codigo,
          welcomeMessage: (usuarioOnboarding.historial || []).find((m: any) => m.role === "assistant")?.content || ""
        });
      }

      // PARTE DETERMINISTA — construir el perfil minimo V1, sin LLM. Reutiliza exactamente las
      // mismas categorias/valores que la web (funcional/carrera/fuerza/hibrido), sin inventar taxonomia nueva.
      const perfilMinimo = { objetivo_general: objetivo || "No especificado" };
      const distribucionMinima = disponibilidad ? JSON.stringify(disponibilidad) : "";
      const modoEntradaFinal = modoEntrada || "supervision";

      await supabase.from("usuarios").update({
        categoria,
        especialidad: categoria,
        perfil: perfilMinimo,
        distribucion_semanal: distribucionMinima,
        modo_entrada: modoEntradaFinal,
        marcas: [],
      }).eq("codigo", codigo);

      // PARTE GENERATIVA — mensaje de bienvenida via LLM, EQUIVALENTE a iniciarChat() de la web
      // pero simplificado (sin distinguir rehab/supervision con prompts extensos por ahora, V1).
      const catLabel: Record<string, string> = { funcional: "Functional Training (CrossFit/Hyrox/Fitness)", carrera: "Carrera (Running/Trail)", fuerza: "Fuerza (Powerlifting/Halterofilia/Strongman)", hibrido: "Híbrido (Resistencia + Fuerza)" };
      const catObjOnboarding = { id: categoria, titulo: catLabel[categoria] || categoria };

      const promptBienvenida = modoEntradaFinal === "supervision"
        ? "¡Hola! Ya tengo mi propia planificación o entrenador — no necesito que Forge me genere un plan. Preséntate brevemente explicando cómo me vas a ayudar en este modo: puedo registrar mis entrenos y métricas para que los organices, preguntarte dudas técnicas, y avisarte si necesito adaptar algo por fatiga o molestias."
        : "¡Hola! Acabo de completar mi perfil. Preséntate brevemente, demuestra que conoces mi disciplina y objetivo, y pregúntame cómo puedo empezar a contarte sobre mi entrenamiento.";

      const { buildPrompt } = await import("@/lib/mobile/buildPrompt");
      const systemBienvenida = buildPrompt(catObjOnboarding, perfilMinimo, [], "", undefined, undefined, undefined, false, undefined, undefined, undefined, undefined, distribucionMinima, objetivo ? { descripcion: objetivo } : undefined);

      let textoBienvenida = "¡Bienvenido a Forge! Cuéntame cómo puedo ayudarte.";
      try {
        const bienvenidaRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, system: systemBienvenida, messages: [{ role: "user", content: promptBienvenida }] }),
        });
        const bienvenidaData = await bienvenidaRes.json();
        textoBienvenida = bienvenidaData.content?.map((b: any) => b.text || "").join("") || textoBienvenida;
      } catch (err) {
        console.error("Error generando bienvenida onboarding:", err);
      }

      const historialInicial = [{ role: "user", content: "[Inicio de conversación]" }, { role: "assistant", content: textoBienvenida }];
      await supabase.from("usuarios").update({ historial: historialInicial, onboarding_completado: true, updated_at: new Date().toISOString() }).eq("codigo", codigo);

      return NextResponse.json({ ok: true, yaCompletado: false, codigo, welcomeMessage: textoBienvenida });
    } catch (err: any) {
      console.error("Error en completar_onboarding:", err);
      return NextResponse.json({ error: "Error: " + err.message }, { status: 500 });
    }
  }

  // FORGE ONBOARDING STATE MACHINE — define, por modo, los campos OBLIGATORIOS del nucleo comun
// + especificos de cada modo. Es la unica fuente de verdad de "que hace falta" — nunca el LLM.
const CAMPOS_REQUERIDOS_POR_MODO: Record<string, string[]> = {
  supervision: ["categoria", "objetivo", "edad", "nivel"],
  coach: ["categoria", "objetivo", "edad", "nivel", "disponibilidad", "duracion_sesion"],
  focus: ["categoria", "objetivo", "edad", "nivel", "duracion_sesion", "disciplina_forge", "dias_forge", "disciplina_externa", "dias_externos", "fc_max_o_metodo"],
};

// FORGE ONBOARDING STATE MACHINE — calcula el estado REAL consultando las tablas canonicas
// (usuarios, athlete_training_sources), nunca confiando en lo que el LLM "cree" completado.
async function calcularEstadoOnboarding(supabase: any, codigo: string, mode: string) {
  const { data: usuarioOnb } = await supabase.from("usuarios").select("perfil,categoria,objetivo_principal,distribucion_semanal").eq("codigo", codigo).maybeSingle();
  const { data: fuentesOnb } = await supabase.from("athlete_training_sources").select("*").eq("user_codigo", codigo).eq("activo", true);

  const perfilOnb = usuarioOnb?.perfil || {};
  const completedFields: Record<string, boolean> = {};
  completedFields.categoria = !!usuarioOnb?.categoria;
  completedFields.objetivo = !!(usuarioOnb?.objetivo_principal?.descripcion || perfilOnb.objetivo_detalle);
  completedFields.edad = !!perfilOnb.edad;
  // FIX: distintas categorias usan IDs de campo distintos para "nivel" (nivel, nivel_cf,
  // nivel_hyrox, nivel_ocr, nivel_carrera, experiencia_fuerza, etc) — reconocer cualquier
  // variante real, no solo el ID literal "nivel".
  completedFields.nivel = !!(perfilOnb.nivel || perfilOnb.nivel_cf || perfilOnb.nivel_hyrox || perfilOnb.nivel_ocr || perfilOnb.nivel_carrera || perfilOnb.experiencia_fuerza);
  completedFields.disponibilidad = !!usuarioOnb?.distribucion_semanal;
  completedFields.duracion_sesion = !!perfilOnb.duracion;
  completedFields.disciplina_forge = !!(fuentesOnb || []).find((f: any) => f.owner === "forge");
  completedFields.dias_forge = !!(fuentesOnb || []).find((f: any) => f.owner === "forge" && f.dias?.length > 0);
  completedFields.disciplina_externa = !!(fuentesOnb || []).find((f: any) => f.owner === "external");
  completedFields.dias_externos = !!(fuentesOnb || []).find((f: any) => f.owner === "external" && f.dias?.length > 0);
  // FIX: fc_max ahora se captura DIRECTAMENTE en el formulario (pregunta condicional, solo si
  // tiene pulsometro/reloj), no en una pantalla separada tras la bienvenida. Si el usuario no
  // tiene dispositivo, la pregunta ni siquiera se muestra — se usara formula por edad siempre,
  // asi que el campo se considera "completado" en cuanto el formulario general esta terminado
  // (perfil.edad existe), sin exigir un dato que puede legitimamente no aplicar.
  completedFields.fc_max_o_metodo = !!perfilOnb.edad;

  const camposRequeridos = CAMPOS_REQUERIDOS_POR_MODO[mode] || CAMPOS_REQUERIDOS_POR_MODO.supervision;
  const missingFields = camposRequeridos.filter(c => !completedFields[c]);

  return { completedFields, missingFields, camposRequeridos };
}

if (action === "verificar_datos_cambio_modo_deterministico") {
    // FORGE MODE CHANGE — Safety Net que captura los datos que el atleta va dando en conversacion
    // (dias disponibles, disciplina externa) mientras esta en medio de un flujo de cambio de modo,
    // y ejecuta el cambio real en cuanto missingFields llega a []. El LLM conversa/pregunta, pero
    // NUNCA decide guardar los datos ni ejecutar la transicion — eso lo hace este parser + la RPC.
    const { targetMode, mensajeUsuario, respuestaCoach } = datos;
    if (!targetMode || !mensajeUsuario) return NextResponse.json({ ok: true, detectado: false });

    const capturaPrompt = `Analiza este intercambio entre un atleta y su Coach de fitness. El atleta esta configurando el modo "${targetMode}" de Forge, que requiere conocer su disponibilidad y, si aplica, su disciplina externa (gestionada por otro entrenador).

Mensaje del atleta: "${mensajeUsuario}"
Respuesta del coach: "${respuestaCoach || ''}"

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"dias_disponibles":["lista de dias en minusculas sin tildes que el atleta puede entrenar en general, o array vacio si no los menciono"],"disciplina_externa":"nombre de la disciplina externa mencionada o null","dias_externos":["dias de esa disciplina externa, o array vacio"],"duracion_externa":"duracion mencionada o null","intensidad_externa":"baja|moderada|alta|muy variable, o null"}

Extrae SOLO datos que el mensaje contenga explicitamente, nunca inventes valores.`;

    try {
      const capturaRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: capturaPrompt }] }),
      });
      const capturaData = await capturaRes.json();
      const capturaTexto = capturaData.content?.map((b: any) => b.text || "").join("") || "{}";
      const capturaClean = capturaTexto.replace(/```json|```/g, "").trim();
      const capturaMatch = capturaClean.match(/\{[\s\S]*\}/);
      if (!capturaMatch) return NextResponse.json({ ok: true, detectado: false });
      const extraido = JSON.parse(capturaMatch[0]);

      // Guardar lo que se haya capturado, de forma incremental (nunca sobrescribe con vacio lo que ya existia)
      if (extraido.dias_disponibles?.length > 0) {
        await supabase.from("usuarios").update({ distribucion_semanal: JSON.stringify({ disponibilidad: extraido.dias_disponibles.join(", ") }) }).eq("codigo", codigo);
      }
      if (extraido.disciplina_externa && extraido.dias_externos?.length > 0) {
        await supabase.from("athlete_training_sources").upsert({
          user_codigo: codigo, disciplina: extraido.disciplina_externa, owner: "external",
          dias: extraido.dias_externos, duracion_habitual: extraido.duracion_externa || null,
          intensidad_habitual: extraido.intensidad_externa || null, activo: true
        }, { onConflict: "user_codigo,disciplina" });
      }

      // Verificar si ya esta completo para ejecutar el cambio real
      const { missingFields } = await calcularEstadoOnboarding(supabase, codigo, targetMode);
      if (missingFields.length === 0) {
        let nuevoCicloCaptura = null;
        if (targetMode === 'focus' || targetMode === 'coach') {
          const { data: usuarioParaCicloCaptura } = await supabase.from("usuarios").select("objetivo_principal,perfil").eq("codigo", codigo).single();
          nuevoCicloCaptura = { bloque: "acumulacion", semana: 1, totalSemanas: 4, objetivo: usuarioParaCicloCaptura?.objetivo_principal?.descripcion || usuarioParaCicloCaptura?.perfil?.objetivo_detalle || "Nueva planificacion" };
        }
        const { data: resultadoCapturaCambio, error: errorCapturaCambio } = await supabase.rpc('change_athlete_mode', {
          p_codigo: codigo, p_target_mode: targetMode, p_reason: 'user_requested_conversation', p_new_cycle: nuevoCicloCaptura
        });
        if (!errorCapturaCambio) {
          console.log(`🔄 MODE CHANGE (via conversacion): ${codigo} — ${JSON.stringify(resultadoCapturaCambio)}`);
          return NextResponse.json({ ok: true, detectado: true, cambioEjecutado: true, resultado: resultadoCapturaCambio });
        }
      }

      return NextResponse.json({ ok: true, detectado: true, cambioEjecutado: false });
    } catch (err: any) {
      console.error("Error en verificar_datos_cambio_modo_deterministico:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  // FORGE MODE TRANSITION FLOW — definicion declarativa de COMO preguntar y DONDE guardar cada
// campo. Vive en el backend (no duplicada en cada pagina frontend) para que /perfil y cualquier
// otro consumidor futuro obtengan la misma fuente unica de verdad sobre la representacion de UI.
const DEFINICION_CAMPOS_MODE_CHANGE: Record<string, any> = {
  edad: { label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"], storageKey: "edad", storageTarget: "perfil" },
  nivel: { label: "¿Cuál es tu nivel de experiencia?", tipo: "opciones", opciones: ["Principiante", "Intermedio", "Avanzado"], storageKey: "nivel", storageTarget: "perfil" },
  objetivo: { label: "¿Qué quieres conseguir exactamente?", tipo: "texto", storageKey: "objetivo_detalle", storageTarget: "perfil" },
  duracion_sesion: { label: "¿Cuánto tiempo disponible por sesión?", tipo: "opciones", opciones: ["Hasta 30 min", "Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"], storageKey: "duracion", storageTarget: "perfil" },
  disponibilidad: { label: "¿Qué días de la semana puedes entrenar la disciplina que gestionará Forge?", tipo: "dias_semana", storageKey: "dias_disponibles_forge", storageTarget: "distribucion" },
  disciplina_forge: { label: "¿Qué disciplina quieres que gestione Forge a partir de ahora?", tipo: "texto", storageKey: "disciplina", storageTarget: "training_source_forge" },
  dias_forge: { label: "¿Qué días de la semana entrenarás esa disciplina?", tipo: "dias_semana", storageKey: "dias", storageTarget: "training_source_forge" },
  disciplina_externa: { label: "¿Qué disciplina entrenas con OTRO entrenador (que Forge no debe tocar)?", tipo: "texto", storageKey: "disciplina", storageTarget: "training_source_external" },
  dias_externos: { label: "¿Qué días entrenas esa disciplina externa?", tipo: "dias_semana", storageKey: "dias", storageTarget: "training_source_external" },
};

if (action === "verificar_cambio_modo") {
    // FORGE MODE CHANGE — solo lectura, sin efectos secundarios. Reutiliza EXACTAMENTE el mismo
    // motor que el onboarding original (calcularEstadoOnboarding + CAMPOS_REQUERIDOS_POR_MODO):
    // los requisitos pertenecen al modo DESTINO, no importa como llego el atleta hasta ahi. No se
    // borra ningun dato del modo anterior — solo cambia que campos son obligatorios ahora.
    const { targetMode } = datos;
    if (!['supervision', 'focus', 'coach'].includes(targetMode)) {
      return NextResponse.json({ error: "Modo destino invalido" }, { status: 400 });
    }
    const { completedFields, missingFields } = await calcularEstadoOnboarding(supabase, codigo, targetMode);
    // getRequiredFocusFields(): mapea CADA missingField a su definicion de UI — nunca vuelve a
    // decidir si es obligatorio, solo traduce el ID ya calculado a como preguntarlo y donde guardarlo.
    const missingFieldsConDefinicion = missingFields.map(f => ({ id: f, ...(DEFINICION_CAMPOS_MODE_CHANGE[f] || { label: f, tipo: "texto", storageKey: f, storageTarget: "perfil" }) }));
    return NextResponse.json({ targetMode, completedFields, missingFields, missingFieldsConDefinicion, completo: missingFields.length === 0 });
  }

  if (action === "guardar_campo_mode_change") {
    // FORGE MODE TRANSITION FLOW — guarda UN campo estructurado validado por la UI (nunca texto
    // libre interpretado), en el destino correcto segun su storageTarget. Determinista: mismo
    // patron de guardado que ya usamos en el resto de Forge, sin ningun LLM en el camino.
    const { fieldId, value } = datos;
    const definicionCampo = DEFINICION_CAMPOS_MODE_CHANGE[fieldId];
    if (!definicionCampo) return NextResponse.json({ error: "Campo desconocido: " + fieldId }, { status: 400 });

    if (definicionCampo.storageTarget === "perfil") {
      const { data: usuarioParaCampo } = await supabase.from("usuarios").select("perfil").eq("codigo", codigo).single();
      const perfilActualizado = { ...(usuarioParaCampo?.perfil || {}), [definicionCampo.storageKey]: value };
      await supabase.from("usuarios").update({ perfil: perfilActualizado }).eq("codigo", codigo);
    } else if (definicionCampo.storageTarget === "distribucion") {
      const diasTexto = Array.isArray(value) ? value.join(", ") : value;
      await supabase.from("usuarios").update({ distribucion_semanal: JSON.stringify({ disponibilidad: diasTexto }) }).eq("codigo", codigo);
    } else if (definicionCampo.storageTarget === "training_source_forge") {
      // disciplina_forge y dias_forge se acumulan en la MISMA fila (upsert incremental)
      const { data: fuenteForgeExistente } = await supabase.from("athlete_training_sources").select("*").eq("user_codigo", codigo).eq("owner", "forge").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const filaForgeActualizada: any = { user_codigo: codigo, owner: "forge", activo: true, disciplina: fuenteForgeExistente?.disciplina || "forge", dias: fuenteForgeExistente?.dias || null, prioridad: fuenteForgeExistente?.prioridad || "importante" };
      if (definicionCampo.storageKey === "disciplina") filaForgeActualizada.disciplina = value;
      if (definicionCampo.storageKey === "dias") filaForgeActualizada.dias = value;
      await supabase.from("athlete_training_sources").upsert(filaForgeActualizada, { onConflict: "user_codigo,disciplina" });
    } else if (definicionCampo.storageTarget === "training_source_external") {
      // disciplina_externa y dias_externos se acumulan en la MISMA fila (upsert incremental)
      const { data: fuenteExistente } = await supabase.from("athlete_training_sources").select("*").eq("user_codigo", codigo).eq("owner", "external").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const filaActualizada: any = { user_codigo: codigo, owner: "external", activo: true, disciplina: fuenteExistente?.disciplina || "externo", dias: fuenteExistente?.dias || null };
      if (definicionCampo.storageKey === "disciplina") filaActualizada.disciplina = value;
      if (definicionCampo.storageKey === "dias") filaActualizada.dias = value;
      await supabase.from("athlete_training_sources").upsert(filaActualizada, { onConflict: "user_codigo,disciplina" });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "cambiar_modo_atleta") {
    // FORGE MODE CHANGE — ejecucion real. Guard determinista final: nunca confia en que el frontend
    // ya verifico missingFields, lo recalcula aqui mismo antes de construir el nuevo ciclo y llamar
    // a la RPC transaccional change_athlete_mode (atomica: todo o nada, nunca estado intermedio).
    const { targetMode, reason } = datos;
    if (!['supervision', 'focus', 'coach'].includes(targetMode)) {
      return NextResponse.json({ error: "Modo destino invalido" }, { status: 400 });
    }
    const { missingFields } = await calcularEstadoOnboarding(supabase, codigo, targetMode);
    if (missingFields.length > 0) {
      return NextResponse.json({ error: "Faltan campos obligatorios para este modo", missingFields }, { status: 400 });
    }

    // Construir el nuevo ciclo — logica de planificacion, vive en TypeScript, nunca en la RPC
    let nuevoCiclo = null;
    if (targetMode === 'focus' || targetMode === 'coach') {
      const { data: usuarioParaCiclo } = await supabase.from("usuarios").select("objetivo_principal,perfil").eq("codigo", codigo).single();
      nuevoCiclo = {
        bloque: "acumulacion",
        semana: 1,
        totalSemanas: 4,
        objetivo: usuarioParaCiclo?.objetivo_principal?.descripcion || usuarioParaCiclo?.perfil?.objetivo_detalle || "Nueva planificacion"
      };
    }

    const { data: resultadoCambio, error: errorCambio } = await supabase.rpc('change_athlete_mode', {
      p_codigo: codigo,
      p_target_mode: targetMode,
      p_reason: reason || 'user_requested',
      p_new_cycle: nuevoCiclo
    });

    if (errorCambio) {
      console.error("Error en cambiar_modo_atleta (RPC):", errorCambio);
      return NextResponse.json({ error: errorCambio.message }, { status: 500 });
    }

    console.log(`🔄 MODE CHANGE: ${codigo} — ${JSON.stringify(resultadoCambio)}`);
    return NextResponse.json(resultadoCambio);
  }

  if (action === "cambiar_codigo_usuario") {
    // FORGE — cambio de codigo de acceso. Migra el codigo en TODAS las tablas relacionadas,
    // mismo patron que eliminar_cuenta pero con UPDATE en vez de DELETE.
    const { nuevoCodigo } = datos;
    if (!nuevoCodigo || nuevoCodigo.trim().length < 5) {
      return NextResponse.json({ error: "El código debe tener al menos 5 caracteres" }, { status: 400 });
    }
    const nuevoCodigoLimpio = nuevoCodigo.trim().toUpperCase();

    const { data: usuarioExistenteCheck } = await supabase.from("usuarios").select("codigo").eq("codigo", nuevoCodigoLimpio).maybeSingle();
    if (usuarioExistenteCheck) {
      return NextResponse.json({ error: "Este código ya existe, elige otro" }, { status: 400 });
    }

    const tablasConUserCodigo = [
      "weekly_plan", "weekly_plan_generation_log", "weekly_plan_events", "pending_actions",
      "athlete_coaching_notes", "athlete_state_events", "athlete_training_sources",
      "external_training_records", "physiology_records", "readiness_checkins",
      "session_modification_events", "onboarding_state", "block_outcomes", "athlete_mode_events"
    ];
    await Promise.all(tablasConUserCodigo.map(tabla => supabase.from(tabla).update({ user_codigo: nuevoCodigoLimpio }).eq("user_codigo", codigo)));

    const { error: errorCambioCodigo } = await supabase.from("usuarios").update({ codigo: nuevoCodigoLimpio }).eq("codigo", codigo);
    if (errorCambioCodigo) return NextResponse.json({ error: errorCambioCodigo.message }, { status: 500 });

    console.log(`🔄 CODIGO CAMBIADO: ${codigo} -> ${nuevoCodigoLimpio}`);
    return NextResponse.json({ ok: true, nuevoCodigo: nuevoCodigoLimpio });
  }

  if (action === "eliminar_cuenta") {
    // FORGE — eliminacion de cuenta con confirmacion ya realizada en el frontend (doble paso).
    // El email queda registrado como bloqueado para evitar reabrir cuenta nueva y reiniciar el
    // periodo de prueba gratuita. Elimina datos reales de todas las tablas relacionadas.
    const { data: usuarioEliminar } = await supabase.from("usuarios").select("email").eq("codigo", codigo).maybeSingle();
    if (!usuarioEliminar) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (usuarioEliminar.email) {
      await supabase.from("emails_eliminados").insert({ email: usuarioEliminar.email.toLowerCase().trim(), codigo_original: codigo, motivo: "eliminacion_solicitada_por_usuario" });
    }

    // Eliminar datos relacionados en orden (tablas con foreign key logica al codigo)
    await Promise.all([
      supabase.from("weekly_plan").delete().eq("user_codigo", codigo),
      supabase.from("weekly_plan_generation_log").delete().eq("user_codigo", codigo),
      supabase.from("weekly_plan_events").delete().eq("user_codigo", codigo),
      supabase.from("pending_actions").delete().eq("user_codigo", codigo),
      supabase.from("athlete_coaching_notes").delete().eq("user_codigo", codigo),
      supabase.from("athlete_state_events").delete().eq("user_codigo", codigo),
      supabase.from("athlete_training_sources").delete().eq("user_codigo", codigo),
      supabase.from("external_training_records").delete().eq("user_codigo", codigo),
      supabase.from("physiology_records").delete().eq("user_codigo", codigo),
      supabase.from("readiness_checkins").delete().eq("user_codigo", codigo),
      supabase.from("session_modification_events").delete().eq("user_codigo", codigo),
      supabase.from("onboarding_state").delete().eq("user_codigo", codigo),
      supabase.from("block_outcomes").delete().eq("user_codigo", codigo),
    ]);

    const { error: errorEliminarUsuario } = await supabase.from("usuarios").delete().eq("codigo", codigo);
    if (errorEliminarUsuario) return NextResponse.json({ error: errorEliminarUsuario.message }, { status: 500 });

    console.log(`🗑️ CUENTA ELIMINADA: ${codigo}, email bloqueado: ${usuarioEliminar.email || "sin email"}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "verificar_email_bloqueado") {
    const { email } = datos || {};
    if (!email) return NextResponse.json({ error: "Falta email" }, { status: 400 });
    const { data: emailBloqueado } = await supabase.from("emails_eliminados").select("id").eq("email", email.toLowerCase().trim()).maybeSingle();
    return NextResponse.json({ bloqueado: !!emailBloqueado });
  }

  if (action === "obtener_estado_onboarding") {
    const { mode } = datos;
    const { data: estadoExistente } = await supabase.from("onboarding_state").select("*").eq("user_codigo", codigo).maybeSingle();
    const modoReal = estadoExistente?.mode || mode || "supervision";
    const { completedFields, missingFields } = await calcularEstadoOnboarding(supabase, codigo, modoReal);

    const statusReal = missingFields.length > 0 ? "in_progress" : (estadoExistente?.confirmed ? "completed" : "awaiting_confirmation");

    await supabase.from("onboarding_state").upsert({
      user_codigo: codigo,
      mode: modoReal,
      status: statusReal,
      completed_fields: completedFields,
      missing_fields: missingFields,
      confirmed: estadoExistente?.confirmed || false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_codigo" });

    return NextResponse.json({ mode: modoReal, status: statusReal, completedFields, missingFields, confirmed: estadoExistente?.confirmed || false });
  }

  if (action === "confirmar_onboarding") {
    // Confirmacion EXPLICITA del resumen final — solo aqui se marca completed. Guard determinista:
    // si aun faltan campos requeridos, se rechaza sin importar que el frontend lo intente.
    const { mode } = datos;
    const { completedFields, missingFields } = await calcularEstadoOnboarding(supabase, codigo, mode);
    console.log("🔍 DEBUG confirmar_onboarding — codigo:", codigo, "mode:", mode, "completedFields:", JSON.stringify(completedFields), "missingFields:", JSON.stringify(missingFields));
    if (missingFields.length > 0) {
      return NextResponse.json({ ok: false, error: "Faltan campos obligatorios", missingFields }, { status: 400 });
    }
    await supabase.from("onboarding_state").upsert({
      user_codigo: codigo,
      mode,
      status: "completed",
      completed_fields: completedFields,
      missing_fields: [],
      confirmed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_codigo" });
    return NextResponse.json({ ok: true });
  }

  if (action === "guardar_training_sources") {
    // FORGE FOCUS ONBOARDING — guarda las disciplinas del atleta (Forge-controlled y externas)
    // durante el onboarding de Focus. Backend-first: recibe datos estructurados, nunca interpreta
    // texto libre para decidir owner/dias — eso lo decide el frontend del onboarding por diseño,
    // guiando al usuario con opciones claras, no conversacion libre.
    const { disciplinas } = datos;
    if (!Array.isArray(disciplinas) || disciplinas.length === 0) {
      return NextResponse.json({ error: "Falta la lista de disciplinas" }, { status: 400 });
    }

    const filasParaGuardar = disciplinas.map((d: any) => ({
      user_codigo: codigo,
      disciplina: d.disciplina,
      owner: d.owner,
      dias: d.dias || null,
      duracion_habitual: d.duracion_habitual || null,
      intensidad_habitual: d.intensidad_habitual || null,
      tipo_trabajo: d.tipo_trabajo || null,
      variable: d.variable || false,
      objetivo: d.objetivo || null,
      prioridad: d.prioridad || null,
      activo: true,
    }));

    const { error: errorGuardarFuentes } = await supabase.from("athlete_training_sources")
      .upsert(filasParaGuardar, { onConflict: "user_codigo,disciplina" });
    if (errorGuardarFuentes) return NextResponse.json({ error: errorGuardarFuentes.message }, { status: 500 });

    return NextResponse.json({ ok: true, guardadas: filasParaGuardar.length });
  }

  if (action === "obtener_training_sources") {
    // Solo lectura — para que el frontend sepa si el atleta ya tiene Focus configurado y con que datos.
    const { data: fuentesObtenidas } = await supabase.from("athlete_training_sources").select("*").eq("user_codigo", codigo).eq("activo", true);
    return NextResponse.json({ fuentes: fuentesObtenidas || [] });
  }

  if (action === "diagnostico_athlete_context") {
    try {
      const { getAthleteContext } = await import("@/lib/mobile/getAthleteContext");
      const contexto = await getAthleteContext(codigo);
      return NextResponse.json({ ok: true, contexto });
    } catch (err: any) {
      console.error("Error en diagnostico_athlete_context:", err);
      return NextResponse.json({ error: "Error: " + err.message }, { status: 500 });
    }
  }

  if (action === "enviar_mensaje_coach") {
    // FORGE MOBILE COACH — endpoint exclusivo para Forge Mobile. NUNCA toca /api/chat original
    // ni el buildPrompt de la web. Usa la copia aislada (getAthleteContext + buildPrompt) en
    // lib/mobile/, verificada con contrato de equivalencia el 19/08/2026.
    //
    // SEGURIDAD: nunca confiamos solo en "codigo" como identidad — el cliente movil debe probar,
    // via authUserId (obtenido de la sesion real de Supabase Auth en el dispositivo), que ese
    // codigo realmente le pertenece. Sin esto, cualquiera podria consultar/hablar con el Coach
    // de otro atleta simplemente adivinando o probando codigos.
    try {
      const { mensaje, authUserId } = datos || {};
      if (!mensaje || !authUserId) {
        return NextResponse.json({ error: "Faltan mensaje o authUserId" }, { status: 400 });
      }

      const { data: usuarioAuthCheck, error: errorAuthCheck } = await supabase.from("usuarios").select("codigo,auth_user_id").eq("codigo", codigo).single();
      if (errorAuthCheck || !usuarioAuthCheck) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      if (usuarioAuthCheck.auth_user_id !== authUserId) {
        console.error(`🚨 SEGURIDAD enviar_mensaje_coach: authUserId no coincide para codigo=${codigo} — intento de acceso no autorizado`);
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      const { getAthleteContext } = await import("@/lib/mobile/getAthleteContext");
      const { buildPrompt } = await import("@/lib/mobile/buildPrompt");
      const ctx = await getAthleteContext(codigo);

      const fechaHoyMobile = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
      const mensajeConFecha = `${mensaje}\n\n[Fecha actual del sistema: ${fechaHoyMobile}]\n[Contexto temporal del mensaje: CONSULTA_GENERAL]`;

      const systemPrompt = buildPrompt(ctx.catObj, ctx.perfil, ctx.marcas, ctx.resumen, ctx.memoriaCoach, ctx.cicloActual, ctx.perfilPsicologico, ctx.esPremiumOAdmin, ctx.athleteState, ctx.datosEntrenamiento, ctx.estadoFisiologico, ctx.historialFisiologico, ctx.distribucionSemanal, ctx.objetivoPrincipal, ctx.planSemanal, ctx.debilidades, ctx.blockOutcomes, ctx.estadoCanonico);

      const mensajesParaAPI = [...(ctx.historial || []).slice(-3), { role: "user", content: mensajeConFecha }];

      const coachRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, system: systemPrompt, messages: mensajesParaAPI }),
      });
      const coachData = await coachRes.json();
      const respuestaTexto = coachData.content?.map((b: any) => b.text || "").join("") || "Error al conectar.";

      // FIX: persistir el intercambio en el historial real, igual que hace la web — sin esto, la
      // conversacion movil nunca sobrevivia a un recargo de la app (vivia solo en memoria de React).
      const historialActualizado = [...(ctx.historial || []), { role: "user", content: mensaje }, { role: "assistant", content: respuestaTexto }];
      await supabase.from("usuarios").update({ historial: historialActualizado.slice(-15), updated_at: new Date().toISOString() }).eq("codigo", codigo);

      // Nota: los tags [SESION:], [PLAN:], etc. siguen sin procesarse aqui de forma centralizada —
      // cada Safety Net deterministico (verificar_sesion_completada_..., verificar_modificacion_...)
      // se encarga de su propio dominio de forma independiente, disparado desde el cliente movil.
      return NextResponse.json({ ok: true, respuesta: respuestaTexto });
    } catch (err: any) {
      console.error("Error en enviar_mensaje_coach:", err);
      return NextResponse.json({ error: "Error: " + err.message }, { status: 500 });
    }
  }

  // Rate limiting: máximo 30 peticiones por minuto por código
  if (codigo && (action === undefined || messages)) {
    const ahora = new Date();
    const { data: rateLimitData } = await supabase.from("rate_limits").select("*").eq("codigo", codigo).single();
    if (rateLimitData) {
      const windowStart = new Date(rateLimitData.window_start);
      const segundosTranscurridos = (ahora.getTime() - windowStart.getTime()) / 1000;
      if (segundosTranscurridos < 60) {
        if (rateLimitData.requests_count >= 30) {
          return NextResponse.json({ error: "Demasiadas peticiones. Espera un momento e inténtalo de nuevo." }, { status: 429 });
        }
        await supabase.from("rate_limits").update({ requests_count: rateLimitData.requests_count + 1 }).eq("codigo", codigo);
      } else {
        await supabase.from("rate_limits").update({ requests_count: 1, window_start: ahora.toISOString() }).eq("codigo", codigo);
      }
    } else {
      await supabase.from("rate_limits").insert({ codigo, requests_count: 1, window_start: ahora.toISOString() });
    }
  }

  // Guardar usuario nuevo
  if (action === "guardar_usuario") {
    const { data, error } = await supabase
      .from("usuarios")
      .insert([datos])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Recuperar usuario por codigo
  if (action === "recuperar_usuario") {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("codigo", codigo)
      .single();
    if (error) return NextResponse.json({ error: "Codigo no encontrado" }, { status: 404 });
    // FUENTE ATOMICA: sobrescribir historial_fisiologico con los datos reales de physiology_records,
    // que es la fuente de verdad desde el fix del patron read-modify-write.
    const { data: fisioRecordsUsuario } = await supabase.from("physiology_records").select("fecha,hrv,sueno,rhr,fatiga_aguda").eq("user_codigo", codigo).order("fecha", { ascending: true }).limit(60);
    if (fisioRecordsUsuario) {
      data.historial_fisiologico = fisioRecordsUsuario.map((r: any) => ({ fecha: r.fecha, hrv: r.hrv, sueno: r.sueno, rhr: r.rhr, fatiga_aguda: r.fatiga_aguda }));
    }
    return NextResponse.json({ data });
  }

  // Actualizar historial y marcas
  if(action==="recuperar_por_email"){
  const{data,error}=await supabase.from("usuarios").select("codigo").eq("email",email||"").single();
  if(error) return NextResponse.json({error:"No encontrado"},{status:404});
  return NextResponse.json({data});
}
  if (action === "actualizar_usuario") {
    // Limitar historial a máximo 15 mensajes antes de guardar
    if (datos.historial && Array.isArray(datos.historial)) {
      // Eliminar imágenes del historial antes de guardar
      datos.historial = datos.historial.map((m: any) => {
        if (Array.isArray(m.content)) {
          return {
            ...m,
            content: m.content
              .filter((c: any) => c.type !== 'image')
              .map((c: any) => c.type === 'text' ? c.text : c.type === 'tool_result' ? '' : c)
              .join(' ') || '[imagen enviada]'
          };
        }
        return m;
      });
      // Limitar a 15 mensajes
      if (datos.historial.length > 15) {
        datos.historial = datos.historial.slice(-15);
      }
    }
    // Evitar sesiones duplicadas en workout_history
    if (datos.workout_history && Array.isArray(datos.workout_history)) {
      const {data: usuarioActual} = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
      const historialActual = usuarioActual?.workout_history || [];
      const ultimaSesion = historialActual[historialActual.length - 1];
      const tiempoUltima = ultimaSesion ? new Date(ultimaSesion.fecha).getTime() : 0;
      if (new Date().getTime() - tiempoUltima < 300000) {
        delete datos.workout_history;
      }
    }
    const { error } = await supabase
      .from("usuarios")
      .update({ ...datos, updated_at: new Date().toISOString() })
      .eq("codigo", codigo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Extracción automática de memoria en el servidor cuando se guarda historial
    if (datos.historial && Array.isArray(datos.historial) && datos.historial.length > 0) {
      try {
        const {data: usuarioData} = await supabase.from("usuarios").select("ciclo_actual,notas_coach,datos_entrenamiento,estado_fisiologico,workout_history,historial_fisiologico,distribucion_semanal,objetivo_principal,historial_marcas,analisis_bloques").eq("codigo", codigo).single();
        const cicloActual = usuarioData?.ciclo_actual || {};
        const ultimos = datos.historial.slice(-6).map((m: any) => `${m.role === "user" ? "ATLETA" : "COACH"}: ${typeof m.content === "string" ? m.content.substring(0, 1500) : "[archivo]"}`).join("\n\n");
        const extraerTextoContenido = (content: any): string => {
          if (typeof content === "string") return content.substring(0, 1500);
          if (Array.isArray(content)) {
            const textoParte = content.find((c: any) => c.type === "text");
            const tieneImagen = content.some((c: any) => c.type === "image");
            const textoBase = textoParte?.text || "";
            return tieneImagen ? `[USUARIO ADJUNTÓ UNA IMAGEN/CAPTURA - probablemente datos de reloj deportivo (Garmin/Oura/Apple Watch) con métricas de sueño, HRV, entrenamiento o similar] ${textoBase}`.substring(0, 1500) : textoBase.substring(0, 1500);
          }
          return "";
        };
        const ultimoMensajeUsuario = datos.historial.filter((m:any) => m.role === "user").slice(-1)[0];
        const textoUltimoMensaje = ultimoMensajeUsuario ? extraerTextoContenido(ultimoMensajeUsuario.content) : "";
        // FORGE EVENT AGGREGATOR — el backend decide a que evento pertenece este mensaje y agrupa correctamente
        const { eventType, mensajesDelEvento } = await forgeEventAggregator(supabase, apiKey!, codigo, textoUltimoMensaje);
        const soloUsuario = mensajesDelEvento.join("\n\n");

        const extractPrompt = `Analiza esta conversación y extrae datos en JSON. Responde SOLO con JSON válido:
{
  "lesiones": "lesiones mencionadas o vacío",
  "plan": "sesiones planificadas próximos 7 días o vacío",
  "notas": "decisiones importantes máx 80 palabras o vacío",
  "nueva_marca": "nueva marca en formato ejercicio:valor o vacío",
  "ciclo": {"bloque": "${cicloActual.bloque||"vacío"}", "semana": ${cicloActual.semana||"null"}, "totalSemanas": ${cicloActual.totalSemanas||"null"}, "objetivo": "${cicloActual.objetivo||"vacío"}"},
  "estado_fisiologico": {"hrv": null, "sueno": null, "rhr": null, "fatiga_aguda": null, "tendencia": null},
INSTRUCCIONES PARA estado_fisiologico — REGLA DE EXCLUSIÓN ESTRICTA:
PASO 1 — Verifica si el mensaje contiene palabras que indican REPORTE DE ENTRENAMIENTO: "sesión realizada", "entreno", "WOD", "series", "reps", "rondas", "técnica", "durante el entreno", "durante la sesión", clean/snatch/squat/press/deadlift, o cualquier ejercicio nombrado.
PASO 2 — Si el mensaje contiene CUALQUIERA de esas palabras de entrenamiento, incluso mezcladas con números de frecuencia cardíaca, DEJA TODOS los valores en null SIN EXCEPCIÓN, aunque el mensaje también mencione "frecuencia media" o "frecuencia máxima" — esos números son de FC DURANTE EL EJERCICIO, no de sueño/reposo, y NUNCA deben extraerse aquí.
PASO 3 — SOLO extrae valores si el mensaje es EXCLUSIVAMENTE sobre sueño/recuperación nocturna, sin ninguna mención de entrenamiento, ejercicios o series. Palabras que confirman esto: "métricas de sueño", "dormí", "anoche", "puntuación de sueño", "durante la noche".
PASO 4 — CRÍTICO: Si el mensaje menciona una FECHA ESPECÍFICA PASADA (ej: "del día 04/07", "del 3 de julio", cualquier fecha que no sea hoy), deja TODOS los valores en null aquí — esa métrica histórica se registra por otro sistema específico y NO debe duplicarse aquí. Esta sección estado_fisiologico es SOLO para métricas de HOY sin fecha explícita mencionada.
- "hrv": SOLO de mensajes 100% sobre sueño. Ejemplo válido: mensaje que SOLO dice "VFC media durante la noche 92ms" sin mencionar ningún entreno.
- "sueno": SOLO puntuación de sueño 0-100 en mensaje exclusivo de sueño.
- "rhr": SOLO FC reposo/mínima nocturna en mensaje exclusivo de sueño.
- "fatiga_aguda": déjalo SIEMPRE null salvo mensaje exclusivo sobre fatiga sistémica sin contexto de entreno específico.
REGLA DE ORO: si el mensaje reporta una sesión de entrenamiento (aunque sea junto con números de FC), TODO en estado_fisiologico debe ser null.
REGLA ADICIONAL CRÍTICA: analiza EXCLUSIVAMENTE el texto delimitado por las líneas ----- de abajo. Ignora cualquier dato que "recuerdes" de otras partes de este prompt (como ciclo, memoria, plan) para rellenar estado_fisiologico — ese campo solo puede llenarse con lo escrito literalmente entre las líneas -----.
-----
MENSAJES DEL ATLETA PARA ANALIZAR:
${soloUsuario}
-----
  "sesion_completada": null,
  "datos_entrenamiento": null,
  "distribucion_semanal": null,
  "objetivo_principal": null,
  "fin_bloque": null
}

MENSAJES SOLO DEL ATLETA (para extraer datos_entrenamiento y estado_fisiologico):
${soloUsuario}

Para "fin_bloque": si el coach menciona que se ha completado un bloque, inicia deload, o empieza un nuevo bloque, extrae: {"bloque_completado":"nombre del bloque completado","objetivo_bloque":"objetivo que tenía","resultado":"cumplido|parcial|no_cumplido","adherencia_estimada":"porcentaje estimado","carga":"adecuada|alta|baja","siguiente_bloque":"nombre del siguiente bloque"}. null si no hay cambio de bloque.

Para "objetivo_principal": si el atleta menciona un objetivo concreto con fecha (competición, carrera, evento, marca objetivo), extrae: {"descripcion":"descripción del objetivo","fecha":"YYYY-MM-DD","tipo":"competicion|marca|evento|otro"}. null si no hay objetivo mencionado.
Para "datos_entrenamiento": extrae SOLO de mensajes del ATLETA, nunca del COACH. Si el atleta menciona explícitamente sus zonas, marcas o métricas personales extráelas. Si solo es el coach hablando de zonas en su planificación, devuelve null.
Para "distribucion_semanal": SOLO extrae si el ATLETA declara explícitamente un cambio PERMANENTE en su disponibilidad real (ej: "ya no puedo entrenar los martes", "ahora tengo libre los viernes"). NUNCA extraigas esto de una planificación semanal generada por el coach o de confirmaciones de plan — esos son ajustes puntuales, no cambios de disponibilidad real. null en el 99% de los casos, solo actualiza si el atleta menciona explícitamente su horario/trabajo/disponibilidad ha cambiado.

Conversación:
${ultimos}`;

        const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 600, messages: [{ role: "user", content: extractPrompt }] })
        });
        const extractData = await extractRes.json();
        const textoExtract = extractData.content?.map((b: any) => b.text || "").join("") || "{}";
        const clean = textoExtract.replace(/```json|```/g, "").trim();
        // Extraer solo el JSON válido
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        let extracted = JSON.parse(jsonMatch[0]);

        const updates: any = {};
        if (extracted.lesiones) updates.lesiones_actuales = extracted.lesiones;
        if (extracted.plan) updates.plan_proxima_semana = extracted.plan;
        if (extracted.notas) updates.notas_coach = extracted.notas;

        // FORGE ESTADO CANONICO — ciclo_actual es un dato CRITICO INMUTABLE. Ningun extractor conversacional
        // (Haiku ni ningun otro LLM) tiene autoridad para escribirlo. Solo un flujo determinista de
        // "Cerrar Bloque" explicito puede modificarlo. Ver FORGE_TRUTH_PRINCIPLE.md.

// FORGE EXTRACTION VALIDATOR — el LLM propone, el backend verifica antes de persistir.
        extracted = validateExtraction(extracted, soloUsuario);
        if (extracted.estado_fisiologico && Object.values(extracted.estado_fisiologico).some(v => v !== null && typeof v !== 'object')) {
          const estadoActual = usuarioData?.estado_fisiologico || {};
          const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
          const valoresSimples = Object.fromEntries(
            Object.entries(extracted.estado_fisiologico).filter(([k,v]) => 
              v !== null && typeof v === 'number' && ['hrv','sueno','rhr','fatiga_aguda'].includes(k)
            )
          );
          if(Object.keys(valoresSimples).length > 0){
            const { error: errorUpsertFisio } = await supabase.from("physiology_records").upsert({
              user_codigo: codigo,
              fecha: hoy,
              ...valoresSimples,
              updated_at: new Date().toISOString()
            }, { onConflict: "user_codigo,fecha" });
            if (errorUpsertFisio) console.error("Error upsert physiology_records:", errorUpsertFisio);

            updates.estado_fisiologico = { ...estadoActual, ...valoresSimples };
          }
        }

        // Detectar [PLAN:...] en el historial y guardarlo
        const ultimoMensajeCoach = datos.historial?.filter((m:any)=>m.role==="assistant").slice(-1)[0]?.content||"";
        if(typeof ultimoMensajeCoach === "string" && ultimoMensajeCoach.includes("[PLAN:")){
          const planIdx = ultimoMensajeCoach.indexOf("[PLAN:");
          let depth=0, planEnd=-1;
          for(let i=planIdx+6;i<ultimoMensajeCoach.length;i++){
            if(ultimoMensajeCoach[i]==='{') depth++;
            else if(ultimoMensajeCoach[i]==='}') { depth--; if(depth===0){planEnd=i;break;} }
          }
          if(planEnd>=0){
            try{
              const planJson=ultimoMensajeCoach.substring(planIdx+6,planEnd+1);
              const planData=JSON.parse(planJson);
              await supabase.from("weekly_plan").upsert({
                user_codigo: codigo,
                week_start: planData.week_start,
                week_number: planData.week_number,
                block_name: planData.block_name,
                status: "active",
                confidence: 100,
                sessions: planData.sessions,
                updated_at: new Date().toISOString()
              }, { onConflict: "user_codigo,week_start" });
            }catch{}
          }
        }
        // Registro de sesiones por acción explícita del usuario

        if (extracted.distribucion_semanal && extracted.distribucion_semanal !== "null" && extracted.distribucion_semanal !== "") {
          // FORGE CANONICAL STATE GUARD — disponibilidad protegida al mismo nivel que ciclo_actual.
          // El extractor conversacional NUNCA puede escribirla por una mencion casual o duda del
          // usuario ("creo que mañana hago box") — exige una CONFIRMACION EXPLICITA real en el mensaje.
          const ultMensajeUsuarioDisp = datos.historial?.filter((m:any)=>m.role==="user").slice(-1)[0]?.content||"";
          const esConfirmacionExplicitaDisp = typeof ultMensajeUsuarioDisp === "string" &&
            /\b(confirmo|sigue siendo|ha cambiado|cambio de disponibilidad|ahora entreno|mi nueva disponibilidad|actualizo mi disponibilidad)\b/i.test(ultMensajeUsuarioDisp);

          if (!esConfirmacionExplicitaDisp) {
            console.error("🚨 BLOCKED disponibilidad — sin confirmacion explicita en el mensaje del usuario. Mensaje:", ultMensajeUsuarioDisp.substring(0,100), "valor_bloqueado:", JSON.stringify(extracted.distribucion_semanal));
          } else {
            // FIX CRITICO: validar el FORMATO antes de guardar. El extractor a veces genera un objeto
            // de "metadatos del cambio" ({cambio, anterior, actual}) en vez de la distribucion real
            // ({box:[...], pista:[...]}). Guardar el formato incorrecto rompe silenciosamente todo el
            // Blueprint Acceptance Validator, que no puede extraer ningun dia de una estructura invalida.
            let distParaValidar = extracted.distribucion_semanal;
            try {
              if (typeof distParaValidar === "string") distParaValidar = JSON.parse(distParaValidar);
            } catch { distParaValidar = null; }
            const tieneFormatoValido = distParaValidar && typeof distParaValidar === "object" &&
              Object.entries(distParaValidar).some(([k, v]) => k !== "observaciones" && k !== "cambio" && k !== "anterior" && k !== "actual" && Array.isArray(v));
            if (tieneFormatoValido) {
              updates.distribucion_semanal = extracted.distribucion_semanal;
            } else {
              console.error("🚨 RECHAZADO distribucion_semanal con formato invalido (no es {clave:[dias]}):", JSON.stringify(extracted.distribucion_semanal));
            }
          }
        }
        let nuevoPrDetectado: { ejercicio: string; valor: string; mejora: string | null } | null = null;
        let objetivoConseguidoDetectado: { objetivo: string; resultado: string } | null = null;
        if (extracted.nueva_marca && extracted.nueva_marca !== "" && extracted.nueva_marca !== "vacío") {
          const histMarcas = usuarioData?.historial_marcas || [];
          const partes = extracted.nueva_marca.split(":");
          if (partes.length >= 2) {
            const ejercicioNormalizado = partes[0].trim().toLowerCase()
              .replace(/sentadilla trasera/i, "back_squat")
              .replace(/sentadilla frontal/i, "front_squat")
              .replace(/peso muerto/i, "deadlift")
              .replace(/press banca|press de banca/i, "bench_press")
              .replace(/press militar|press hombro/i, "push_press")
              .replace(/\s+/g, "_");
            const valorNuevo = partes.slice(1).join(":").trim();
            const fechaHoy = new Date().toISOString().split('T')[0];
            const yaExiste = histMarcas.some((m:any) => m.ejercicio === ejercicioNormalizado && m.fecha === fechaHoy && m.valor === valorNuevo);
            if (!yaExiste) {
              updates.historial_marcas = [...histMarcas, { fecha: fechaHoy, ejercicio: ejercicioNormalizado, valor: valorNuevo }];
              // FORGE CARDS — calcular mejora respecto a la marca anterior del mismo ejercicio para
              // que el frontend pueda ofrecer generar la tarjeta compartible inmediatamente.
              const marcasAnteriores = histMarcas.filter((m:any) => m.ejercicio === ejercicioNormalizado);
              const marcaAnterior = marcasAnteriores[marcasAnteriores.length - 1];
              let mejoraCalculada: string | null = null;
              if (marcaAnterior) {
                const numAnterior = parseFloat(marcaAnterior.valor);
                const numNuevo = parseFloat(valorNuevo);
                if (!isNaN(numAnterior) && !isNaN(numNuevo) && numNuevo > numAnterior) {
                  mejoraCalculada = `${(numNuevo - numAnterior).toFixed(1)}`;
                }
              }
              nuevoPrDetectado = { ejercicio: ejercicioNormalizado, valor: valorNuevo, mejora: mejoraCalculada };

              // FORGE CARDS — Objetivo Conseguido: verificar si esta nueva marca alcanza o supera
              // el objetivo principal declarado (solo si el objetivo es de tipo "marca" y menciona
              // el mismo ejercicio). Nunca se infiere, solo se compara con el dato real declarado.
              const { data: usuarioObjetivo } = await supabase.from("usuarios").select("objetivo_principal").eq("codigo", codigo).single();
              const objetivoDeclarado = usuarioObjetivo?.objetivo_principal;
              if (objetivoDeclarado?.tipo === "marca" && objetivoDeclarado?.descripcion) {
                const descObjetivoLower = objetivoDeclarado.descripcion.toLowerCase();
                const ejercicioLegible = ejercicioNormalizado.replace(/_/g, " ");
                if (descObjetivoLower.includes(ejercicioLegible) || descObjetivoLower.includes(ejercicioNormalizado)) {
                  const numObjetivo = parseFloat(objetivoDeclarado.descripcion.match(/\d+(\.\d+)?/)?.[0] || "0");
                  const numLogrado = parseFloat(valorNuevo);
                  if (numObjetivo > 0 && !isNaN(numLogrado) && numLogrado >= numObjetivo) {
                    objetivoConseguidoDetectado = { objetivo: objetivoDeclarado.descripcion, resultado: valorNuevo };
                  }
                }
              }
            }
          }
        }

        // FORGE CARDS — Racha: calcular dias consecutivos entrenando usando workout_history real.
        // Solo se ofrece compartir en hitos significativos (7, 14, 21, 30, 60, 90, 100 dias).
        let rachaDetectada: number | null = null;
        const HITOS_RACHA = [7, 14, 21, 30, 60, 90, 100, 150, 200, 365];
        if (extracted.datos_entrenamiento || extracted.plan) { // proxy: hubo algo relacionado con entreno en el mensaje
          const { data: usuarioRacha } = await supabase.from("usuarios").select("workout_history,ultima_racha_mostrada").eq("codigo", codigo).single();
          const historialParaRacha = (usuarioRacha?.workout_history || []).map((w: any) => new Date(w.fecha).toISOString().split('T')[0]);
          const fechasUnicas: string[] = [...new Set(historialParaRacha)].sort().reverse() as string[];
          let racha = 0;
          let fechaCursor = new Date();
          for (const fechaStr of fechasUnicas) {
            const fechaCursorStr = fechaCursor.toISOString().split('T')[0];
            if (fechaStr === fechaCursorStr) {
              racha++;
              fechaCursor.setDate(fechaCursor.getDate() - 1);
            } else if (fechaStr < fechaCursorStr) {
              break;
            }
          }
          // FIX: evitar mostrar el mismo hito de racha en cada mensaje del mismo dia — solo la primera vez.
          if (HITOS_RACHA.includes(racha) && usuarioRacha && (usuarioRacha as any).ultima_racha_mostrada !== racha) {
            rachaDetectada = racha;
            await supabase.from("usuarios").update({ ultima_racha_mostrada: racha }).eq("codigo", codigo);
          }
        }

        if (extracted.fin_bloque && extracted.fin_bloque !== "null") {
          const finBloque = typeof extracted.fin_bloque === "string" ? JSON.parse(extracted.fin_bloque) : extracted.fin_bloque;
          if (finBloque && typeof finBloque === "object") {
            const analisisActual = usuarioData?.analisis_bloques || [];
            const nuevoAnalisis = { ...finBloque, fecha: new Date().toISOString().split('T')[0] };
            updates.analisis_bloques = [...analisisActual.slice(-5), nuevoAnalisis]; // máximo 6 bloques
          }
        }

        if (extracted.objetivo_principal && extracted.objetivo_principal !== "null") {
          const obj = typeof extracted.objetivo_principal === "string" ? JSON.parse(extracted.objetivo_principal) : extracted.objetivo_principal;
          // FORGE CANONICAL STATE GUARD — objetivo protegido al mismo nivel que ciclo_actual y
          // disponibilidad. Es el dato MAS peligroso de contaminar (Strategy → Blueprint → planificacion
          // completa dependen de el), asi que exige CONFIRMACION EXPLICITA real, nunca una mencion
          // casual, duda o hipotesis ("quizas mi objetivo sea...", "quiero probar...").
          const ultMensajeUsuario = datos.historial?.filter((m:any)=>m.role==="user").slice(-1)[0]?.content||"";
          const esConfirmacionExplicitaObjetivo = typeof ultMensajeUsuario === "string" &&
            /\b(confirmo|mi nuevo objetivo es|cambio (mi )?objetivo|actualizo (mi )?objetivo|quiero cambiar (mi )?objetivo a|a partir de ahora mi objetivo)\b/i.test(ultMensajeUsuario);
          if (!esConfirmacionExplicitaObjetivo) {
            console.error("🚨 BLOCKED objetivo_principal — sin confirmacion explicita en el mensaje del usuario. Mensaje:", ultMensajeUsuario.substring(0,100), "valor_bloqueado:", JSON.stringify(obj));
          }
          if (obj && typeof obj === "object" && esConfirmacionExplicitaObjetivo) {
            // FIX: registrar fecha_inicio REAL del objetivo (momento en que se establece/cambia),
            // no un proxy generico — esto permite calcular progreso temporal correcto si el atleta
            // cambia de objetivo a mitad de camino, en vez de arrastrar la fecha de registro original.
            const objetivoAnteriorFecha = usuarioData?.objetivo_principal?.descripcion;
            const esObjetivoNuevo = objetivoAnteriorFecha !== obj.descripcion;
            updates.objetivo_principal = {
              ...obj,
              fecha_inicio: esObjetivoNuevo ? new Date().toISOString().split('T')[0] : (usuarioData?.objetivo_principal?.fecha_inicio || new Date().toISOString().split('T')[0])
            };
          }
        }

        if (extracted.datos_entrenamiento && extracted.datos_entrenamiento !== "null") {
          const datosExtra = typeof extracted.datos_entrenamiento === "string" ? JSON.parse(extracted.datos_entrenamiento) : extracted.datos_entrenamiento;
          if (typeof datosExtra === "object" && datosExtra !== null) {
            const CLAVES_VALIDAS = ['fc_maxima','fc_reposo','umbral_fc','z1_fc','z2_fc','z3_fc','z4_fc','z5_fc','ritmo_z2','ritmo_umbral','squat_1rm','bench_1rm','deadlift_1rm','snatch_1rm','clean_jerk_1rm','ftp','vo2max','peso_corporal','umbral_potencia','ritmo_row_suave'];
            const datosLimpios = Object.fromEntries(Object.entries(datosExtra).filter(([k,v]) => v !== null && CLAVES_VALIDAS.some(c => k.toLowerCase().includes(c.toLowerCase()))));
            if (Object.keys(datosLimpios).length > 0) {
              updates.datos_entrenamiento = { ...(usuarioData?.datos_entrenamiento || {}), ...datosLimpios };
            }
          }
        }

        // FORGE CANONICAL STATE GUARD — proteccion de auditoria: si algun cambio futuro reintroduce
        // escritura de ciclo_actual en este flujo no autorizado, lo detectamos y bloqueamos explicitamente
        // en vez de dejarlo pasar silenciosamente.
        if ('ciclo_actual' in updates) {
          console.error("🚨 BLOCKED CANONICAL STATE MUTATION — field: ciclo_actual, source: actualizar_usuario (extractor no autorizado), valor_bloqueado:", JSON.stringify(updates.ciclo_actual));
          delete updates.ciclo_actual;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("usuarios").update(updates).eq("codigo", codigo);
        }
        // Marcar el evento como ya extraido, iniciando ventana de correccion de 3 minutos
        await marcarEventoComoExtraido(supabase, apiKey!, codigo, true);
        // FORGE CARDS — si se detecto un nuevo PR o un hito de racha, lo devolvemos para que el
        // frontend ofrezca generar la tarjeta compartible inmediatamente despues de reportar.
        if (nuevoPrDetectado || rachaDetectada || objetivoConseguidoDetectado) {
          return NextResponse.json({ ok: true, nuevoPrDetectado, rachaDetectada, objetivoConseguidoDetectado });
        }
      } catch (e) {
        console.error("Error extraccion servidor:", e);
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "crear_equipo") {
    const { nombre, tipo } = datos;
    // Verificar máximo 2 equipos por usuario
    const { data: equiposActuales } = await supabase.from("team_members").select("team_id").eq("user_id", codigo);
    if (equiposActuales && equiposActuales.length >= 2) {
      return NextResponse.json({ error: "Máximo 2 equipos por usuario" }, { status: 400 });
    }
    const { data: equipo, error } = await supabase.from("teams").insert({ name: nombre, team_type: tipo||"generic", created_by: codigo }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("team_members").insert({ team_id: equipo.id, user_id: codigo });
    await supabase.from("team_metrics").insert({ team_id: equipo.id });
    return NextResponse.json({ equipo });
  }

  if (action === "unirse_equipo") {
    const { team_id } = datos;
    // Verificar máximo 2 miembros por equipo
    const { data: miembros } = await supabase.from("team_members").select("*").eq("team_id", team_id);
    if (miembros && miembros.length >= 2) return NextResponse.json({ error: "El equipo ya está completo" }, { status: 400 });
    // Verificar máximo 2 equipos por usuario
    const { data: equiposActuales } = await supabase.from("team_members").select("team_id").eq("user_id", codigo);
    if (equiposActuales && equiposActuales.length >= 2) return NextResponse.json({ error: "Máximo 2 equipos por usuario" }, { status: 400 });
    await supabase.from("team_members").insert({ team_id, user_id: codigo });
    return NextResponse.json({ ok: true });
  }

  if (action === "mis_equipos") {
    const { data: membresias } = await supabase.from("team_members").select("team_id").eq("user_id", codigo);
    if (!membresias?.length) return NextResponse.json({ equipos: [] });
    const teamIds = membresias.map((m:any) => m.team_id);
    const { data: equipos } = await supabase.from("teams").select("id, name, team_type, created_by, created_at, active, team_metrics(*)").in("id", teamIds).eq("active", true);
    return NextResponse.json({ equipos: equipos||[] });
  }

  if (action === "generar_sesion_equipo") {
    const { team_id } = datos;
    // Obtener miembros
    const { data: miembros } = await supabase.from("team_members").select("user_id").eq("team_id", team_id);
    if (!miembros || miembros.length < 2) return NextResponse.json({ error: "El equipo necesita 2 miembros" }, { status: 400 });
    // Obtener perfiles de ambos
    const perfiles = await Promise.all(miembros.map(async (m:any) => {
      const { data } = await supabase.from("usuarios").select("perfil,ciclo_actual,lesiones_actuales,datos_entrenamiento,marcas_especificas,especialidad,categoria").eq("codigo", m.user_id).single();
      return { user_id: m.user_id, ...data };
    }));
    // Obtener team_memory
    const { data: memoria } = await supabase.from("team_memory").select("*").eq("team_id", team_id);
    const { data: equipo } = await supabase.from("teams").select("*").eq("id", team_id).single();
    const { data: metricas } = await supabase.from("team_metrics").select("*").eq("team_id", team_id).single();
    const usarRatios = (metricas?.sessions_completed||0) >= 3;
    return NextResponse.json({ perfiles, memoria: memoria||[], equipo, usarRatios });
  }

  if (action === "guardar_sesion_equipo") {
    const { team_id, workout } = datos;
    await supabase.from("team_sessions").insert({ team_id, workout_generated: workout, status: "planned" });
    await supabase.from("team_metrics").update({ last_session: new Date().toISOString().split('T')[0] }).eq("team_id", team_id);
    return NextResponse.json({ ok: true });
  }

  if (action === "completar_sesion_equipo") {
    const { team_id, movimientos } = datos;
    // Actualizar métricas
    const { data: metricas } = await supabase.from("team_metrics").select("sessions_completed").eq("team_id", team_id).single();
    const nuevasSesiones = (metricas?.sessions_completed||0) + 1;
    await supabase.from("team_metrics").update({ sessions_completed: nuevasSesiones }).eq("team_id", team_id);
    // Actualizar team_memory si hay suficientes sesiones
    if (nuevasSesiones >= 3 && movimientos) {
      for (const [movement, ratio] of Object.entries(movimientos)) {
        await supabase.from("team_memory").upsert({ team_id, movement, ratio, sessions_count: nuevasSesiones, last_updated: new Date().toISOString() }, { onConflict: "team_id,movement" });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "disolver_equipo") {
    const { team_id } = datos;
    // Verificar que el usuario es miembro del equipo (creador o invitado)
    const { data: miembro } = await supabase.from("team_members").select("id").eq("team_id", team_id).eq("user_id", codigo).single();
    const { data: equipo } = await supabase.from("teams").select("created_by").eq("id", team_id).single();
    if (!miembro && equipo?.created_by !== codigo) return NextResponse.json({ error: "No perteneces a este equipo" }, { status: 403 });
    // Cualquier miembro puede salir/disolver — borrar en orden correcto para evitar violaciones de foreign key
    await supabase.from("codigos_conjuntos").delete().eq("team_id", team_id);
    await supabase.from("team_members").delete().eq("team_id", team_id);
    await supabase.from("team_sessions").delete().eq("team_id", team_id);
    await supabase.from("team_memory").delete().eq("team_id", team_id);
    await supabase.from("team_metrics").delete().eq("team_id", team_id);
    await supabase.from("teams").delete().eq("id", team_id);
    return NextResponse.json({ ok: true });
  }

  if (action === "crear_invitacion_equipo") {
    const { team_id } = datos;
    // Verificar que el equipo no está completo
    const { data: miembros } = await supabase.from("team_members").select("*").eq("team_id", team_id);
    if (miembros && miembros.length >= 2) return NextResponse.json({ error: "El equipo ya está completo" }, { status: 400 });
    const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codigoTemp = Array.from({length:6}, () => caracteres[Math.floor(Math.random()*caracteres.length)]).join("");
    const { error } = await supabase.from("codigos_conjuntos").insert({
      codigo: codigoTemp,
      codigo_usuario: codigo,
      team_id
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ codigoTemp });
  }

  if (action === "unirse_con_codigo") {
    const { codigoInvitacion } = datos;
    const { data: entrada } = await supabase.from("codigos_conjuntos")
      .select("*").eq("codigo", codigoInvitacion).eq("usado", false)
      .gt("expira_at", new Date().toISOString()).single();
    if (!entrada) return NextResponse.json({ error: "Código inválido o expirado" }, { status: 400 });
    // Verificar máximo 2 equipos por usuario
    const { data: equiposActuales } = await supabase.from("team_members").select("team_id").eq("user_id", codigo);
    if (equiposActuales && equiposActuales.length >= 2) return NextResponse.json({ error: "Ya tienes 2 equipos — máximo permitido" }, { status: 400 });
    // Unirse al equipo
    await supabase.from("team_members").insert({ team_id: entrada.team_id, user_id: codigo });
    await supabase.from("codigos_conjuntos").update({ usado: true }).eq("codigo", codigoInvitacion);
    // Devolver datos del equipo
    const { data: equipo } = await supabase.from("teams").select("*").eq("id", entrada.team_id).single();
    return NextResponse.json({ equipo });
  }

  if (action === "crear_codigo_conjunto") {
    const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codigoTemp = "FJ-" + Array.from({length:6}, () => caracteres[Math.floor(Math.random()*caracteres.length)]).join("");
    const { error } = await supabase.from("codigos_conjuntos").insert({
      codigo: codigoTemp,
      codigo_usuario: codigo
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ codigoTemp });
  }

  if (action === "usar_codigo_conjunto") {
    // codigoConjunto ya extraído del body
    const { data: entrada, error } = await supabase
      .from("codigos_conjuntos")
      .select("*")
      .eq("codigo", codigoConjunto)
      .eq("usado", false)
      .gt("expira_at", new Date().toISOString())
      .single();
    if (error || !entrada) return NextResponse.json({ error: "Código inválido o expirado" }, { status: 400 });
    // Marcar como usado
    await supabase.from("codigos_conjuntos").update({ usado: true }).eq("codigo", codigoConjunto);
    // Recuperar perfil del amigo
    const { data: amigo } = await supabase.from("usuarios").select("perfil,marcas_especificas,ciclo_actual,lesiones_actuales,datos_entrenamiento,especialidad,categoria").eq("codigo", entrada.codigo_usuario).single();
    if (!amigo) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    return NextResponse.json({ data: amigo });
  }

  if (action === "registrar_sesion") {
    const { sesion } = datos;
    const { data: usuarioFresh } = await supabase.from("usuarios").select("workout_history,primera_sesion_at").eq("codigo", codigo).single();
    const workoutActual = usuarioFresh?.workout_history || [];
    const esPrimeraSesionGlobal = !usuarioFresh?.primera_sesion_at && workoutActual.length === 0;
    // Analytics: trackear primera sesión completada (métrica clave de activación)
    if (esPrimeraSesionGlobal) {
      await supabase.from("usuarios").update({ primera_sesion_at: new Date().toISOString() }).eq("codigo", codigo);
    }

    // Calcular workout_id basado en la fecha de la sesión
    const fechaSesionObj = new Date(sesion.fecha || new Date().toISOString());
    const diaSem = fechaSesionObj.getDay() || 7;
    const lunesSem = new Date(fechaSesionObj);
    lunesSem.setDate(fechaSesionObj.getDate() - diaSem + 1);
    const weekStartCalc = lunesSem.toISOString().split('T')[0];
    const DIAS_MAP2 = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    const diaCalc = DIAS_MAP2[fechaSesionObj.getDay()].normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const workoutIdCalc = sesion.workout_id || `${weekStartCalc}_${diaCalc}`;

    const sesionNormalizada = {
      workout_id: workoutIdCalc,
      tipo: sesion.tipo || "Entrenamiento",
      fecha: sesion.fecha || new Date().toISOString(),
      notas: sesion.notas || "",
      duracion: sesion.duracion || null,
      sensacion: sesion.sensacion || "buena",
      analisis: sesion.analisis || null
    };

    // Buscar si ya existe una sesión con este workout_id
    const indiceExistente = workoutActual.findIndex((w: any) => w.workout_id === workoutIdCalc);
    let workoutActualizado;
    if (indiceExistente >= 0) {
      // Actualizar la existente
      workoutActualizado = [...workoutActual];
      workoutActualizado[indiceExistente] = { ...workoutActual[indiceExistente], ...sesionNormalizada };
    } else {
      // Crear nueva
      workoutActualizado = [...workoutActual, sesionNormalizada].sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    }

    await supabase.from("usuarios").update({ workout_history: workoutActualizado }).eq("codigo", codigo);

    // FORGE EVENT PIPELINE — emitimos el evento canonico WorkoutRegistered (confirmacion estructurada
    // via banner, distinto de un futuro TrainingReported narrado en texto libre o WorkoutImported
    // desde una integracion externa). Cualquier consumidor puede escucharlo sin conocer el origen.
    await emitirEventoForge(supabase, codigo, "WorkoutRegistered", {
      entityType: "Workout",
      entityId: workoutIdCalc,
      source: "banner",
      payload: { tipo: sesionNormalizada.tipo, fecha: sesionNormalizada.fecha }
    });

    return NextResponse.json({ ok: true, actualizado: indiceExistente >= 0, esPrimeraSesion: esPrimeraSesionGlobal });
  }

  if (action === "registrar_metrica_pasada") {
    const { fecha: fechaRaw, hrv, sueno, rhr } = datos;
    // Normalizar fecha a formato YYYY-MM-DD sin importar si viene con hora/timezone
    const fecha = String(fechaRaw).split('T')[0];
    const { data: usuarioFresh } = await supabase.from("usuarios").select("historial_fisiologico").eq("codigo", codigo).single();
    const historialActual = usuarioFresh?.historial_fisiologico || [];
    // Normalizar también las fechas existentes al comparar, y actualizar si ya existe en vez de solo bloquear
    const idxExistente = historialActual.findIndex((e:any) => String(e.fecha).split('T')[0] === fecha);
    const nuevaEntrada:any = { fecha };
    if(hrv) nuevaEntrada.hrv = hrv;
    if(sueno) nuevaEntrada.sueno = sueno;
    if(rhr) nuevaEntrada.rhr = rhr;
    let historialActualizado;
    if(idxExistente >= 0){
      historialActualizado = [...historialActual];
      historialActualizado[idxExistente] = { ...historialActual[idxExistente], ...nuevaEntrada, fecha };
    } else {
      historialActualizado = [...historialActual, nuevaEntrada];
    }
    historialActualizado = historialActualizado.sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).slice(-30);
    await supabase.from("usuarios").update({ historial_fisiologico: historialActualizado }).eq("codigo", codigo);
    return NextResponse.json({ ok: true });
  }

  if (action === "borrar_ultima_sesion") {
    const { data: usuario } = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
    const workouts = usuario?.workout_history || [];
    if (workouts.length === 0) return NextResponse.json({ error: "No hay sesiones" }, { status: 400 });
    const workoutActualizado = workouts.slice(0, -1);
    await supabase.from("usuarios").update({ workout_history: workoutActualizado }).eq("codigo", codigo);
    return NextResponse.json({ ok: true, sesionEliminada: workouts[workouts.length - 1] });
  }

  if (action === "marcar_sesion_completada") {
    const { fecha, sesion } = datos;
    const fechaSesion = new Date(fecha);
    const diaSemana = fechaSesion.getDay() || 7;
    const lunesSemana = new Date(fechaSesion);
    lunesSemana.setDate(fechaSesion.getDate() - diaSemana + 1);
    const weekStart = lunesSemana.toISOString().split('T')[0];
    const DIAS_MAP = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    const diaNombre = DIAS_MAP[fechaSesion.getDay()];
    const workoutId = `${weekStart}_${diaNombre.normalize("NFD").replace(/[\u0300-\u036f]/g,"")}`;

    const { data: planActual } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStart).single();
    if (!planActual) return NextResponse.json({ ok: true, mensaje: "Sin plan para esta semana" });

    const normalizarDia = (d: string) => d.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const sessions = planActual.sessions.map((s: any) => {
      if (normalizarDia(s.dia) === normalizarDia(diaNombre)) {
        return {
          ...s,
          completada: true,
          titulo_real: sesion.tipo,
          descripcion_real: sesion.notas
        };
      }
      return s;
    });
    await supabase.from("weekly_plan").update({ sessions, updated_at: new Date().toISOString() }).eq("user_codigo", codigo).eq("week_start", weekStart);
    return NextResponse.json({ ok: true });
  }

  if (action === "obtener_plan_por_fecha") {
    const { fecha } = datos;
    const fechaObj = new Date(fecha);
    const diaSemana = fechaObj.getDay() || 7;
    const lunes = new Date(fechaObj);
    lunes.setDate(fechaObj.getDate() - diaSemana + 1);
    const weekStart = lunes.toISOString().split('T')[0];
    const { data: plan } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStart).single();
    if (!plan) return NextResponse.json({ sesion: null });
    const DIAS_MAP = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    const diaNombre = DIAS_MAP[fechaObj.getDay()].normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const sesionDia = plan.sessions.find((s:any) => s.dia.normalize("NFD").replace(/[\u0300-\u036f]/g,"") === diaNombre);
    return NextResponse.json({ sesion: sesionDia || null });
  }

  // FORGE FOCUS — CONTRATO DETERMINISTA. Construye la interpretacion estructurada de las fuentes de
// entrenamiento del atleta (Forge-controlled vs external) ANTES de que ningun LLM las use. El Week
// Planner de Focus consume esto directamente — nunca interpreta las tablas crudas por su cuenta.
// Un reporte externo NUNCA modifica la planificacion directamente aqui, solo se registra como dato;
// la decision de si afecta a la proxima sesion vive en el Week Planner, no en este contrato.
async function buildFocusContext(supabase: any, codigo: string) {
  const { data: fuentes } = await supabase.from("athlete_training_sources").select("*").eq("user_codigo", codigo).eq("activo", true);
  if (!fuentes || fuentes.length === 0) {
    return { esModoFocus: false, disciplinasForge: [], disciplinasExternas: [], cargaExternaReciente: [], patronesDetectados: [], totalRegistrosHistoricos: 0 };
  }

  const disciplinasForge = fuentes.filter((f: any) => f.owner === "forge");
  const disciplinasExternas = fuentes.filter((f: any) => f.owner === "external");

  // Carga externa real reportada en los ultimos 7 dias — solo lo que el usuario compartio, nunca inventado
  const hace7diasFocus = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: registrosExternos } = await supabase.from("external_training_records")
    .select("fecha,disciplina,duracion,intensidad_percibida,tipo,fatiga_post,load_quality")
    .eq("user_codigo", codigo)
    .gte("fecha", hace7diasFocus)
    .order("fecha", { ascending: false });

  // FORGE FOCUS — APRENDIZAJE DE PATRONES. Consulta el historico REAL acumulado (no simulado) y
  // calcula, de forma determinista (promedios simples, sin LLM), si hay suficiente evidencia para
  // detectar un patron de carga por dia de la semana. Con poco historico, honestamente no hay
  // patron que reportar — el sistema mejora progresivamente segun se acumulan reportes reales,
  // mismo principio ya aplicado con Readiness V1.
  const { data: historicoCompleto } = await supabase.from("external_training_records")
    .select("fecha,disciplina,intensidad_percibida,fatiga_post")
    .eq("user_codigo", codigo)
    .order("fecha", { ascending: false })
    .limit(90);

  const patronesPorDiaSemana: Record<string, { intensidades: number[]; count: number }> = {};
  const DIAS_SEMANA_PATRON = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  (historicoCompleto || []).forEach((r: any) => {
    if (r.intensidad_percibida == null) return;
    const diaSemanaRegistro = DIAS_SEMANA_PATRON[new Date(r.fecha + 'T12:00:00').getDay()];
    if (!patronesPorDiaSemana[diaSemanaRegistro]) patronesPorDiaSemana[diaSemanaRegistro] = { intensidades: [], count: 0 };
    patronesPorDiaSemana[diaSemanaRegistro].intensidades.push(r.intensidad_percibida);
    patronesPorDiaSemana[diaSemanaRegistro].count++;
  });

  // Solo reportamos un patron para un dia si hay AL MENOS 3 registros reales de ese dia — evidencia
  // minima antes de considerarlo un patron, nunca extrapolamos de 1 solo dato.
  const MINIMO_REGISTROS_PARA_PATRON = 3;
  const patronesDetectados = Object.entries(patronesPorDiaSemana)
    .filter(([, v]) => v.count >= MINIMO_REGISTROS_PARA_PATRON)
    .map(([dia, v]) => ({
      dia,
      intensidad_media: Math.round((v.intensidades.reduce((a, b) => a + b, 0) / v.intensidades.length) * 10) / 10,
      veces_reportado: v.count,
    }));

  return {
    esModoFocus: disciplinasExternas.length > 0,
    disciplinasForge,
    disciplinasExternas,
    cargaExternaReciente: registrosExternos || [],
    patronesDetectados,
    totalRegistrosHistoricos: (historicoCompleto || []).length,
  };
}

// FORGE ATHLETE SNAPSHOT — construye el estado real y auditable del atleta que TODOS los componentes
// del Orchestrator deben recibir. Elimina la pregunta "¿esta usando mis datos?" haciendola verificable
// en los logs. Incluye ultimas sesiones reales, volumen reciente por disciplina, y marcas.
async function buildAthleteSnapshot(supabase: any, codigo: string) {
  const { data: usuario } = await supabase.from("usuarios").select("workout_history,marcas_especificas,estado_fisiologico").eq("codigo", codigo).single();
  const workoutHistory = usuario?.workout_history || [];

  // FIX CRITICO CONFIRMADO CON EVIDENCIA REAL: el snapshot usaba workout_history (tipo+sensacion
  // generico), cuando existe una fuente MUCHO mas rica en weekly_plan.sessions[].descripcion_real
  // (cargas especificas, diagnostico tecnico, sensaciones detalladas — ej: "@85kg inestable,
  // recepcion adelantada persistente"). El Session Builder necesita este detalle real para poder
  // progresar cargas y no repetir ciegamente el mismo estimulo semana tras semana.
  let ultimas5SesionesDetalladas: any[] = [];
  try {
    const { data: planesRecientes } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(2);
    const todasSesionesCompletadas: any[] = [];
    (planesRecientes || []).forEach((p: any) => {
      (p.sessions || []).filter((s: any) => s.completada && s.descripcion_real).forEach((s: any) => {
        todasSesionesCompletadas.push({ dia: s.dia, titulo: s.titulo, detalle_real: s.descripcion_real });
      });
    });
    ultimas5SesionesDetalladas = todasSesionesCompletadas.slice(-5);
  } catch (errSnapshotDetallado) {
    console.error("Error obteniendo detalle real de sesiones para snapshot:", errSnapshotDetallado);
  }
  const ultimas5Sesiones = ultimas5SesionesDetalladas.length > 0 ? ultimas5SesionesDetalladas : workoutHistory.slice(-5).map((w: any) => ({ tipo: w.tipo, fecha: w.fecha, sensacion: w.sensacion }));

  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sesionesUltimos7dias = workoutHistory.filter((w: any) => new Date(w.fecha) >= hace7dias);
  const volumenCarrera = sesionesUltimos7dias.filter((w: any) => /carrera|running|z2|z3|z4|intervalo/i.test(w.tipo || "")).length;
  const volumenBox = sesionesUltimos7dias.filter((w: any) => /box|crossfit|wod|halterofilia/i.test(w.tipo || "")).length;

  return {
    ultimas_5_sesiones: ultimas5Sesiones,
    sesiones_ultimos_7_dias: sesionesUltimos7dias.length,
    volumen_carrera_7dias: volumenCarrera,
    volumen_box_7dias: volumenBox,
    marcas: usuario?.marcas_especificas || {},
    fatiga_actual: usuario?.estado_fisiologico?.fatiga_aguda || null
  };
}

if (action === "analizar_bloque_semana") {
    // FORGE ORCHESTRATOR — Paso 1: Block Analyzer. Solo decide estructura, no genera entrenamientos.
    const estado = await generarEstadoCanonico(supabase, codigo);
    // FORGE FOCUS — contrato determinista de disciplinas externas, consultado ANTES del prompt.
    const focusContext = await buildFocusContext(supabase, codigo);
    // FIX CRITICO: coherencia longitudinal real entre bloques — ahora que block_outcomes se guarda
    // deterministamente (ver guardar_plan_semana), el Block Analyzer consulta el bloque ANTERIOR
    // real para no repetir ciegamente la misma estructura sin importar como fue el bloque previo.
    const { data: bloqueAnteriorReal } = await supabase.from("block_outcomes").select("*").eq("user_codigo", codigo).order("fecha_fin", { ascending: false }).limit(1).maybeSingle();
    const { data: usuarioAnalyzer } = await supabase.from("usuarios").select("ciclo_actual,athlete_development,distribucion_semanal,categoria,especialidad,objetivo_principal,perfil").eq("codigo", codigo).single();

    // FORGE EXPOSURE ENGINE — exposicion real del atleta a movimientos/estimulos, calculada
    // deterministamente desde sesiones completadas reales, nunca inferida por el LLM.
    let exposureTexto = "";
    try {
      const { data: planesParaExposure } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(4);
      const sesionesParaExposure: any[] = [];
      (planesParaExposure || []).forEach((p: any) => {
        (p.sessions || []).filter((s: any) => s.completada && s.descripcion_real).forEach((s: any) => {
          sesionesParaExposure.push({ fecha: s.dia, tipo: s.tipo, titulo: s.titulo || "", descripcionReal: s.descripcion_real });
        });
      });
      const disciplinaParaExposure = focusContext.esModoFocus ? focusContext.disciplinasForge[0]?.disciplina : (usuarioAnalyzer?.categoria === "carrera" ? "carrera" : "box");
      const disciplinaNormalizada = (disciplinaParaExposure || "").toLowerCase().includes("carr") ? "carrera" : "box";
      const exposureReport = buildExposureReport(sesionesParaExposure, disciplinaNormalizada);
      exposureTexto = exposureReportToPromptText(exposureReport);
      // FORGE EXPOSURE — agregacion por PATRON y MODALIDAD, no solo por movimiento exacto.
      // Responde "cuanto tiron/empuje/squat he hecho" en vez de solo "cuantos pull-ups exactos",
      // que es la pregunta relevante para variedad real de estimulo, no solo variedad de nombre.
      const { MOVEMENT_LIBRARY: movLibParaPatron } = await import("@/lib/sports/movementLibrary");
      const exposicionPorPatron = agregarExposicionPorPatron(exposureReport.exposiciones, movLibParaPatron);
      const exposicionPorModalidad = agregarExposicionPorModalidad(exposureReport.exposiciones);
      const patronesTop = Object.entries(exposicionPorPatron).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p}: ${n}x`).join(", ");
      const modalidadesTop = Object.entries(exposicionPorModalidad).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `${m}: ${n}x`).join(", ");
      if (patronesTop) exposureTexto += ` Exposición por PATRÓN de movimiento (últimas 4 semanas): ${patronesTop}.`;
      if (modalidadesTop) exposureTexto += ` Exposición por MODALIDAD: ${modalidadesTop}.`;
    } catch (errExposure) {
      console.error("Error calculando Exposure Report:", errExposure);
    }

    // FORGE WEAKNESS FOLLOW-UP ENGINE — determinista, idempotente: recalcula si cada debilidad
// "activa" sigue teniendolo realmente en base a evidencia/exposicion RECIENTE (no si el Coach
// recordo llamar a actualizar_debilidad_dev, que es precisamente el mecanismo fragil que
// causaba que el registro creciera indefinidamente). >=28 dias sin evidencia ni exposicion
// relacionada -> "sin_seguimiento" (nunca se borra, solo se excluye de las activas consumidas).
const { data: exposicionesParaSeguimiento } = await supabase.from("weakness_exposure").select("weakness_id,last_exposure_date").eq("user_codigo", codigo);
    const hoySeguimiento = new Date();
    const desarrolloConSeguimientoRecalculado = (usuarioAnalyzer?.athlete_development || []).map((d: any) => {
      if (d.estado !== "activa") return d;
      const exposicionReciente = (exposicionesParaSeguimiento || []).find((e: any) => e.weakness_id === d.nombre_visible);
      const fechaReferencia = exposicionReciente?.last_exposure_date || d.ultima_revision || d.detectado;
      const diasSinSeguimiento = fechaReferencia ? Math.floor((hoySeguimiento.getTime() - new Date(fechaReferencia).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      if (diasSinSeguimiento >= 28) {
        return { ...d, estado: "sin_seguimiento" };
      }
      return d;
    });
    // Persistir el recalculo solo si algo cambio realmente (evita escrituras innecesarias)
    const huboRecalculo = JSON.stringify(desarrolloConSeguimientoRecalculado) !== JSON.stringify(usuarioAnalyzer?.athlete_development || []);
    if (huboRecalculo) {
      await supabase.from("usuarios").update({ athlete_development: desarrolloConSeguimientoRecalculado }).eq("codigo", codigo);
      console.log(`🔄 WEAKNESS FOLLOW-UP: recalculado estado de debilidades por antiguedad para ${codigo}`);
    }
    const debilidadesActivas = desarrolloConSeguimientoRecalculado.filter((d: any) => d.estado === "activa");

    // FIX ARQUITECTONICO: score deterministico que penaliza exposicion reciente, no solo prioridad
    // declarada. Cuenta cuantas sesiones de los ultimos 7 dias mencionan cada debilidad (por nombre
    // en debilidad_relacionada de weekly_plan reciente), y penaliza el score de esa debilidad.
    // FORGE WEAKNESS EXPOSURE — fuente real y estructurada (no aproximacion), registrada en cada
    // cierre de semana. Consulta las ultimas 2 semanas de exposicion real por debilidad.
    const { data: exposicionesRecientes } = await supabase.from("weakness_exposure").select("weakness_id,sessions_count,last_exposure_date,response").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(20);

    const debilidadesConScore = debilidadesActivas.map((d: any) => {
      const exposicionesDeEstaDebilidad = (exposicionesRecientes || []).filter((e: any) => e.weakness_id === d.nombre_visible);
      const exposicionFinal = exposicionesDeEstaDebilidad.reduce((sum: number, e: any) => sum + (e.sessions_count || 0), 0);
      const ultimaResponse = exposicionesDeEstaDebilidad[0]?.response || "sin_evaluar";

      const scorePrioridad = d.prioridad === "alta" ? 50 : d.prioridad === "media" ? 30 : 15;
      let penalizacionExposicion = Math.min(exposicionFinal * 12, 40);
      // FIX: estancamiento NO se penaliza igual que saturacion normal — si hay exposicion pero sin
      // progreso, la debilidad debe SEGUIR siendo prioritaria (posiblemente con metodo distinto),
      // no perder relevancia solo por haber recibido trabajo.
      if (ultimaResponse === "estancamiento") penalizacionExposicion = Math.max(0, penalizacionExposicion - 25);
      const bonusEstancamiento = ultimaResponse === "estancamiento" ? 15 : 0;

      const score = scorePrioridad - penalizacionExposicion + bonusEstancamiento;
      return { ...d, score, exposicionReciente: exposicionFinal, ultimaResponse };
    });

    const debilidadPrioritaria = debilidadesConScore.sort((a: any, b: any) => b.score - a.score)[0];
    console.log("BLOCK ANALYZER: scores de debilidades (prioridad - penalizacion exposicion):", JSON.stringify(debilidadesConScore.map((d: any) => ({ nombre: d.nombre_visible, score: d.score, exposicion: d.exposicionReciente, response: d.ultimaResponse }))));

    // FIX: si la debilidad prioritaria esta en estancamiento, recuperar los metodos ya usados
    // recientemente para poder indicar explicitamente que se debe CAMBIAR el estimulo, no repetirlo.
    let metodosYaProbadosTexto = "";
    if (debilidadPrioritaria?.ultimaResponse === "estancamiento") {
      const { data: exposicionesConMetodos } = await supabase.from("weakness_exposure").select("metodos_usados").eq("user_codigo", codigo).eq("weakness_id", debilidadPrioritaria.nombre_visible).order("week_start", { ascending: false }).limit(3);
      const todosLosMetodos = (exposicionesConMetodos || []).flatMap((e: any) => e.metodos_usados || []);
      if (todosLosMetodos.length > 0) {
        metodosYaProbadosTexto = `\nESTANCAMIENTO DETECTADO en "${debilidadPrioritaria.nombre_visible}": se ha trabajado con estos metodos recientemente sin mejora real: ${[...new Set(todosLosMetodos)].join(", ")}. Esta semana debe usarse un ESTIMULO DISTINTO a estos, no repetir el mismo enfoque.`;
      }
    }

    // FORGE COACHING NOTES — observaciones tecnicas capturadas en conversacion durante la semana,
    // NUNCA aplicadas directamente a una sesion (ver regla de prompt), su unico canal de entrada
    // a la planificacion real es aqui, en el Block Analyzer del cierre de semana. Priorizadas por
    // confianza y veces_mencionado — una nota mencionada varias veces pesa mas que una unica mencion.
    const hoyConstraintCheck = new Date().toISOString().split('T')[0];
    const { data: coachingNotesPendientes } = await supabase.from("athlete_coaching_notes")
      .select("id,type,domain,movement,issue,priority,confidence,veces_mencionado,source,constraint_level,valid_until")
      .eq("user_codigo", codigo)
      .in("status", ["pending", "considerada"])
      .order("confidence", { ascending: false })
      .limit(10);

    // FORGE CONSTRAINT ENGINE — usa el campo EXPLICITO constraint_level (no inferido desde source,
    // fragil e implicito). Respeta vigencia: una restriccion con valid_until pasado ya no aplica
    // (la molestia pudo resolverse), evitando bloqueos permanentes por una lesion ya curada.
    const restriccionesDuras = (coachingNotesPendientes || []).filter((n: any) =>
      n.constraint_level === "hard" && (!n.valid_until || n.valid_until >= hoyConstraintCheck)
    );
    const observacionesSuaves = (coachingNotesPendientes || []).filter((n: any) => n.constraint_level !== "hard");

    let restriccionesTexto = "";
    if (restriccionesDuras.length > 0) {
      restriccionesTexto = `\n🚫 RESTRICCIONES ACTIVAS — OBLIGATORIO RESPETAR, NO SON SUGERENCIAS:\n${restriccionesDuras.map((n: any) => `- NO prescribir "${n.movement}": ${n.issue}`).join("\n")}\nEstas restricciones vienen de modificaciones reales confirmadas por el atleta (lesion/molestia). Debes evitar estos ejercicios/movimientos en la planificacion de esta semana sin excepcion, hasta que exista evidencia de que el atleta ya no tiene molestia con ellos.`;
    }

    let coachingNotesTexto = "";
    if (observacionesSuaves.length > 0) {
      coachingNotesTexto = `\nOBSERVACIONES TECNICAS PENDIENTES (registradas en conversacion, NUNCA aplicadas todavia a ninguna sesion — evalua si alguna encaja con el bloque/fase actual y merece incorporarse esta semana):\n${observacionesSuaves.map((n: any) => `- [${n.movement || n.domain || "general"}] ${n.issue} (mencionado ${n.veces_mencionado}x, confianza ${n.confidence})`).join("\n")}`;
    }

    // FIX CRITICO DE RAIZ: el Block Analyzer nunca recibia especialidad ni objetivo del atleta,
    // generando estructuras genericas sin anclaje a la disciplina real (ej: CrossFit/halterofilia).
    const analyzerPrompt = `Eres un analizador de bloques de entrenamiento. Tu ÚNICA tarea es devolver un JSON pequeño describiendo la estructura de la PRÓXIMA semana. NO generes entrenamientos ni sesiones detalladas.

CONTEXTO OBLIGATORIO — RESPETAR SIEMPRE:
Categoría/especialidad del atleta: ${usuarioAnalyzer?.especialidad || usuarioAnalyzer?.categoria || "no especificada"} (la estructura semanal DEBE incluir las disciplinas propias de esta especialidad — si es hibrido/crossfit, incluye halterofilia y gimnasticos; si incluye running, incluye sesiones de carrera; etc.)
Objetivo principal: ${JSON.stringify(usuarioAnalyzer?.objetivo_principal) || "no especificado"}
Ciclo actual: ${JSON.stringify(estado.ciclo)}
Debilidad prioritaria activa: ${debilidadPrioritaria ? debilidadPrioritaria.nombre_visible : "ninguna"}
${bloqueAnteriorReal ? `📊 BLOQUE ANTERIOR REAL (usa esto para dar coherencia longitudinal, no repitas ciegamente la misma estructura): tipo "${bloqueAnteriorReal.tipo_bloque}", adherencia ${bloqueAnteriorReal.adherencia}%, resultado "${bloqueAnteriorReal.resultado_global}", ${bloqueAnteriorReal.sesiones_completadas} sesiones completadas, ${bloqueAnteriorReal.lesiones ? "CON incidencia de restriccion/lesion" : "sin incidencias"}. Si el resultado fue "deficiente" o la adherencia fue baja, considera un bloque mas conservador. Si fue "excelente"/"bueno" con alta adherencia, puedes progresar la carga con mas confianza.` : "Sin bloque anterior registrado — es el primer bloque de este atleta o no hay historico suficiente."}
Disponibilidad: ${focusContext.esModoFocus && focusContext.disciplinasForge[0]?.dias?.length > 0 ? `${focusContext.disciplinasForge[0].disciplina}: ${focusContext.disciplinasForge[0].dias.join(", ")}` : usuarioAnalyzer?.distribucion_semanal || "no especificada"}
📈 EXPOSICIÓN REAL RECIENTE (últimas 4 semanas, calculada deterministamente desde sesiones completadas — usa esto para dar variedad real, no aparente): ${exposureTexto}
${metodosYaProbadosTexto}
${restriccionesTexto}
${coachingNotesTexto}
${focusContext.esModoFocus ? `
🎯 FORGE FOCUS ACTIVO — REGLA OBLIGATORIA E INQUEBRANTABLE:
Este atleta tiene entrenamiento EXTERNO gestionado por un tercero (entrenador/box). Tú SOLO gestionas: ${focusContext.disciplinasForge.map((d: any) => d.disciplina).join(", ")}.
Disciplina(s) EXTERNA(S) — NUNCA prescribas ni modifiques contenido para estos días, trátalos como carga externa ya ocupada:
${focusContext.disciplinasExternas.map((d: any) => `- ${d.disciplina}: días ${(d.dias || []).join(", ")}, intensidad habitual ${d.intensidad_habitual || "no especificada"}, duración ${d.duracion_habitual || "no especificada"}${d.variable ? " (puede variar bastante día a día)" : ""}`).join("\n")}
${focusContext.cargaExternaReciente.length > 0 ? `\nCarga externa REAL reportada recientemente por el atleta (últimos 7 días):\n${focusContext.cargaExternaReciente.map((r: any) => `- ${r.fecha}: ${r.disciplina}, ${r.duracion || "?"}min, RPE ${r.intensidad_percibida || "?"}, tipo: ${r.tipo || "no especificado"}`).join("\n")}` : "\nSin reportes recientes de carga externa — asume incertidumbre y aplica margen de seguridad conservador en los días adyacentes a la disciplina externa."}
🚨 REGLA ABSOLUTA E INQUEBRANTABLE: SOLO puedes asignar sesiones de "${focusContext.disciplinasForge[0]?.disciplina}" a EXACTAMENTE estos días: ${focusContext.disciplinasForge[0]?.dias?.join(", ") || "no especificados, usa cualquier dia libre"}. Bajo NINGUNA circunstancia asignes esta disciplina a los días de disciplina externa (${focusContext.disciplinasExternas.map((d: any) => d.dias?.join(", ")).join(", ")}) — esos días son completamente intocables para ti. No decidas un día por tu cuenta ni "optimices" la distribución — usa EXCLUSIVAMENTE los días ya indicados como permitidos.
${focusContext.patronesDetectados.length > 0 ? `\n📊 PATRÓN APRENDIDO (basado en ${focusContext.totalRegistrosHistoricos} reportes reales de este atleta): ${focusContext.patronesDetectados.map((p: any) => `${p.dia} suele tener intensidad media ${p.intensidad_media}/10 (${p.veces_reportado} reportes)`).join(", ")}. Usa esto para anticipar mejor la fatiga residual de esos días.` : ""}` : ""}
${estado.athlete_state?.estado && estado.athlete_state.estado !== "normal" ? `
🔴 ESTADO DEL ATLETA — RESTRICCIÓN ACTIVA (${estado.athlete_state.estado.toUpperCase()}) desde ${estado.athlete_state.desde}, motivo: ${estado.athlete_state.motivo}. Esta semana debe planificarse como semana de gestión de restricción: prioriza mantenimiento/adaptación sobre progresión de carga, respeta estrictamente las restricciones duras listadas arriba, y considera reducir el volumen/intensidad global hasta que el atleta confirme resolución. NO trates esta semana como una semana normal del bloque.` : ""}

Si alguna observacion tecnica pendiente encaja con el bloque/fase actual y no compromete el objetivo principal de la semana, puedes incorporarla como parte del objetivo o debilidad_prioritaria. Si decides incorporar una, incluye su id en el campo "coaching_notes_incorporadas" (array de ids, puede estar vacio).

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"tipo_semana":"acumulacion|intensificacion|realizacion|deload","objetivo":"frase corta del objetivo de esta semana","volumen_relativo":0.0-1.0,"intensidad_relativa":0.0-1.0,"debilidad_prioritaria":"nombre o null","dias_entreno_sugeridos":número,"coaching_notes_incorporadas":[]}`;

    try {
      const analyzerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 300, messages: [{ role: "user", content: analyzerPrompt }] }),
      });
      const analyzerData = await analyzerRes.json();
      const analyzerTexto = analyzerData.content?.map((b: any) => b.text || "").join("") || "{}";
      const analyzerClean = analyzerTexto.replace(/```json|```/g, "").trim();
      const analyzerMatch = analyzerClean.match(/\{[\s\S]*\}/);
      if (!analyzerMatch) throw new Error("Block Analyzer no devolvio JSON valido");
      const analisisBloque = JSON.parse(analyzerMatch[0]);

      // Marcar como "considerada" las notas que el Block Analyzer decidio incorporar al analisis
      // de esta semana — avanza su ciclo de vida sin borrarlas, siguen visibles para Weekly Strategy.
      if (Array.isArray(analisisBloque.coaching_notes_incorporadas) && analisisBloque.coaching_notes_incorporadas.length > 0) {
        await supabase.from("athlete_coaching_notes").update({ status: "considerada", updated_at: new Date().toISOString() }).in("id", analisisBloque.coaching_notes_incorporadas).eq("user_codigo", codigo);
      }

      return NextResponse.json({ ok: true, analisis: analisisBloque });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Block Analyzer: " + err.message }, { status: 500 });
    }
  }

  if (action === "planificar_semana") {
    // FORGE ORCHESTRATOR — Paso 2: Week Planner. Recibe el analisis del Block Analyzer y decide QUE TIPO de sesion va cada dia, sin detalle.
    const { analisis: analisisRecibido } = datos;
    const { data: usuarioPlanner } = await supabase.from("usuarios").select("distribucion_semanal,especialidad,categoria").eq("codigo", codigo).single();

    // FORGE BLOCK MEMORY — el resumen estructurado de la semana ANTERIOR del mismo bloque, para que
    // la Strategy pueda razonar progresion real en vez de partir de cero cada semana. Solo la mas reciente.
    const { data: blockMemoryReciente } = await supabase.from("block_week_summary").select("*").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(1).single();
    const sesionesNoCompletadasAnterior = blockMemoryReciente?.sesiones_no_completadas || [];
    const blockMemoryTexto = blockMemoryReciente
      ? `MEMORIA DEL BLOQUE (resultado de la semana anterior, semana ${blockMemoryReciente.semana_del_bloque}/${blockMemoryReciente.total_semanas_bloque} de ${blockMemoryReciente.bloque}):
Objetivo que perseguia: ${blockMemoryReciente.objetivo_semanal}
Resultado: ${blockMemoryReciente.resultado}
Adherencia real: ${blockMemoryReciente.adherencia_real ?? 100}%
${sesionesNoCompletadasAnterior.length > 0 ? `Sesiones que NO se completaron: ${sesionesNoCompletadasAnterior.map((s: any) => `${s.dia} (${s.titulo})`).join(", ")} — considera si alguna de estas debe recuperarse o compensarse esta semana, sin forzar sobrecarga.` : "Semana completada al 100%."}
Fatiga acumulada: ${blockMemoryReciente.fatiga}
Recuperacion: ${blockMemoryReciente.recuperacion}
Adaptaciones ya conseguidas: ${(blockMemoryReciente.adaptaciones_conseguidas || []).join(", ") || "ninguna registrada"}
Pendiente de trabajar: ${(blockMemoryReciente.pendiente || []).join(", ") || "nada especifico"}
USA ESTO para decidir si progresar (subir carga/intensidad) o consolidar (mantener) esta semana — no repitas la semana anterior desde cero.`
      : "Sin memoria de semana anterior en este bloque (primera semana o sin datos previos) — diseña la estrategia desde el objetivo general.";

    // FORGE WEEKLY STRATEGY + BLUEPRINT (v2) — el modelo primero razona la ESTRATEGIA pura (sin ejercicios,
    // sin dias), y solo despues traduce esa estrategia a un Blueprint dia por dia. Esto refleja como
    // planifica un entrenador real: primero decide la curva de carga y las prioridades, despues asigna dias.
    const plannerPrompt = `Eres un entrenador experto de ${usuarioPlanner?.especialidad || usuarioPlanner?.categoria} diseñando la estrategia de una semana completa de entrenamiento.

${blockMemoryTexto}

ANÁLISIS DEL BLOQUE:
${JSON.stringify(analisisRecibido)}

DISPONIBILIDAD DEL ATLETA (respetar exactamente, nunca reinterpretar):
${usuarioPlanner?.distribucion_semanal || "sin restricciones especificadas, asume disponibilidad flexible"}

PROCESO EN DOS FASES:

FASE 1 — ESTRATEGIA (razona esto PRIMERO, antes de pensar en dias concretos):
- ¿Qué adaptación quieres producir en el atleta durante estos 7 dias?
- ¿Qué cualidades hay que desarrollar y en qué proporción (potencia, motor/cardio, técnica, fuerza, resistencia)?
- ¿Qué curva de carga tiene sentido (alta-media-alta-baja-media-alta-baja, o la que decidas)?
- ¿Cuántos días merece la debilidad prioritaria según su naturaleza e impacto real — usa tu criterio,
  nunca un número fijo predeterminado? ¿Cómo se integra sin monopolizar la semana?
- ¿Qué restricciones de recuperación hay que respetar (no repetir el mismo tipo de fatiga en días consecutivos)?

FASE 2 — BLUEPRINT (traduce la estrategia de la Fase 1 a cada día concreto):
- Asigna cada día según la disponibilidad real del atleta.
- Cada día debe indicar explícitamente su relación con el día anterior y siguiente (qué fatiga hereda, qué debe evitar).
- La disciplina propia de la especialidad debe ocupar la mayor parte del volumen — las debilidades son complemento.

IMPORTANTE: en el campo intensity, escribe el rango como texto simple sin símbolo % literal (ej: "75 a 80 por ciento RM").

Responde SOLO con este JSON válido, sin texto adicional ni markdown, incluyendo AMBAS fases:
{"strategy":{"adaptacion_principal":"frase de la adaptacion principal buscada esta semana","adaptacion_secundaria":"frase de la adaptacion secundaria","riesgo_controlado":"que riesgo/fatiga se esta gestionando activamente esta semana","criterio_general":"regla general que conecta los 7 dias, ej: no juntar dos sesiones neurales maximas consecutivas","cualidades_prioritarias":["cualidad1","cualidad2"],"dias_debilidad_prioritaria":número,"justificacion_debilidad":"por que ese numero de dias tiene sentido"},"sessions":[{"dia":"lunes","tipo":"carrera|box|fuerza|descanso|otro","titulo_breve":"3-5 palabras","focus":"movimiento o cualidad principal","volume":"bajo|medio|alto","intensity":"descripcion breve sin simbolo %","conditioning":"ninguno|corto|largo","relacion_dia_anterior":"que hereda o evita del dia previo","trabaja_debilidad":true_o_false},{"dia":"martes","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false},{"dia":"miercoles","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false},{"dia":"jueves","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false},{"dia":"viernes","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false},{"dia":"sabado","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false},{"dia":"domingo","tipo":"...","titulo_breve":"...","focus":"...","volume":"...","intensity":"...","conditioning":"...","relacion_dia_anterior":"...","trabaja_debilidad":true_o_false}]}
Si un dia es descanso, usa tipo "descanso" (los demas campos pueden quedar vacios).`;

    try {
      const plannerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1800, messages: [{ role: "user", content: plannerPrompt }] }),
      });
      const plannerData = await plannerRes.json();
      const plannerTexto = plannerData.content?.map((b: any) => b.text || "").join("") || "{}";
      const plannerClean = plannerTexto.replace(/```json|```/g, "").trim();
      // Parsing robusto: extraer solo el bloque JSON aunque venga rodeado de texto conversacional
      const plannerMatch = plannerClean.match(/\{[\s\S]*\}/);
      if (!plannerMatch) throw new Error("Week Planner no devolvio JSON valido");
      const estructuraSemana = JSON.parse(plannerMatch[0]);

      // FORGE FOCUS — CORRECCION DETERMINISTA REAL (causa raiz confirmada con evidencia de logs):
      // el Week Planner directamente NUNCA generaba tipo="carrera" (o el tipo de la disciplina
      // Forge) para ningun dia — dejaba los dias de Forge como "descanso" sin mas. El problema
      // nunca fue el DIA asignado, fue que el TIPO correcto nunca se generaba en absoluto.
      const focusContextPlanner = await buildFocusContext(supabase, codigo);
      if (focusContextPlanner.esModoFocus && Array.isArray(estructuraSemana.sessions)) {
        const normalizarDiaPlanner = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const disciplinaForgeReal = focusContextPlanner.disciplinasForge[0];
        const diasForgePermitidos = (disciplinaForgeReal?.dias || []).map(normalizarDiaPlanner);
        const tipoForgeReal = normalizarDiaPlanner(disciplinaForgeReal?.disciplina || "").includes("carr") ? "carrera" : normalizarDiaPlanner(disciplinaForgeReal?.disciplina || "");

        estructuraSemana.sessions = estructuraSemana.sessions.map((s: any) => {
          const diaNorm = normalizarDiaPlanner(s.dia);
          if (diasForgePermitidos.includes(diaNorm) && s.tipo !== tipoForgeReal && s.tipo !== "external_blocked") {
            console.log(`🔧 CORRECCION DETERMINISTA: dia "${s.dia}" forzado de tipo "${s.tipo}" a tipo "${tipoForgeReal}" (disciplina Forge)`);
            return { ...s, tipo: tipoForgeReal, titulo_breve: s.titulo_breve || disciplinaForgeReal?.disciplina };
          }
          return s;
        });
      }

      console.log("🔍 DEBUG estructuraSemana.sessions DESPUES de correccion:", JSON.stringify(estructuraSemana.sessions?.map((s: any) => ({ dia: s.dia, tipo: s.tipo }))));
      return NextResponse.json({ ok: true, estructura: estructuraSemana });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Week Planner: " + err.message }, { status: 500 });
    }
  }

  if (action === "regenerar_sesion_disciplina_forzada") {
    // FORGE RECOVERY PIPELINE — accion EXCEPCIONAL, no parte del flujo normal. Su mision unica es
    // recuperar una sesion que viola una restriccion canonica (disponibilidad). Ignora las debilidades
    // detectadas en el analisis semanal (que pueden estar contaminando la generacion), pero SI mantiene
    // fase/bloque/intensidad del ciclo, porque la sesion sigue perteneciendo al mismo bloque de entrenamiento.
    const { dia, disciplinaForzada, tituloBreve, cicloActual: cicloRecibido, diaAnterior, diaSiguiente } = datos;
    const { data: usuarioBuilder2 } = await supabase.from("usuarios").select("especialidad,categoria,marcas_especificas,ciclo_actual").eq("codigo", codigo).single();
    const cicloParaContexto = cicloRecibido || usuarioBuilder2?.ciclo_actual || {};
    const snapshotForzado = await buildAthleteSnapshot(supabase, codigo);
    console.log(`REGENERACION FORZADA INPUT [${dia}] — Snapshot:`, JSON.stringify(snapshotForzado), "Dia anterior:", JSON.stringify(diaAnterior), "Dia siguiente:", JSON.stringify(diaSiguiente));

    const catalogoPrompt = buildCatalogoPrompt(disciplinaForzada);

    const forcedPrompt = `Eres un constructor de sesiones especializado EXCLUSIVAMENTE en la disciplina: ${disciplinaForzada.toUpperCase()}.

DÍA: ${dia}
IDEA GENERAL: ${tituloBreve || disciplinaForzada}
ESPECIALIDAD DEL ATLETA: ${usuarioBuilder2?.especialidad || usuarioBuilder2?.categoria}
MARCAS: ${JSON.stringify(usuarioBuilder2?.marcas_especificas || {})}
FASE/BLOQUE ACTUAL (mantener coherencia con esto): ${JSON.stringify(cicloParaContexto)}

ESTADO REAL RECIENTE DEL ATLETA: ${JSON.stringify(snapshotForzado)}

CONTEXTO DE DIAS ADYACENTES (evita repetir el mismo estimulo/intensidad):
${diaAnterior ? `Dia anterior (${diaAnterior.dia}): ${diaAnterior.focus || diaAnterior.titulo_breve}, intensidad ${diaAnterior.intensity || "no especificada"}` : "Sin dato"}
${diaSiguiente ? `Dia siguiente (${diaSiguiente.dia}): ${diaSiguiente.focus || diaSiguiente.titulo_breve}, intensidad ${diaSiguiente.intensity || "no especificada"}` : "Sin dato"}
Si el dia anterior/siguiente tiene contenido similar, AJUSTA para dar variedad real.

${catalogoPrompt}

IGNORA COMPLETAMENTE las debilidades detectadas en el analisis semanal previo. Mantén únicamente la
disciplina obligatoria, la fase del bloque, y la intensidad correspondiente. No conviertas esta sesión
en trabajo específico de ninguna debilidad — es una sesión pura de ${disciplinaForzada} dentro del bloque actual.

Si usas un formato de WOD con nombre conocido (Death By, EMOM, AMRAP, For Time, Chipper), especifica
SIEMPRE de forma inequivoca las reglas exactas: que se hace cada minuto/ronda, que pasa si no completas
a tiempo, cuando termina. Un atleta debe poder ejecutar la sesion sin dudas sobre el formato.

Responde SOLO con este JSON, sin texto adicional ni markdown. Usa campos SEPARADOS para cada bloque:
{"titulo":"título breve y claro de ${disciplinaForzada}","por_que":"UNA frase corta","calentamiento":"contenido del calentamiento, conciso","bloque_principal":"contenido del bloque principal, sin ambiguedad en el formato","vuelta_calma":"contenido de vuelta a la calma, conciso","debilidad_relacionada":null}`;

    try {
      const forcedRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 800, messages: [{ role: "user", content: forcedPrompt }] }),
      });
      const forcedData = await forcedRes.json();
      const forcedTexto = forcedData.content?.map((b: any) => b.text || "").join("") || "{}";
      const forcedClean = forcedTexto.replace(/```json|```/g, "").trim();
      const forcedMatch = forcedClean.match(/\{[\s\S]*\}/);
      if (!forcedMatch) throw new Error("Regeneracion forzada no devolvio JSON valido");
      let sesionForzada = JSON.parse(forcedMatch[0]);
      const descripcionEnsambladaForzada = `**Calentamiento**\n${sesionForzada.calentamiento || ""}\n\n**Bloque principal**\n${sesionForzada.bloque_principal || ""}\n\n**Vuelta a la calma**\n${sesionForzada.vuelta_calma || ""}`;

      const validacionCatalogo = validarCatalogoDisciplina(disciplinaForzada, descripcionEnsambladaForzada);
      if (!validacionCatalogo.valido) {
        console.error("REGENERACION FORZADA: violacion de catalogo detectada:", validacionCatalogo.terminosProhibidosEncontrados);
      }

      // NIVEL C — adaptacion automatica del sistema (correccion de disponibilidad durante el Week
      // Integrity Validator), no cuenta contra el limite de generaciones, es Forge haciendo su trabajo.
      await supabase.from("weekly_plan_events").insert({
        user_codigo: codigo,
        week_start: null,
        nivel: "C_adaptacion_automatica",
        accion: "regenerar_sesion_disciplina_forzada",
        motivo: `Correccion de disponibilidad — disciplina forzada a ${disciplinaForzada}`,
        dia_afectado: dia,
        confirmado_por_usuario: false
      });

      return NextResponse.json({
        ok: true,
        sesion: {
          dia,
          tipo: disciplinaForzada,
          titulo: sesionForzada.titulo,
          por_que: sesionForzada.por_que,
          descripcion: descripcionEnsambladaForzada,
          debilidad_relacionada: null,
          origen: "disciplina_forzada",
          disciplina_verificada: validacionCatalogo.valido
        }
      });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en regeneracion forzada: " + err.message }, { status: 500 });
    }
  }

  if (action === "construir_sesion_dia") {
    // FORGE ORCHESTRATOR — Paso 3: Session Builder. Genera el contenido COMPLETO de UN solo dia.
    console.log(`CHECKPOINT construir_sesion_dia: ENTRA para dia=${datos?.dia}`);
    const { dia, tipo, titulo_breve, analisis: analisisSesion, debilidad_relacionada, focus, volume, intensity, conditioning, diaAnterior: diaAnteriorRecibido, diaSiguiente, trabaja_debilidad } = datos;
    const { data: usuarioBuilder } = await supabase.from("usuarios").select("especialidad,categoria,perfil,marcas_especificas,athlete_development,datos_entrenamiento").eq("codigo", codigo).single();
    console.log(`CHECKPOINT construir_sesion_dia [${dia}]: usuarioBuilder obtenido`);

    // FIX CRITICO: el frontend SIEMPRE envia diaAnterior=null para el lunes (primer dia de la
    // semana que se esta generando), aunque el dato real existe en la semana PREVIA ya guardada.
    // Bug real confirmado: el LLM, al recibir null, INVENTABA una referencia plausible al dia
    // anterior ("sesion box previa" cuando en realidad fue carrera) en vez de omitir la mencion.
    // Ahora: si es lunes y no llega diaAnterior, consultamos el domingo real de la semana anterior.
    const normalizarDiaBuilder = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let diaAnterior = diaAnteriorRecibido;
    if (!diaAnterior && normalizarDiaBuilder(dia) === "lunes") {
      try {
        const hoyParaAnteriorBuilder = new Date();
        const diaSemHoyBuilder = hoyParaAnteriorBuilder.getDay() || 7;
        const lunesEstaSemanaBuilder = new Date(hoyParaAnteriorBuilder);
        lunesEstaSemanaBuilder.setDate(hoyParaAnteriorBuilder.getDate() - diaSemHoyBuilder + 1);
        const lunesSemanaAnteriorBuilder = new Date(lunesEstaSemanaBuilder);
        lunesSemanaAnteriorBuilder.setDate(lunesEstaSemanaBuilder.getDate() - 7);
        const weekStartAnteriorBuilder = lunesSemanaAnteriorBuilder.toISOString().split('T')[0];
        const { data: planSemanaAnteriorBuilder } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartAnteriorBuilder).maybeSingle();
        const domingoAnteriorReal = planSemanaAnteriorBuilder?.sessions?.find((s: any) => normalizarDiaBuilder(s.dia) === "domingo");
        if (domingoAnteriorReal) {
          diaAnterior = { dia: "domingo", titulo_breve: domingoAnteriorReal.titulo, focus: domingoAnteriorReal.tipo, intensity: null };
          console.log(`CHECKPOINT construir_sesion_dia [lunes]: dia anterior real recuperado de semana previa — "${domingoAnteriorReal.titulo}"`);
        }
      } catch (errDiaAnteriorBuilder) {
        console.error("Error recuperando dia anterior real para lunes:", errDiaAnteriorBuilder);
      }
    }

    const debilidadInfo = (usuarioBuilder?.athlete_development || []).find((d: any) => d.nombre_visible === debilidad_relacionada);

    // FORGE CONSTRAINT ENGINE — segunda defensa en el punto donde se materializa CADA sesion
    // individual, nunca sustituto del Deterministic Plan Validator final. El Block Analyzer ya
    // decidio la estructura semanal respetando restricciones, pero el Session Builder tambien
    // debe recibirlas directamente — no confiamos en que la intencion heredada sea suficiente.
    const hoyConstraintBuilder = new Date().toISOString().split('T')[0];
    const { data: hardConstraintsBuilder } = await supabase.from("athlete_coaching_notes")
      .select("movement,issue,constraint_level,prohibits_impact,prohibits_jump,prohibits_axial_load,prohibits_deep_flexion,prohibits_overhead_load")
      .eq("user_codigo", codigo)
      .in("constraint_level", ["hard", "reassessment"])
      .in("status", ["pending", "considerada"])
      .or(`valid_until.is.null,valid_until.gte.${hoyConstraintBuilder}`);
    const restriccionesHardBuilder = (hardConstraintsBuilder || []).filter((c: any) => c.constraint_level === "hard");
    const restriccionesReassessmentBuilder = (hardConstraintsBuilder || []).filter((c: any) => c.constraint_level === "reassessment");
    const restriccionesBuilderTexto =
      (restriccionesHardBuilder.length > 0
        ? `\n🚫 RESTRICCIONES ACTIVAS DEL ATLETA — OBLIGATORIO RESPETAR, NO SON SUGERENCIAS:\n${restriccionesHardBuilder.map((c: any) => `- Evitar "${c.movement}": ${c.issue}`).join("\n")}\nEstas restricciones vienen de una molestia/lesion real confirmada. La sesion que generes NO puede incluir estos movimientos ni cargas que los agraven, sin excepcion.`
        : "") +
      (restriccionesReassessmentBuilder.length > 0
        ? `\n🟡 ZONA EN REEVALUACION — PROGRESION CONTROLADA, NUNCA VUELTA COMPLETA A LA CARGA HABITUAL:\n${restriccionesReassessmentBuilder.map((c: any) => `- "${c.movement}": ${c.issue}`).join("\n")}\nEl atleta confirmo que la molestia se resolvio, pero esto significa "en reevaluacion", NUNCA "sin restriccion". Para estas zonas: usa SOLO intensidad baja-moderada, evita impacto alto o volumen alto en el primer contacto, introduce el estimulo de forma progresiva y conservadora. NO generes series de alta intensidad, sprints, ni cargas maximas en esta zona todavia — eso requiere varias sesiones de tolerancia confirmada primero.`
        : "");

    // FORGE ATHLETE SNAPSHOT — contexto real y auditable del atleta, elimina la duda de "¿usa mis datos?"
    // COLD-START SAFE: envuelto en try/catch propio, un usuario nuevo sin historial no debe bloquear el flujo.
    let snapshot: any = { ultimas_5_sesiones: [], sesiones_ultimos_7_dias: 0, volumen_carrera_7dias: 0, volumen_box_7dias: 0, marcas: {}, fatiga_actual: null };
    try {
      snapshot = await buildAthleteSnapshot(supabase, codigo);
    } catch (errSnapshot) {
      console.error(`CHECKPOINT construir_sesion_dia [${dia}]: ERROR en snapshot, usando snapshot vacio:`, errSnapshot);
    }
    console.log(`CHECKPOINT construir_sesion_dia [${dia}]: snapshot listo`);

    // FASE 4 — CANDIDATOS RANKEADOS: el Session Builder recibe movimientos YA priorizados por
    // el motor (menos expuestos recientemente = mas prioritarios), no elige libremente sobre
    // toda la libreria. Estimulo objetivo inferido del "focus"/"tipo" que decidio el Week Planner.
    let candidatosTexto = "";
    let estimuloObjetivoReal = "";
    try {
      const disciplinaSesion = (tipo || "").toLowerCase().includes("carr") ? "carrera" : "box";
      const estimulosDisciplina = Object.values(STIMULUS_LIBRARY).filter((e: any) => e.discipline === disciplinaSesion);
      const focusNormalizado = (focus || titulo_breve || "").toLowerCase();
      const estimuloMatch = estimulosDisciplina.find((e: any) => focusNormalizado.includes(e.id.replace(/_/g, " ")) || focusNormalizado.includes(e.descripcion.toLowerCase().split(" ")[0]));
      estimuloObjetivoReal = estimuloMatch?.id || "";
      if (estimuloObjetivoReal) {
        const { data: planesParaCandidatos } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(4);
        const exposicionesCandidatos: any[] = [];
        (planesParaCandidatos || []).forEach((p: any) => {
          (p.sessions || []).filter((s: any) => s.completada && s.descripcion_real).forEach((s: any) => exposicionesCandidatos.push({ dia: s.dia, tipo: s.tipo, titulo: s.titulo || "", descripcionReal: s.descripcion_real }));
        });
        const { buildExposureReport: buildExpReportLocal } = await import("@/lib/sports/exposureEngine");
        const reportLocal = buildExpReportLocal(exposicionesCandidatos.map((e: any) => ({ fecha: e.dia, tipo: e.tipo, titulo: e.titulo, descripcionReal: e.descripcionReal })), disciplinaSesion);
        const { data: athleteStateBuilder } = await supabase.from("athlete_state_events").select("body_area").eq("user_codigo", codigo).eq("estado", "restricted").order("created_at", { ascending: false }).limit(3);
        const zonasRestringidasBuilder = (athleteStateBuilder || []).map((r: any) => r.body_area).filter(Boolean);
        const candidatosRankeados = rankearCandidatos(estimuloObjetivoReal, disciplinaSesion, zonasRestringidasBuilder, reportLocal.exposiciones);
        if (candidatosRankeados.length > 0) {
          candidatosTexto = `\n🎯 MOVIMIENTOS CANDIDATOS PARA EL ESTÍMULO "${estimuloObjetivoReal}" (ya priorizados por exposición reciente, los primeros son los MENOS usados recientemente — prioriza estos para dar variedad real): ${candidatosRankeados.slice(0, 5).map((c: any) => `${c.id}${c.vecesExpuestoReciente > 0 ? ` (usado ${c.vecesExpuestoReciente}x recientemente)` : " (sin exposición reciente)"}`).join(", ")}`;
        }
      }
    } catch (errCandidatos) {
      console.error(`CHECKPOINT construir_sesion_dia [${dia}]: error calculando candidatos rankeados:`, errCandidatos);
    }

    // FORGE SESSION ENGINE (v1): el Session Builder ya no inventa la estructura desde cero.
    // Recibe la INTENCION exacta que ya decidio el Week Planner y solo la desarrolla en detalle.
    const builderPrompt = `Eres un constructor de sesiones de entrenamiento. Tu ÚNICA tarea es DESARROLLAR EN DETALLE
la sesion segun la intencion ya decidida — NO inventes una estructura distinta, solo redacta el contenido
especifico (ejercicios, series, reps, cargas) que cumpla exactamente esta intencion.

DÍA: ${dia}
TIPO DE SESIÓN: ${tipo}
IDEA GENERAL: ${titulo_breve}
${candidatosTexto}
INTENCION YA DECIDIDA (respeta esto, no la cambies):
- Foco/movimiento principal: ${focus || "no especificado"}
- Volumen: ${volume || "medio"}
- Intensidad: ${intensity || "no especificada"}
- Condicionamiento metabolico: ${conditioning || "ninguno"}
CONTEXTO DEL BLOQUE: ${JSON.stringify(analisisSesion)}
ESPECIALIDAD: ${usuarioBuilder?.especialidad || usuarioBuilder?.categoria}
MARCAS DEL ATLETA: ${JSON.stringify(usuarioBuilder?.marcas_especificas || {})}
${debilidadInfo ? `DEBILIDAD A TRABAJAR HOY: ${debilidadInfo.nombre_visible} — ${debilidadInfo.diagnostico}` : ""}
${restriccionesBuilderTexto}
${hardConstraintsBuilder && hardConstraintsBuilder.length > 0 ? `\n🚨 REGLA CRÍTICA DE TÍTULO: NUNCA incluyas en el "titulo" de la sesión el nombre del movimiento/zona restringida como referencia al estímulo original que sustituyes (ej: NO titules "Carrera larga adaptada (bici)" — en su lugar usa el nombre de la modalidad real que SÍ vas a usar, ej: "Bici estática Z2 60min"). El título debe describir fielmente lo que el atleta va a hacer, nunca lo que está evitando.` : ""}

ZONAS DE FRECUENCIA CARDIACA REALES DEL ATLETA (usar SIEMPRE estos rangos de pulsaciones exactas, NUNCA
uses porcentajes de FCmax genericos como "70-80% FCmax" — el atleta necesita el rango de ppm directo):
${JSON.stringify({z1: usuarioBuilder?.datos_entrenamiento?.z1_fc, z2: usuarioBuilder?.datos_entrenamiento?.z2_fc, z3: usuarioBuilder?.datos_entrenamiento?.z3_fc, z4: usuarioBuilder?.datos_entrenamiento?.z4_fc, z5: usuarioBuilder?.datos_entrenamiento?.z5_fc, fc_reposo: usuarioBuilder?.datos_entrenamiento?.fc_reposo, fc_maxima: usuarioBuilder?.datos_entrenamiento?.fc_maxima})}
Si no hay dato para una zona especifica, no la menciones con numero — usa descripcion cualitativa (ej: "ritmo conversacional") en su lugar.

ESTADO REAL RECIENTE DEL ATLETA (usar para evitar repetir estimulos o sobrecargar):
Ultimas 5 sesiones: ${JSON.stringify(snapshot.ultimas_5_sesiones)}
Sesiones en los ultimos 7 dias: ${snapshot.sesiones_ultimos_7_dias}
Volumen carrera ultimos 7 dias: ${snapshot.volumen_carrera_7dias} sesiones
Volumen box ultimos 7 dias: ${snapshot.volumen_box_7dias} sesiones

CONTEXTO DE DIAS ADYACENTES (evita repetir el mismo estimulo/intensidad en dias consecutivos):
${diaAnterior ? `Dia anterior (${diaAnterior.dia}): ${diaAnterior.focus || diaAnterior.titulo_breve}, intensidad ${diaAnterior.intensity || "no especificada"}${diaAnterior.relacion_dia_anterior ? `

RELACIÓN ENTRE DÍAS — DECISIÓN DEL WEEK PLANNER:
${diaAnterior.relacion_dia_anterior}
Esta relación es una decisión estructural YA TOMADA por el planificador. Debes ejecutarla al construir esta sesión — no la reinterpretes ni la sustituyas por otra relación, ni inventes una relación diferente basándote en el contenido que estés generando.` : ""}` : "Sin dato de dia anterior — NO menciones ni inventes referencia alguna a una sesion anterior en el campo por_que, simplemente omite esa mencion."}
${diaSiguiente ? `Dia siguiente (${diaSiguiente.dia}): ${diaSiguiente.focus || diaSiguiente.titulo_breve}, intensidad ${diaSiguiente.intensity || "no especificada"}` : "Sin dato de dia siguiente"}
Si el dia anterior o siguiente tiene el mismo foco/intensidad que hoy, AJUSTA para dar variedad real
(diferente ritmo, diferente distancia, diferente enfoque) — nunca generes dos dias casi identicos seguidos.

IMPORTANTE — FORMATO VISUAL Y CLARIDAD EJECUTABLE:
- Cada bloque va en su PROPIO campo del JSON, nunca mezclados en un solo texto.
- Empieza cada campo indicando la duracion estimada entre parentesis, ej: "(12 min)" al inicio del contenido.
- Usa bullets con guion "-" para cada ejercicio o paso, uno por linea (usa \\n entre bullets).
- Si el bloque principal tiene sub-partes (ej: fuerza + WOD), separalas claramente con "A)" y "B)" en
  lineas distintas, cada una con su propio titulo breve.
- Si usas un formato de WOD con nombre conocido (Death By, EMOM, AMRAP, For Time, Chipper), especifica
  SIEMPRE de forma inequivoca las reglas exactas: que se hace cada minuto/ronda, que pasa si no completas
  a tiempo, cuando termina. Un atleta debe poder ejecutar la sesion sin dudas sobre el formato.
- Se CONCISO en cada bullet, pero manten la estructura visual clara — prioriza claridad sobre brevedad extrema.

Responde SOLO con este JSON, sin texto adicional ni markdown. Usa campos SEPARADOS para cada bloque:
{"titulo":"título breve y claro","por_que":"UNA frase corta explicando el propósito de esta sesión concreta","calentamiento":"(X min)\\n- bullet 1\\n- bullet 2","bloque_principal":"(X min)\\nA) [subtitulo]\\n- bullets\\n\\nB) [subtitulo]\\n- bullets (solo si hay sub-partes, si no una sola lista de bullets)","vuelta_calma":"(X min)\\n- bullet 1\\n- bullet 2","debilidad_relacionada":${debilidadInfo ? `"${debilidadInfo.nombre_visible}"` : "null"}}`;

    try {
      const builderRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 900, messages: [{ role: "user", content: builderPrompt }] }),
      });
      const builderData = await builderRes.json();
      const builderTexto = builderData.content?.map((b: any) => b.text || "").join("") || "{}";
      const builderClean = builderTexto.replace(/```json|```/g, "").trim();
      console.log("SESSION BUILDER RAW COMPLETO:", builderClean);
      const builderMatch = builderClean.match(/\{[\s\S]*\}/);
      if (!builderMatch) throw new Error("Session Builder no devolvio JSON valido. RAW: " + builderClean.substring(0, 300));
      const sesionCompleta = JSON.parse(builderMatch[0]);
      // Ensamblar los campos separados en la descripcion final con separacion clara de bloques
      const descripcionEnsamblada = `**Calentamiento**\n${sesionCompleta.calentamiento || ""}\n\n**Bloque principal**\n${sesionCompleta.bloque_principal || ""}\n\n**Vuelta a la calma**\n${sesionCompleta.vuelta_calma || ""}`;
      // FIX DETERMINISTICO: el campo debilidad_relacionada NUNCA lo decide el LLM. Se deriva
      // exclusivamente de "trabaja_debilidad" que ya decidio el Blueprint — nunca del criterio libre
      // del Session Builder, evitando incoherencias semanticas para Discovery/Analytics futuros.
      const debilidadFinal = trabaja_debilidad === true ? (debilidad_relacionada || null) : null;

      // FORGE SESSION DUPLICATION VALIDATOR — capa determinista POST-generacion. El LLM propone,
      // el backend decide: si la sesion generada es sospechosamente identica a una pasada real,
      // se rechaza y se regenera UNA vez con instruccion explicita, en vez de aceptarla silenciosamente.
      const resultadoDuplicacion = detectarSesionDuplicada(
        { titulo: sesionCompleta.titulo, descripcion: descripcionEnsamblada },
        snapshot.ultimas_5_sesiones || []
      );
      if (resultadoDuplicacion.esDuplicado) {
        console.error(`🚨 SESSION DUPLICATION DETECTADA [${dia}]: similitud=${resultadoDuplicacion.similitudMaxima} con "${resultadoDuplicacion.sesionParecida}" — regenerando una vez con instruccion explicita`);
        const builderPromptRetry = builderPrompt + `\n\n🚨 INTENTO ANTERIOR RECHAZADO: generaste una sesion casi identica a "${resultadoDuplicacion.sesionParecida}" (similitud ${Math.round(resultadoDuplicacion.similitudMaxima*100)}%). DEBES generar contenido genuinamente DISTINTO — diferentes ejercicios, diferente estructura, aunque el tipo/foco sea el mismo.`;
        const builderRetryRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 900, messages: [{ role: "user", content: builderPromptRetry }] }),
        });
        const builderRetryData = await builderRetryRes.json();
        const builderRetryTexto = builderRetryData.content?.map((b: any) => b.text || "").join("") || "{}";
        const builderRetryClean = builderRetryTexto.replace(/```json|```/g, "").trim();
        const builderRetryMatch = builderRetryClean.match(/\{[\s\S]*\}/);
        if (builderRetryMatch) {
          const sesionRetry = JSON.parse(builderRetryMatch[0]);
          const descripcionRetryEnsamblada = `**Calentamiento**\n${sesionRetry.calentamiento || ""}\n\n**Bloque principal**\n${sesionRetry.bloque_principal || ""}\n\n**Vuelta a la calma**\n${sesionRetry.vuelta_calma || ""}`;
          return NextResponse.json({ ok: true, sesion: { dia, tipo, titulo: sesionRetry.titulo, por_que: sesionRetry.por_que, descripcion: descripcionRetryEnsamblada, debilidad_relacionada: debilidadFinal, regenerada_por_duplicado: true } });
        }
      }

      // FASE 5 — VALIDADOR DE COHERENCIA ESTIMULO-SESION: no basta con "pertenece a la disciplina
      // correcta", debe servir realmente al estimulo que el Week Planner decidio. Solo verifica
      // (no bloquea el guardado) por ahora — registra el hallazgo para poder auditar el sistema
      // sin arriesgar romper el flujo mientras se valida en produccion.
      if (estimuloObjetivoReal) {
        const disciplinaValidacionFinal = (tipo || "").toLowerCase().includes("carr") ? "carrera" : "box";
        const validacionEstimuloFinal = validarCoherenciaEstimulo(estimuloObjetivoReal, disciplinaValidacionFinal, descripcionEnsamblada);
        if (validacionEstimuloFinal.valido) {
          console.log(`✅ COHERENCIA ESTIMULO [${dia}]: sesion coherente con estimulo "${estimuloObjetivoReal}"`);
        } else {
          // FORGE SUBSTITUTION ENGINE — antes de marcar como incoherente, verificar si el
          // contenido corresponde a una SUSTITUCION VALIDA (ej: bici por rodaje_largo cuando
          // hay restriccion de rodilla activa), en vez de una incoherencia real.
          const movimientoPrimarioEsperado = getMovimientosPorEstimulo(estimuloObjetivoReal, disciplinaValidacionFinal)[0]?.id || "";
          const { data: athleteStateValidacion } = await supabase.from("athlete_state_events").select("body_area").eq("user_codigo", codigo).eq("estado", "restricted").order("created_at", { ascending: false }).limit(3);
          const zonasRestringidasValidacion = (athleteStateValidacion || []).map((r: any) => r.body_area).filter(Boolean);
          const evaluacionSust = movimientoPrimarioEsperado ? evaluarSustitucion(movimientoPrimarioEsperado, descripcionEnsamblada, zonasRestringidasValidacion) : null;
          if (evaluacionSust?.resultado === "sustitucion_valida") {
            console.log(`✅ SUSTITUCION VALIDA [${dia}]: ${evaluacionSust.explicacion}`);
          } else if (evaluacionSust?.resultado === "sustitucion_no_registrada") {
            console.log(`ℹ️ SUSTITUCION NO REGISTRADA [${dia}]: ${evaluacionSust.explicacion} — revisar manualmente si es un caso nuevo a añadir a SUBSTITUTION_MAP.`);
          } else {
            console.error(`⚠️ COHERENCIA ESTIMULO [${dia}]: ${validacionEstimuloFinal.motivo}${evaluacionSust ? ` | Sustitucion: ${evaluacionSust.explicacion}` : ""}`);
          }
        }
      }

      // FORGE REASSESSMENT SAFETY CHECK — determinista, no depende de que el LLM respete la instruccion.
      // Bug real confirmado con evidencia: una zona en reevaluacion de rodilla (prohibits_impact=true)
      // recibio una sesion de 400m Z3 (alto impacto) el mismo dia que empezo la reevaluacion.
      const restriccionesReassessmentCheck = (hardConstraintsBuilder || []).filter((c: any) => c.constraint_level === "reassessment");
      if (restriccionesReassessmentCheck.length > 0) {
        const requierePrudenciaImpacto = restriccionesReassessmentCheck.some((c: any) => c.prohibits_impact || c.prohibits_jump);
        const movimientosAltoImpactoEnSesion = Object.values(MOVEMENT_LIBRARY).filter((m: any) => m.impact === "alto").some((m: any) => {
          const textoNorm = descripcionEnsamblada.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return textoNorm.includes(m.id.replace(/_/g, " "));
        });
        if (requierePrudenciaImpacto && movimientosAltoImpactoEnSesion) {
          console.error(`⚠️ REASSESSMENT SAFETY: sesion [${dia}] contiene movimiento de ALTO IMPACTO mientras hay zona en reevaluacion con prohibits_impact/jump activo — revisar manualmente. Restricciones: ${restriccionesReassessmentCheck.map((c: any) => c.movement).join(", ")}`);
        }
      }

      return NextResponse.json({ ok: true, sesion: { dia, tipo, titulo: sesionCompleta.titulo, por_que: sesionCompleta.por_que, descripcion: descripcionEnsamblada, debilidad_relacionada: debilidadFinal } });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Session Builder: " + err.message }, { status: 500 });
    }
  }

  if (action === "check_week_closure") {
    // FORGE CHECK_WEEK_CLOSURE — SOLO LECTURA, sin efectos secundarios. Nunca genera Insight, Summary,
    // Weakness Exposure ni Celebrations. Su unica funcion es responder: "¿esta semana lista para
    // cerrarse?" para que el FRONTEND decida si mostrar el banner. La ejecucion real vive en CLOSE_WEEK,
    // disparada solo cuando el usuario confirma explicitamente pulsando el boton.
    const ahoraCheck = new Date();
    const hoyCheckStr = ahoraCheck.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const hoyCheckFecha = new Date(hoyCheckStr + 'T12:00:00');
    const diaSemCheck = hoyCheckFecha.getDay() || 7;
    const lunesCheck = new Date(hoyCheckFecha);
    lunesCheck.setDate(hoyCheckFecha.getDate() - diaSemCheck + 1);
    const weekStartCheck = lunesCheck.toISOString().split('T')[0];

    const { data: planSemanaCheck } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartCheck).single();
    if (!planSemanaCheck) return NextResponse.json({ ready: false });

    const ORDEN_DIAS_CHECK = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
    const normalizarDiaCheck = (d: string) => (d || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const sesionesCheck = planSemanaCheck.sessions || [];
    const sesionesQueRequierenReporteCheck = sesionesCheck.filter((s: any) => s.tipo !== "descanso");
    const todasCompletadasCheck = sesionesQueRequierenReporteCheck.length > 0 && sesionesQueRequierenReporteCheck.every((s: any) => s.completada === true);

    // FIX CRITICO: bug real confirmado — el domingo (ultimo dia REAL de la semana) nunca cumplia
      // "semana terminada cronologicamente" porque la comparacion exigia ESTRICTAMENTE posterior al
      // domingo. Ahora incluye el domingo mismo como dia valido para considerar la semana terminada.
      const domingoSemanaCheck = new Date(lunesCheck);
      domingoSemanaCheck.setDate(lunesCheck.getDate() + 6);
      const semanaTerminadaCronologicamenteCheck = hoyCheckFecha.getTime() >= domingoSemanaCheck.getTime();

    if (!todasCompletadasCheck && !semanaTerminadaCronologicamenteCheck) {
      return NextResponse.json({ ready: false });
    }

    // FORGE IDEMPOTENCY CHECK — comprueba si esta semana ya tiene un registro de cierre explicito
    // en week_closure_log (tabla dedicada, no infiere del Insight que ya sabemos que es fragil).
    const { data: cierreExistente } = await supabase.from("week_closure_log").select("id").eq("user_codigo", codigo).eq("week_start", weekStartCheck).limit(1);
    const yaCerrada = !!(cierreExistente && cierreExistente.length > 0);

    const { data: usuarioModoCheck } = await supabase.from("usuarios").select("modo_entrada").eq("codigo", codigo).single();
    const puedeGenerarSiguiente = usuarioModoCheck?.modo_entrada === "planificacion";

    return NextResponse.json({
      ready: true,
      weekStart: weekStartCheck,
      yaCerrada,
      canGenerateNextWeek: puedeGenerarSiguiente,
      adherencia: `${sesionesQueRequierenReporteCheck.filter((s: any) => s.completada).length}/${sesionesQueRequierenReporteCheck.length}`
    });
  }

  if (action === "close_week") {
    // FORGE CLOSE_WEEK — ejecucion REAL del cierre, disparada SOLO cuando el usuario confirma
    // explicitamente pulsando el boton. Idempotente por diseño: verifica week_closure_log ANTES
    // de generar nada — si ya existe registro de cierre para esta semana, no repite el trabajo.
    const ahoraClose = new Date();
    const hoyCloseStr = ahoraClose.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const hoyCloseFecha = new Date(hoyCloseStr + 'T12:00:00');
    const diaSemClose = hoyCloseFecha.getDay() || 7;
    const lunesClose = new Date(hoyCloseFecha);
    lunesClose.setDate(hoyCloseFecha.getDate() - diaSemClose + 1);
    const weekStartClose = lunesClose.toISOString().split('T')[0];

    const { data: cierreYaExisteClose } = await supabase.from("week_closure_log").select("id").eq("user_codigo", codigo).eq("week_start", weekStartClose).limit(1);
    if (cierreYaExisteClose && cierreYaExisteClose.length > 0) {
      console.error(`🚨 CLOSE_WEEK bloqueado — semana ${weekStartClose} ya tiene registro de cierre para ${codigo}, evitando duplicacion`);
      return NextResponse.json({ ok: true, alreadyClosed: true, weekStart: weekStartClose });
    }

    const { data: planSemana } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartClose).single();
    if (!planSemana) return NextResponse.json({ error: "No hay plan para esta semana" }, { status: 404 });
    // Alias para reutilizar el resto de la logica original sin renombrar mas variables innecesariamente
    const hoyCierreStr = hoyCloseStr;
    const hoyCierreFecha = hoyCloseFecha;
    const diaSemCierre = diaSemClose;
    const lunesCierre = lunesClose;
    const weekStartCierre = weekStartClose;

    // FIX: dias de descanso/recuperacion que ya PASARON (fecha anterior a hoy) sin reporte explicito
    // se marcan automaticamente como completados al momento de verificar el cierre — un descanso no
    // reportado simplemente significa que el atleta descanso, no que la sesion sigue "pendiente".
    const ORDEN_DIAS_CIERRE = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
    const normalizarDiaCierre = (d: string) => (d || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const hoyIdxCierre = diaSemCierre - 1;
    let huboAutoCompletado = false;
    const sessionsConAutoCompletado = (planSemana.sessions || []).map((s: any) => {
      const esDescanso = /descanso/i.test(s.tipo || "");
      const idxDiaSesion = ORDEN_DIAS_CIERRE.indexOf(normalizarDiaCierre(s.dia));
      const diaYaPaso = idxDiaSesion < hoyIdxCierre;
      if (esDescanso && diaYaPaso && s.completada !== true) {
        huboAutoCompletado = true;
        return { ...s, completada: true };
      }
      return s;
    });
    if (huboAutoCompletado) {
      await supabase.from("weekly_plan").update({ sessions: sessionsConAutoCompletado }).eq("user_codigo", codigo).eq("week_start", weekStartCierre);
      console.log("CIERRE: auto-completados dias de descanso pasados sin reporte");
    }

    const sessions = sessionsConAutoCompletado;
    const sesionesQueRequierenReporte = sessions.filter((s: any) => s.tipo !== "descanso");
    const todasCompletadas = sesionesQueRequierenReporte.length > 0 && sesionesQueRequierenReporte.every((s: any) => s.completada === true);
    console.log("VERIFICAR CIERRE: sesionesQueRequierenReporte=", sesionesQueRequierenReporte.length, "todasCompletadas=", todasCompletadas, "detalle=", JSON.stringify(sesionesQueRequierenReporte.map((s:any)=>({dia:s.dia,tipo:s.tipo,completada:s.completada}))));

    // FIX: separar "semana terminada" (cronologico, zona horaria real de Forge) de "semana completada"
    // (100% adherencia). Antes se exigia 100% para siquiera considerar el cierre, dejando semanas
    // incompletas "abiertas" indefinidamente. Ahora: si la semana termino cronologicamente (domingo real
    // ya paso segun Europe/Madrid), se cierra igualmente, calculando el resultado real (sea 100% o no).
    // FIX CRITICO: mismo bug real que en check_week_closure — el domingo mismo (ultimo dia real de
    // la semana) nunca cumplia "semana terminada cronologicamente" por la comparacion estrictamente
    // "mayor que". Esta es una copia INDEPENDIENTE de la misma logica en close_week (ejecucion real),
    // separada de check_week_closure (verificacion) — ambas necesitaban el mismo fix por separado.
    const domingoDeEstaSemana = new Date(lunesCierre);
    domingoDeEstaSemana.setDate(lunesCierre.getDate() + 6);
    const semanaTerminadaCronologicamente = hoyCierreFecha.getTime() >= domingoDeEstaSemana.getTime();

    if (!todasCompletadas && !semanaTerminadaCronologicamente) {
      // La semana sigue en curso Y no esta completa — legitimamente no hay nada que cerrar todavia
      return NextResponse.json({ semanaCompleta: false });
    }

    const { data: insightExistente } = await supabase.from("athlete_events").select("id").eq("user_codigo", codigo).eq("type", "forge_insight").ilike("title", `%${weekStartCierre}%`).limit(1);

    if (insightExistente && insightExistente.length > 0) {
      return NextResponse.json({ semanaCompleta: true, yaCerrada: true });
    }

    // Generar el Forge Insight automaticamente con una llamada dedicada, basado en datos reales
    const { data: usuarioInsight } = await supabase.from("usuarios").select("athlete_development,historial_fisiologico").eq("codigo", codigo).single();
    const sesionesResumen = sessions.filter((s: any) => s.tipo !== "descanso").map((s: any) => `${s.dia}: ${s.titulo_real || s.titulo}${s.descripcion_real ? ' — ' + s.descripcion_real.substring(0, 100) : ''}`).join("\n");
    const histFisioSemana = (usuarioInsight?.historial_fisiologico || []).slice(-7);
    const debilidadesActivas = (usuarioInsight?.athlete_development || []).filter((d: any) => d.estado !== "resuelta").map((d: any) => d.nombre_visible);

    const insightPrompt = `Eres Forge generando el resumen semanal (Forge Insight) de un atleta. Basándote SOLO en estos datos reales, escribe un resumen de 5-6 líneas máximo, en español, tono cercano y profesional:

SESIONES COMPLETADAS ESTA SEMANA:
${sesionesResumen}

TENDENCIA FISIOLÓGICA (últimos registros):
${JSON.stringify(histFisioSemana)}

DEBILIDADES ACTIVAS:
${debilidadesActivas.join(", ") || "ninguna registrada"}

Incluye: adherencia (X/${sesionesQueRequierenReporte.length} sesiones), tendencia fisiológica general, y una frase sobre el ajuste para la semana siguiente. NO inventes datos que no estén arriba.`;

    let resumenGenerado = "Semana completada con éxito.";
    try {
      const insightRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, messages: [{ role: "user", content: insightPrompt }] }),
      });
      const insightData = await insightRes.json();
      resumenGenerado = insightData.content?.map((b: any) => b.text || "").join("") || resumenGenerado;
    } catch {}

    const puntosActuales = (usuarioInsight?.athlete_development || []).length; // placeholder simple, se puede refinar
    await supabase.from("athlete_events").insert({
      user_codigo: codigo,
      date: hoyCierreStr,
      type: "forge_insight",
      title: `Forge Insight — Semana ${weekStartCierre}`,
      data: { notas: resumenGenerado, adherencia: `${sesionesQueRequierenReporte.filter((s:any)=>s.completada).length}/${sesionesQueRequierenReporte.length}`, generado_automaticamente: true }
    });

    // FORGE BLOCK WEEK SUMMARY — objeto ESTRUCTURADO (no narrativo) que la Strategy de la proxima
    // semana leera para razonar progresion real dentro del bloque, en vez de partir de cero cada vez.
    const { data: usuarioCicloSummary } = await supabase.from("usuarios").select("ciclo_actual").eq("codigo", codigo).single();
    const cicloSummary = usuarioCicloSummary?.ciclo_actual || {};

    const summaryPrompt = `Eres Forge analizando el resultado REAL de una semana de entrenamiento para generar un resumen ESTRUCTURADO
que servira de memoria para planificar la siguiente semana del mismo bloque. NO es para el atleta, es para el sistema.

SESIONES COMPLETADAS ESTA SEMANA:
${sesionesResumen}

TENDENCIA FISIOLOGICA:
${JSON.stringify(histFisioSemana)}

BLOQUE ACTUAL: ${JSON.stringify(cicloSummary)}

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"objetivo_semanal":"cual era el objetivo real de esta semana segun las sesiones","resultado":"conseguido|parcial|no_conseguido","fatiga":"baja|media|alta","recuperacion":"buena|regular|mala","adaptaciones_conseguidas":["adaptacion1","adaptacion2"],"pendiente":["pendiente1","pendiente2"]}
Basate SOLO en los datos reales de arriba, no inventes adaptaciones que no esten respaldadas por las sesiones.`;

    let summaryEstructurado: any = null;
    try {
      const summaryRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, messages: [{ role: "user", content: summaryPrompt }] }),
      });
      const summaryData = await summaryRes.json();
      const summaryTexto = summaryData.content?.map((b: any) => b.text || "").join("") || "{}";
      const summaryClean = summaryTexto.replace(/```json|```/g, "").trim();
      const summaryMatch = summaryClean.match(/\{[\s\S]*\}/);
      if (summaryMatch) summaryEstructurado = JSON.parse(summaryMatch[0]);
    } catch (e) { console.error("Error generando BLOCK_WEEK_SUMMARY:", e); }

    // FIX: sesiones NO completadas calculadas de forma DETERMINISTICA (no por el LLM), para que
    // el Coach/Strategy de la proxima semana sepa exactamente que se salto, no solo un resumen narrativo.
    const sesionesNoCompletadas = sesionesQueRequierenReporte
      .filter((s: any) => s.completada !== true)
      .map((s: any) => ({ dia: s.dia, tipo: s.tipo, titulo: s.titulo }));
    const adherenciaRealCalc = sesionesQueRequierenReporte.length > 0
      ? Math.round((sesionesQueRequierenReporte.filter((s: any) => s.completada === true).length / sesionesQueRequierenReporte.length) * 100)
      : 100;

    if (summaryEstructurado) {
      await supabase.from("block_week_summary").upsert({
        user_codigo: codigo,
        week_start: weekStartCierre,
        bloque: cicloSummary.bloque || null,
        semana_del_bloque: cicloSummary.semana || null,
        total_semanas_bloque: cicloSummary.totalSemanas || null,
        objetivo_semanal: summaryEstructurado.objetivo_semanal || null,
        resultado: summaryEstructurado.resultado || null,
        fatiga: summaryEstructurado.fatiga || null,
        recuperacion: summaryEstructurado.recuperacion || null,
        adaptaciones_conseguidas: summaryEstructurado.adaptaciones_conseguidas || [],
        pendiente: summaryEstructurado.pendiente || [],
        sesiones_no_completadas: sesionesNoCompletadas,
        adherencia_real: adherenciaRealCalc
      }, { onConflict: "user_codigo,week_start" });
      console.log("BLOCK WEEK SUMMARY generado:", JSON.stringify(summaryEstructurado), "sesiones_no_completadas:", JSON.stringify(sesionesNoCompletadas));
    }

    // FORGE BLOCK HISTORY — DETERMINISTICO, ya no depende de que el extractor LLM detecte "fin_bloque"
    // en conversacion (fallaba de forma silenciosa, dejando analisis_bloques desactualizado durante
    // semanas y confundiendo al Coach sobre en que fase/semana esta realmente el atleta). Se dispara
    // SIEMPRE al cerrar la ULTIMA semana de un bloque (semana === totalSemanas), usando el dato real
    // de ciclo_actual como unica fuente de verdad — nunca inferido de conversacion.
    if (cicloSummary.semana && cicloSummary.totalSemanas && cicloSummary.semana === cicloSummary.totalSemanas) {
      const { data: usuarioBlockHist } = await supabase.from("usuarios").select("analisis_bloques").eq("codigo", codigo).single();
      const analisisActualHist = usuarioBlockHist?.analisis_bloques || [];
      const yaRegistradoEsteBloque = analisisActualHist.some((a: any) => a.bloque_completado === cicloSummary.bloque && a.fecha === hoyCierreStr);
      if (!yaRegistradoEsteBloque) {
        const nuevoRegistroBloque = {
          bloque_completado: cicloSummary.bloque || "desconocido",
          fecha: hoyCierreStr,
          objetivo_bloque: cicloSummary.objetivo || "",
          resultado: adherenciaRealCalc >= 85 ? "cumplido" : "parcial",
          carga: summaryEstructurado?.fatiga === "alta" ? "alta" : summaryEstructurado?.fatiga === "baja" ? "baja" : "adecuada",
          siguiente_bloque: "pendiente de definir",
          adherencia_estimada: String(adherenciaRealCalc)
        };
        await supabase.from("usuarios").update({ analisis_bloques: [...analisisActualHist.slice(-5), nuevoRegistroBloque] }).eq("codigo", codigo);
        console.log("BLOCK HISTORY (deterministico): registrado cierre de bloque", JSON.stringify(nuevoRegistroBloque));
      }
    }

    // FORGE WEAKNESS EXPOSURE — entidad dedicada: cuanto se trabajo REALMENTE cada debilidad esta
    // semana (no solo si aparece en BLOCK_WEEK_SUMMARY). Deterministico, agrupado por debilidad real.
    // FIX: capturar tambien el METODO especifico usado cada vez (titulo de la sesion), para que Forge
    // pueda distinguir "trabajamos resistencia pectoral con EMOM push-ups" de "con bench volume" —
    // base real para poder decir en el futuro "ya probamos 3 metodos distintos sin mejora, cambiar enfoque".
    const exposicionPorDebilidad: Record<string, { sesiones: number; ultimaFecha: string | null; metodos: string[] }> = {};
    sesionesQueRequierenReporte.forEach((s: any) => {
      if (!s.debilidad_relacionada) return;
      if (!exposicionPorDebilidad[s.debilidad_relacionada]) {
        exposicionPorDebilidad[s.debilidad_relacionada] = { sesiones: 0, ultimaFecha: null, metodos: [] };
      }
      if (s.completada === true) {
        exposicionPorDebilidad[s.debilidad_relacionada].sesiones++;
        exposicionPorDebilidad[s.debilidad_relacionada].ultimaFecha = hoyCierreStr;
        if (s.titulo) exposicionPorDebilidad[s.debilidad_relacionada].metodos.push(s.titulo);
      }
    });
    // FIX: calcular response REAL comparando progreso actual vs progreso registrado la semana anterior
    // para esta misma debilidad. Distingue SATURACION (exposicion alta + progreso avanzando → bajar
    // prioridad temporal, va bien) de ESTANCAMIENTO (exposicion alta + progreso estancado → subir
    // prioridad y señalar cambio de metodo, no esta funcionando).
    const { data: desarrolloActualParaResponse } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const desarrolloActual = desarrolloActualParaResponse?.athlete_development || [];

    for (const [weaknessNombre, exposicion] of Object.entries(exposicionPorDebilidad)) {
      const debilidadActualObj = desarrolloActual.find((d: any) => d.nombre_visible === weaknessNombre);
      const progresoActual = debilidadActualObj?.progreso ?? null;

      const { data: exposicionSemanaAnterior } = await supabase.from("weakness_exposure").select("progreso_al_cierre").eq("user_codigo", codigo).eq("weakness_id", weaknessNombre).order("week_start", { ascending: false }).limit(1).single();
      const progresoAnterior = exposicionSemanaAnterior?.progreso_al_cierre ?? null;

      let responseCalculada = "sin_evaluar";
      if (progresoActual !== null && progresoAnterior !== null) {
        const delta = progresoActual - progresoAnterior;
        if (exposicion.sesiones >= 2 && delta <= 1) {
          responseCalculada = "estancamiento"; // exposicion alta, sin mejora real
        } else if (delta > 1) {
          responseCalculada = "respuesta_positiva"; // progreso avanzando con la exposicion actual
        } else {
          responseCalculada = "estable";
        }
      }

      await supabase.from("weakness_exposure").upsert({
        user_codigo: codigo,
        weakness_id: weaknessNombre,
        week_start: weekStartCierre,
        sessions_count: exposicion.sesiones,
        last_exposure_date: exposicion.ultimaFecha,
        response: responseCalculada,
        progreso_al_cierre: progresoActual,
        metodos_usados: exposicion.metodos
      }, { onConflict: "user_codigo,weakness_id,week_start" });
    }
    console.log("WEAKNESS EXPOSURE registrado:", JSON.stringify(exposicionPorDebilidad));

    // FORGE CELEBRATIONS ENGINE — hitos objetivos deterministas (constancia, recuperacion, volumen)
    const celebraciones = await detectarCelebraciones(supabase, codigo);
    for (const cel of celebraciones) {
      await supabase.from("forge_discoveries").insert({
        user_codigo: codigo,
        descubrimiento: `${cel.emoji} ${cel.mensaje}`,
        categoria: `celebracion_${cel.tipo}`,
        nivel: "celebracion",
        confianza: 100,
        puntos_evidencia: 0,
        visto: false,
        presentado_al_usuario: false
      });
    }

    // FORGE DISCOVERY ENGINE (v2) — se ejecuta tambien al cerrar cada semana, ademas de poder
    // dispararse de forma independiente via la accion "ejecutar_discovery_engine"
    await ejecutarDiscoveryEngine(supabase, apiKey!, codigo);

    // FORGE ATHLETE RESPONSE ENGINE — se ejecuta tambien al cerrar semana, buscando correlaciones
    // especificas de respuesta del atleta (no patrones generales como Discovery)
    await ejecutarAthleteResponseEngine(supabase, apiKey!, codigo);

    // FORGE CARDS — datos para ofrecer compartir la semana completada (solo si fue 100% adherencia)
    const sesionesCompletadasCierre = sesionesQueRequierenReporte.filter((s:any)=>s.completada).length;
    const cardSemanaData = sesionesCompletadasCierre === sesionesQueRequierenReporte.length
      ? { sesionesCompletadas: sesionesCompletadasCierre, sesionesTotales: sesionesQueRequierenReporte.length }
      : null;

    const adherenciaReal = sesionesQueRequierenReporte.length > 0 ? Math.round((sesionesCompletadasCierre / sesionesQueRequierenReporte.length) * 100) : 0;

    // FORGE WEEK CLOSURE LOG — registro final e IDEMPOTENTE. Es lo unico que check_week_closure
    // consulta para saber si ya se cerro esta semana.
    await supabase.from("week_closure_log").insert({ user_codigo: codigo, week_start: weekStartCierre });

    return NextResponse.json({ semanaCompleta: true, yaCerrada: false, weekStart: weekStartCierre, insightGenerado: true, cardSemanaData, adherenciaPorcentaje: adherenciaReal, sesionesCompletadas: sesionesCompletadasCierre, sesionesTotales: sesionesQueRequierenReporte.length });
  }

  if (action === "ejecutar_discovery_engine") {
    // Permite disparar el Discovery Engine de forma independiente (no solo al cierre de semana),
    // por ejemplo tras varios entrenos reportados, para que Forge sorprenda con mas frecuencia.
    const resultado = await ejecutarDiscoveryEngine(supabase, apiKey!, codigo);
    return NextResponse.json(resultado);
  }

  if (action === "ejecutar_athlete_response_engine") {
    const resultado = await ejecutarAthleteResponseEngine(supabase, apiKey!, codigo);
    return NextResponse.json(resultado);
  }

  if (action === "guardar_pending_action") {
    // FORGE PENDING ACTIONS — PUNTO DE CONVERGENCIA UNICO para cualquier modificacion de sesion,
    // sin importar si se detecto via tag [PROPONER_MODIFICACION:] del Coach o via el Safety Net
    // determinista. Hallazgo real critico: el flujo del tag escribia directamente aqui sin pasar
    // por el Modification Ledger (sin captura de prescripcion original, sin trigger classification,
    // sin session_modification_events) — una bifurcacion arquitectonica que dejaba una ruta de
    // modificacion sin ningun control determinista. Ahora AMBOS caminos convergen aqui.
    const { tipo, accion } = datos;

    // Expirar automaticamente cualquier pending anterior del mismo tipo/dia sin resolver
    await supabase.from("pending_actions").update({ estado: "expirado" }).eq("user_codigo", codigo).eq("tipo", tipo).eq("estado", "pendiente");

    let accionEnriquecida = accion;
    if (tipo === "modificar_sesion" && accion?.dia && accion?.week_start) {
      // Si la accion NO trae ya modification_event_pendiente (viene del flujo legacy del tag,
      // no del Safety Net), lo construimos aqui — capturando la prescripcion original ANTES de
      // que se pierda, exactamente igual que hace el Safety Net.
      if (!accion.modification_event_pendiente) {
        const normalizarDiaConvergencia = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const { data: planOriginalConvergencia } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", accion.week_start).single();
        const sesionOriginalConvergencia = planOriginalConvergencia?.sessions?.find((s: any) => normalizarDiaConvergencia(s.dia) === normalizarDiaConvergencia(accion.dia));

        accionEnriquecida = {
          ...accion,
          modification_event_pendiente: {
            trigger_type: "legacy_tag",
            reason_code: accion.motivo || null,
            affected_exercise: null,
            original_titulo: sesionOriginalConvergencia?.titulo || null,
            original_descripcion: sesionOriginalConvergencia?.descripcion || null,
            original_tipo: sesionOriginalConvergencia?.tipo || null,
          }
        };
        console.log("🔗 PENDING ACTIONS: modification_event construido para flujo legacy (tag), prescripcion original capturada");
      }
    }

    const { data: nuevaPending, error } = await supabase.from("pending_actions").insert({
      user_codigo: codigo, tipo, accion: accionEnriquecida, estado: "pendiente"
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, pendingId: nuevaPending.id });
  }

  if (action === "detectar_propuesta_sesion") {
    // FORGE PROPOSAL PARSER — Nivel 1 (deterministico) detecta SI hay propuesta. Si la hay,
    // Nivel 2 (extraccion ligera) saca los detalles estructurados de esa propuesta especifica.
    // El LLM nunca decide si guardar — solo el parser decide, el LLM solo ayuda a extraer datos.
    const { mensajeUsuario, respuestaCoach } = datos;
    const parsed = parseSessionProposal(respuestaCoach, mensajeUsuario);
    if (!parsed.detected || !parsed.dia) {
      return NextResponse.json({ ok: true, propuestaDetectada: false });
    }

    // Calcular week_start de la semana actual
    const hoyProp = new Date();
    const diaSemProp = hoyProp.getDay() || 7;
    const lunesProp = new Date(hoyProp);
    lunesProp.setDate(hoyProp.getDate() - diaSemProp + 1);
    const weekStartProp = lunesProp.toISOString().split('T')[0];

    const extractPrompt = `Extrae los detalles de esta propuesta de cambio de sesion de entrenamiento.
RESPUESTA DEL COACH: ${respuestaCoach}

Responde SOLO con este JSON: {"tipo":"tipo de sesion propuesta (ej: descanso, carrera, box)","titulo":"titulo breve de la sesion propuesta","descripcion":"descripcion completa de la sesion propuesta tal como la explico el coach, conciso"}`;

    try {
      const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: extractPrompt }] }),
      });
      const extractData = await extractRes.json();
      const extractTexto = extractData.content?.map((b: any) => b.text || "").join("") || "{}";
      const extractClean = extractTexto.replace(/```json|```/g, "").trim();
      const extractMatch = extractClean.match(/\{[\s\S]*\}/);
      if (!extractMatch) return NextResponse.json({ ok: true, propuestaDetectada: false });
      const detalles = JSON.parse(extractMatch[0]);

      const accionCompleta = { week_start: weekStartProp, dia: parsed.dia, tipo: detalles.tipo, titulo: detalles.titulo, descripcion: detalles.descripcion, motivo: parsed.motivo };
      await supabase.from("pending_actions").update({ estado: "expirado" }).eq("user_codigo", codigo).eq("tipo", "modificar_sesion").eq("estado", "pendiente");
      await supabase.from("pending_actions").insert({ user_codigo: codigo, tipo: "modificar_sesion", accion: accionCompleta, estado: "pendiente" });

      return NextResponse.json({ ok: true, propuestaDetectada: true });
    } catch {
      return NextResponse.json({ ok: true, propuestaDetectada: false });
    }
  }

  if (action === "confirmar_pending_action") {
    // Se dispara cuando el Intent Router (no el LLM) detecta que el usuario confirmo una propuesta.
    // Ejecuta la accion de forma deterministica, sin volver a pedirle nada al modelo.
    const { data: pendiente } = await supabase.from("pending_actions").select("*").eq("user_codigo", codigo).eq("estado", "pendiente").order("created_at", { ascending: false }).limit(1).single();
    if (!pendiente) return NextResponse.json({ ok: true, ejecutado: false, motivo: "no_hay_pending" });

    if (pendiente.tipo === "modificar_sesion") {
      const acc = pendiente.accion;
      const { data: planActualPending } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", acc.week_start).single();
      if (!planActualPending) return NextResponse.json({ ok: true, ejecutado: false, motivo: "plan_no_encontrado" });
      const normalizar = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const sessions = planActualPending.sessions.map((s: any) => {
        if (normalizar(s.dia) === normalizar(acc.dia)) {
          // FIX: siempre establecer "completada" explicitamente (nunca dejarlo undefined) para que el
          // calculo de cierre de semana funcione correctamente. No se marca automaticamente al confirmar
          // el cambio — se completa por reporte del usuario, igual que cualquier otra sesion.
          // FIX: por_que tambien debe actualizarse al modificar la sesion — antes quedaba con el valor
        // de la sesion original, mostrando una justificacion incoherente con el nuevo titulo/tipo.
        // FIX: debilidad_relacionada tambien debe limpiarse/actualizarse al modificar la sesion — antes
        // quedaba con el valor de la sesion original, mostrando "Trabaja: X" incoherente con el
        // nuevo contenido (una sesion de emergencia por molestia no necesariamente trabaja la misma
        // debilidad que la sesion planificada originalmente).
        // FIX: por_que ahora usa el campo semanticamente correcto (la justificacion tecnica de la
        // sesion), separado de motivo_modificacion (la causa del cambio) — antes se reutilizaba
        // el mismo texto para ambos, perdiendo la distincion conceptual entre "por que cambio" y
        // "por que esta sesion concreta".
        return { ...s, tipo: acc.tipo, titulo: acc.titulo, descripcion: acc.descripcion, por_que: acc.por_que || acc.motivo || s.por_que, debilidad_relacionada: acc.debilidad_relacionada ?? null, modificado: true, motivo_modificacion: acc.motivo || "", modificado_at: new Date().toISOString(), completada: s.completada ?? false };
        }
        return s;
      });
      await supabase.from("weekly_plan").update({ sessions }).eq("user_codigo", codigo).eq("week_start", acc.week_start);
      // NIVEL B — modificacion de sesion concreta, NO cuenta contra el limite de generaciones de semana,
      // pero queda auditada igual (confirmada explicitamente por el flujo de Pending Actions).
      await supabase.from("weekly_plan_events").insert({
        user_codigo: codigo,
        week_start: acc.week_start,
        nivel: "B_modificacion_sesion",
        accion: "modificar_sesion",
        motivo: acc.motivo || null,
        dia_afectado: acc.dia,
        confirmado_por_usuario: true
      });

      // FORGE MODIFICATION LEDGER — registro estructurado completo. reason_code determina
      // deterministicamente objective_impact/persistence, SIN depender de que el LLM decida esto.
      const evt = acc.modification_event_pendiente || {};
      const REASON_TO_PERSISTENCE: Record<string, { persistence: string; objective_impact: string }> = {
        rodilla_dolor: { persistence: "active_constraint", objective_impact: "partial" },
        lesion: { persistence: "active_constraint", objective_impact: "partial" },
        dolor: { persistence: "active_constraint", objective_impact: "partial" },
        molestia: { persistence: "active_constraint", objective_impact: "partial" },
        disponibilidad_viaje: { persistence: "session", objective_impact: "preserved" },
        material_no_disponible: { persistence: "session", objective_impact: "preserved" },
        fatiga_extrema: { persistence: "short_term", objective_impact: "partial" },
      };
      const reasonKey = (evt.reason_code || "").toLowerCase();
      const matchReason = Object.keys(REASON_TO_PERSISTENCE).find(k => reasonKey.includes(k));
      const config = matchReason ? REASON_TO_PERSISTENCE[matchReason] : { persistence: "session", objective_impact: "preserved" };

      await supabase.from("session_modification_events").insert({
        user_codigo: codigo,
        week_start: acc.week_start,
        dia: acc.dia,
        trigger_type: evt.trigger_type || "unknown",
        reason_code: evt.reason_code || null,
        original_titulo: evt.original_titulo || null,
        original_descripcion: evt.original_descripcion || null,
        original_tipo: evt.original_tipo || null,
        modified_titulo: acc.titulo || null,
        modified_descripcion: acc.descripcion || null,
        modified_tipo: acc.tipo || null,
        affected_exercise: evt.affected_exercise || null,
        objective_impact: config.objective_impact,
        persistence: config.persistence,
      });

      // Si la persistencia es active_constraint o permanent Y hay un ejercicio afectado concreto,
      // generar automaticamente una Coaching Note para que el planificador la respete en el futuro.
      // FORGE ATHLETE STATE ENGINE — cuando se confirma una restriccion dura persistente, el atleta
      // entra en estado RESTRICTED de forma determinista. Mientras este estado siga activo, el
      // sistema NO debe volver a reaccionar sesion-a-sesion al mismo problema — la restriccion ya
      // gobierna toda la planificacion futura hasta que se resuelva explicitamente.
      if (config.persistence === "active_constraint" || config.persistence === "permanent") {
        const { data: estadoActivoExistente } = await supabase.from("athlete_state_events").select("id,estado").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
        if (!estadoActivoExistente || estadoActivoExistente.estado === "normal") {
          if (estadoActivoExistente) {
            await supabase.from("athlete_state_events").update({ activo: false, fecha_fin: new Date().toISOString().split('T')[0] }).eq("id", estadoActivoExistente.id);
          }
          const descripcionHumana = evt.body_area
            ? `Molestia/restricción en ${evt.body_area}${evt.affected_exercise ? ` (especialmente con ${evt.affected_exercise})` : ''}. Forge evita cargas/movimientos que puedan agravarla mientras se evalúa tu evolución.`
            : evt.affected_exercise
            ? `Molestia/restricción reportada con ${evt.affected_exercise}. Evitar prescribir hasta revisión.`
            : null;
          await supabase.from("athlete_state_events").insert({
            user_codigo: codigo,
            estado: "restricted",
            motivo: evt.reason_code || "restriccion activa",
            body_area: evt.body_area || null,
            reason_description: descripcionHumana,
            activo: true
          });
          console.log("🔴 ATHLETE STATE ENGINE: atleta", codigo, "entra en estado RESTRICTED por", evt.reason_code);
        } else {
          console.log("🔴 ATHLETE STATE ENGINE: atleta", codigo, "ya estaba en estado", estadoActivoExistente.estado, "— no se duplica transicion");
        }
      }

      // FIX ARQUITECTONICO: usar body_area como identificador cuando no hay affected_exercise
      // especifico — antes "rodilla" sin ejercicio concreto nunca generaba constraint visible.
      const identificadorRestriccion = evt.affected_exercise || evt.body_area;
      if ((config.persistence === "active_constraint" || config.persistence === "permanent") && identificadorRestriccion) {
        const validUntilConstraint = config.persistence === "permanent" ? null : (() => {
          const fecha = new Date();
          fecha.setDate(fecha.getDate() + 21); // active_constraint expira en 3 semanas salvo revision
          return fecha.toISOString().split('T')[0];
        })();
        // FORGE CONSTRAINT ENGINE V2 — la restriccion se define por PROPIEDADES biomecanicas que
        // prohibe, no por una lista de palabras de ejercicios. body_area determina que propiedades
        // se activan, de forma determinista y extensible sin tocar listas de excepciones.
        const PERFIL_PROHIBICIONES_POR_ZONA: Record<string, { impact?: boolean; jump?: boolean; axial_load?: boolean; deep_flexion?: boolean; overhead_load?: boolean }> = {
          rodilla: { impact: true, jump: true, deep_flexion: true },
          hombro: { overhead_load: true },
          lumbar: { axial_load: true, deep_flexion: true },
          tobillo: { impact: true, jump: true },
          muñeca: { overhead_load: true },
        };
        const bodyAreaKey = (evt.body_area || "").toLowerCase();
        const prohibiciones = PERFIL_PROHIBICIONES_POR_ZONA[bodyAreaKey] || {};

        await supabase.from("athlete_coaching_notes").insert({
          user_codigo: codigo,
          type: "weakness",
          domain: null,
          movement: identificadorRestriccion,
          issue: evt.que_evitar || `Molestia/restricción relacionada con ${identificadorRestriccion} (motivo: ${evt.reason_code}). Evitar prescribir hasta revisión.`,
          priority: "alta",
          source: "modification_ledger",
          status: "pending",
          confidence: 0.7,
          constraint_level: "hard",
          valid_until: validUntilConstraint,
          prohibits_impact: prohibiciones.impact || false,
          prohibits_jump: prohibiciones.jump || false,
          prohibits_axial_load: prohibiciones.axial_load || false,
          prohibits_deep_flexion: prohibiciones.deep_flexion || false,
          prohibits_overhead_load: prohibiciones.overhead_load || false,
        });
        console.log("🛡️ MODIFICATION LEDGER: HARD CONSTRAINT creada para", identificadorRestriccion, "valida hasta", validUntilConstraint || "sin caducidad (permanente)");
      }
    }

    await supabase.from("pending_actions").update({ estado: "ejecutado", resuelto_at: new Date().toISOString() }).eq("id", pendiente.id);
    return NextResponse.json({ ok: true, ejecutado: true, tipo: pendiente.tipo });
  }

  if (action === "obtener_pending_action_activo") {
    // Solo lectura — permite al frontend restaurar el banner de confirmacion tras recargar la
    // pagina, sin ejecutar ni modificar nada. Nunca resuelve el pending, solo informa si existe.
    const { data: pendienteActivo } = await supabase.from("pending_actions").select("id,tipo,accion").eq("user_codigo", codigo).eq("estado", "pendiente").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!pendienteActivo || pendienteActivo.tipo !== "modificar_sesion") {
      return NextResponse.json({ hayPending: false });
    }
    return NextResponse.json({ hayPending: true, dia: pendienteActivo.accion?.dia, titulo: pendienteActivo.accion?.titulo, motivo: pendienteActivo.accion?.motivo });
  }

  if (action === "rechazar_pending_action") {
    // El usuario decide explicitamente NO aplicar el cambio propuesto — marcamos como rechazado
    // (nunca eliminamos el registro, queda auditado) y el plan original permanece INTACTO.
    // GUARD EXPLICITO: rechazar una propuesta de modificacion NUNCA debe coincidir con marcar la
    // sesion original como completada — son dos eventos independientes que no deben confundirse.
    const { data: pendienteRechazo } = await supabase.from("pending_actions").select("id,accion").eq("user_codigo", codigo).eq("estado", "pendiente").order("created_at", { ascending: false }).limit(1).single();
    if (!pendienteRechazo) return NextResponse.json({ ok: true, rechazado: false, motivo: "no_hay_pending" });

    await supabase.from("pending_actions").update({ estado: "rechazado", resuelto_at: new Date().toISOString() }).eq("id", pendienteRechazo.id);

    // Verificacion explicita: confirmar que la sesion del dia afectado NO quedo marcada completada
    // incorrectamente en la misma ventana temporal (defensa en profundidad tras el bug real de hoy).
    const diaAfectadoRechazo = pendienteRechazo.accion?.dia;
    const weekStartRechazo = pendienteRechazo.accion?.week_start;
    if (diaAfectadoRechazo && weekStartRechazo) {
      const normalizarDiaRechazo = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const { data: planRechazo } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartRechazo).single();
      const sesionRechazo = planRechazo?.sessions?.find((s: any) => normalizarDiaRechazo(s.dia) === normalizarDiaRechazo(diaAfectadoRechazo));
      console.log(`🛡️ GUARD rechazar_pending_action: sesion ${diaAfectadoRechazo} tras rechazo — completada=${sesionRechazo?.completada}`);
    }

    return NextResponse.json({ ok: true, rechazado: true });
  }

  if (action === "cambiar_modo_entrada") {
    // FORGE MODE TRANSITION — accion determinista, unica autorizada para cambiar modo_entrada tras
    // el registro inicial. El LLM detecta intencion y puede sugerir el cambio, pero NUNCA lo ejecuta
    // directamente — requiere esta llamada explicita, disparada solo tras confirmacion real del usuario.
    const { nuevoModo } = datos;
    const MODOS_VALIDOS = ["planificacion", "supervision", "consulta"];
    if (!MODOS_VALIDOS.includes(nuevoModo)) {
      return NextResponse.json({ error: "Modo invalido" }, { status: 400 });
    }
    await supabase.from("usuarios").update({ modo_entrada: nuevoModo }).eq("codigo", codigo);
    console.log(`MODO ENTRADA cambiado a "${nuevoModo}" para usuario ${codigo}`);
    return NextResponse.json({ ok: true, nuevoModo });
  }

  if (action === "extraer_metricas_imagen") {
    // FORGE VISION EXTRACTION PIPELINE — el modelo EXTRAE datos de la imagen con nivel de confianza,
    // NUNCA decide guardarlos. Solo el backend, tras validar la confianza, persiste o pide confirmacion.
    // Mismo principio de autoridad que Sleep Metrics Parser, PR Detection y Pending Actions — el LLM
    // interpreta y razona, el backend decide y ejecuta.
    const { imagenBase64, tipoImagen } = datos;
    if (!imagenBase64) return NextResponse.json({ error: "Falta imagen" }, { status: 400 });

    const visionPrompt = `Analiza esta captura de pantalla de una app de fitness/wearable (Garmin, Apple Health, Whoop, etc).
Extrae SOLO los datos fisiologicos de sueño/recuperacion que veas CLARAMENTE visibles, con un nivel de confianza real para cada uno.

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"hrv":numero_o_null,"hrv_confianza":0.0_a_1.0,"sueno":numero_puntuacion_0_a_100_o_null,"sueno_confianza":0.0_a_1.0,"rhr":numero_o_null,"rhr_confianza":0.0_a_1.0,"duracion_horas":numero_decimal_o_null,"duracion_confianza":0.0_a_1.0}

Si un dato no es visible o no estas seguro, pon el valor en null y confianza 0. NUNCA inventes un numero que no veas claramente en la imagen.`;

    try {
      const visionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: tipoImagen || "image/jpeg", data: imagenBase64 } },
            { type: "text", text: visionPrompt }
          ]}]
        }),
      });
      const visionData = await visionRes.json();
      const visionTexto = visionData.content?.map((b: any) => b.text || "").join("") || "{}";
      const visionClean = visionTexto.replace(/```json|```/g, "").trim();
      const visionMatch = visionClean.match(/\{[\s\S]*\}/);
      if (!visionMatch) return NextResponse.json({ ok: true, extraido: false });

      const extraido = JSON.parse(visionMatch[0]);

      // FORGE CONFIDENCE GATE — umbral determinista: solo se guarda automaticamente si la confianza
      // es alta (>=0.85). Por debajo, se devuelve para confirmacion explicita del usuario, nunca se
      // guarda ni se descarta silenciosamente.
      const UMBRAL_CONFIANZA = 0.85;
      const camposAltaCorfianza: any = {};
      const camposBajaConfianza: any = {};

      if (extraido.hrv !== null && extraido.hrv_confianza >= UMBRAL_CONFIANZA) camposAltaCorfianza.hrv = extraido.hrv;
      else if (extraido.hrv !== null) camposBajaConfianza.hrv = extraido.hrv;

      if (extraido.sueno !== null && extraido.sueno_confianza >= UMBRAL_CONFIANZA) camposAltaCorfianza.sueno = extraido.sueno;
      else if (extraido.sueno !== null) camposBajaConfianza.sueno = extraido.sueno;

      if (extraido.rhr !== null && extraido.rhr_confianza >= UMBRAL_CONFIANZA) camposAltaCorfianza.rhr = extraido.rhr;
      else if (extraido.rhr !== null) camposBajaConfianza.rhr = extraido.rhr;

      // Auto-guardar SOLO los campos de alta confianza
      if (Object.keys(camposAltaCorfianza).length > 0) {
        const hoyImagen = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
        await supabase.from("physiology_records").upsert({
          user_codigo: codigo,
          fecha: hoyImagen,
          ...camposAltaCorfianza,
          source: "vision_extractor",
          updated_at: new Date().toISOString()
        }, { onConflict: "user_codigo,fecha" });

        const { data: usuarioVision } = await supabase.from("usuarios").select("estado_fisiologico").eq("codigo", codigo).single();
        await supabase.from("usuarios").update({
          estado_fisiologico: { ...(usuarioVision?.estado_fisiologico || {}), ...camposAltaCorfianza }
        }).eq("codigo", codigo);
      }

      return NextResponse.json({
        ok: true,
        extraido: true,
        guardadoAutomatico: camposAltaCorfianza,
        pendienteConfirmacion: camposBajaConfianza,
        duracionHoras: extraido.duracion_horas
      });
    } catch (err: any) {
      console.error("Error en extraccion visual:", err);
      return NextResponse.json({ ok: true, extraido: false });
    }
  }

  if (action === "detectar_coaching_note") {
    // FORGE COACHING NOTES PIPELINE — el LLM (Haiku) EXTRAE y ESTRUCTURA una observacion tecnica
    // o debilidad mencionada en conversacion, pero NUNCA decide si se guarda: si detecta contenido
    // valido, el backend SIEMPRE lo persiste. La decision de si esa nota se convierte en programacion
    // real corresponde exclusivamente a Weekly Strategy en el cierre de semana, nunca a esta capa.
    const { mensaje } = datos;
    if (!mensaje || mensaje.trim().length < 15) return NextResponse.json({ ok: true, detectado: false });

    const notePrompt = `Analiza este mensaje de un atleta a su coach. Determina si contiene una OBSERVACION TECNICA, DEBILIDAD, o ALGO A TRABAJAR (ej: un problema tecnico recurrente, una limitacion, una intencion de mejora) — NO una simple pregunta, ni un reporte de entreno completado sin mas, ni charla casual.

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"es_observacion":true_o_false,"type":"weakness|intencion|injury","domain":"olympic_lifting|running|strength|conditioning|mobility|otro","movement":"identificador CONSISTENTE del area/articulacion/musculo afectado (ej: rodilla, hombro, lumbar), o del movimiento tecnico si es una debilidad de ejecucion (ej: snatch), o null","issue":"resumen breve y factual del problema/objetivo en pocas palabras","priority":"alta|normal|baja"}

Mensaje: "${mensaje}"

"es_observacion" debe ser false para preguntas simples, reportes de entreno sin problema mencionado, o mensajes sin contenido tecnico relevante. Nunca inventes datos que el mensaje no contenga.

CRITICO sobre "movement": si el mensaje reporta DOLOR/MOLESTIA FISICA (type="injury"), "movement" DEBE ser la zona corporal afectada en su forma mas simple y consistente (ej: "rodilla", NO "rodilla derecha cara interior", NO "box exercises", NO el ejercicio que se estaba haciendo cuando aparecio). Esto es esencial porque el sistema deduplica menciones repetidas del MISMO problema comparando este campo — usa siempre la misma palabra simple para la misma zona corporal, sin importar en que sesion o contexto se menciono.`;

    try {
      const noteRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 250, messages: [{ role: "user", content: notePrompt }] }),
      });
      const noteData = await noteRes.json();
      const noteTexto = noteData.content?.map((b: any) => b.text || "").join("") || "{}";
      const noteClean = noteTexto.replace(/```json|```/g, "").trim();
      const noteMatch = noteClean.match(/\{[\s\S]*\}/);
      if (!noteMatch) return NextResponse.json({ ok: true, detectado: false });

      const extraido = JSON.parse(noteMatch[0]);
      if (!extraido.es_observacion || !extraido.issue) {
        return NextResponse.json({ ok: true, detectado: false });
      }

      // FORGE DEDUPLICATION: buscar si ya existe una nota similar activa (mismo movimiento/dominio)
      // para incrementar veces_mencionado en vez de crear duplicados — permite detectar patrones
      // recurrentes reales en vez de fragmentar la misma debilidad en multiples filas.
      const { data: notaExistente } = await supabase.from("athlete_coaching_notes")
        .select("id,veces_mencionado,confidence")
        .eq("user_codigo", codigo)
        .eq("movement", extraido.movement || null)
        .in("status", ["pending", "considerada"])
        .limit(1)
        .maybeSingle();

      if (notaExistente) {
        const nuevaConfianza = Math.min(1, (notaExistente.confidence || 0.5) + 0.15);
        await supabase.from("athlete_coaching_notes").update({
          veces_mencionado: (notaExistente.veces_mencionado || 1) + 1,
          confidence: nuevaConfianza,
          last_mentioned_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", notaExistente.id);
        return NextResponse.json({ ok: true, detectado: true, actualizado: true, issue: extraido.issue });
      }

      await supabase.from("athlete_coaching_notes").insert({
        user_codigo: codigo,
        type: extraido.type || "weakness",
        domain: extraido.domain || null,
        movement: extraido.movement || null,
        issue: extraido.issue,
        priority: extraido.priority || "normal",
        source: "conversation",
        status: "pending",
        confidence: 0.5
      });

      return NextResponse.json({ ok: true, detectado: true, actualizado: false, issue: extraido.issue });
    } catch (err: any) {
      console.error("Error detectando coaching note:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  if (action === "extraer_sesion_imagen") {
    // FORGE SESSION VISION EXTRACTION — mismo principio de autoridad: Vision EXTRAE los datos de la
    // sesion (nunca decide registrarla). Genera el MISMO formato de objeto que ya usa sesionPendiente
    // (tipo/fecha/notas/sensacion/analisis), asi el banner "Sesion detectada" y todo el pipeline
    // posterior (Registrar, Session Duplication Validator, etc.) funcionan sin modificacion.
    // Elimina la dependencia de que el Coach conversacional recuerde generar [SESION:] al ver una imagen.
    const { imagenBase64, tipoImagen } = datos;
    if (!imagenBase64) return NextResponse.json({ error: "Falta imagen" }, { status: 400 });

    const hoySesionImg = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    const sessionVisionPrompt = `Analiza esta captura de pantalla de un entrenamiento completado (WOD, carrera, sesion de fuerza, app de reloj deportivo, etc).

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"es_entreno_completado":true_o_false,"confianza":0.0_a_1.0,"tipo":"tipo de sesion (ej: box, carrera, fuerza)","notas":"resumen breve y factual de lo que ves: ejercicios, tiempos, distancias, pesos, rondas — SOLO lo que aparece literalmente en la imagen","sensacion":"buena|normal|mala|null si no se puede determinar"}

"es_entreno_completado" debe ser false si la imagen NO muestra claramente un entrenamiento ya realizado (ej: es solo una pantalla de planificacion futura, o no es una imagen de fitness en absoluto). Nunca inventes datos que no veas en la imagen.`;

    try {
      const sessionVisionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: tipoImagen || "image/jpeg", data: imagenBase64 } },
            { type: "text", text: sessionVisionPrompt }
          ]}]
        }),
      });
      const sessionVisionData = await sessionVisionRes.json();
      const sessionVisionTexto = sessionVisionData.content?.map((b: any) => b.text || "").join("") || "{}";
      const sessionVisionClean = sessionVisionTexto.replace(/```json|```/g, "").trim();
      const sessionVisionMatch = sessionVisionClean.match(/\{[\s\S]*\}/);
      if (!sessionVisionMatch) return NextResponse.json({ ok: true, esEntreno: false });

      const extraidoSesion = JSON.parse(sessionVisionMatch[0]);

      // FORGE CONFIDENCE GATE: solo se ofrece el banner si el modelo esta razonablemente seguro
      // de que ES un entreno completado real, evitando falsos positivos con capturas ambiguas.
      if (!extraidoSesion.es_entreno_completado || extraidoSesion.confianza < 0.7) {
        return NextResponse.json({ ok: true, esEntreno: false });
      }

      // Mismo formato exacto que espera el frontend para sesionPendiente
      const sesionExtraida = {
        tipo: extraidoSesion.tipo || "entreno",
        fecha: new Date().toISOString(),
        notas: extraidoSesion.notas || "",
        sensacion: extraidoSesion.sensacion || null,
        analisis: "Extraido automaticamente de imagen",
        origen: "vision_extractor"
      };

      return NextResponse.json({ ok: true, esEntreno: true, sesion: sesionExtraida });
    } catch (err: any) {
      console.error("Error en extraccion visual de sesion:", err);
      return NextResponse.json({ ok: true, esEntreno: false });
    }
  }

  if (action === "verificar_modificacion_sesion_deterministico") {
    // FORGE MODIFICATION SAFETY NET v2 — REDISEÑO ARQUITECTONICO tras hallazgo real: el detector v1
    // inferia "intencion de modificar" a partir del lenguaje libre de la respuesta del Coach, lo cual
    // es inherentemente fragil — confirmado con evidencia real: un comentario de FEEDBACK sobre una
    // sesion ya completada ("me parecio facil, subi las repes") disparo una modificacion de la sesion
    // del dia siguiente, violando la regla "una conversacion nunca modifica el plan por si sola".
    //
    // NUEVO MODELO: una conversacion NUNCA puede crear una modificacion por si sola. Primero debe
    // existir un TRIGGER AUTORIZADO en el MENSAJE DEL USUARIO (no en la respuesta del Coach) — un
    // conjunto CERRADO de causas operativas reales. Feedback de rendimiento NUNCA es trigger valido;
    // eso es Coaching Notes / evidencia para el cierre de semana, nunca modificacion inmediata.
    const { respuestaCoach, mensajeUsuario, weekStartActual } = datos;
    if (!respuestaCoach || !mensajeUsuario || respuestaCoach.includes("[PROPONER_MODIFICACION:")) {
      return NextResponse.json({ ok: true, detectado: false, yaViaTagNormal: !!respuestaCoach?.includes("[PROPONER_MODIFICACION:") });
    }

    // PASO 1 — clasificar el TRIGGER del mensaje del usuario contra una lista CERRADA. Ningun
    // trigger fuera de esta lista puede abrir una modificacion, sin importar lo que diga el Coach despues.
    const triggerPrompt = `Clasifica el TRIGGER (causa) de este mensaje de un atleta a su coach de entrenamiento. Responde SOLO con JSON, sin texto adicional ni markdown.

TRIGGERS AUTORIZADOS (causas operativas reales que pueden justificar cambiar una sesion futura):
- injury: lesion o molestia fisica real (dolor, chasquido, inflamacion)
- fatigue_severe: fatiga o falta de sueño EXTREMA explicitamente mencionada (ej: "he dormido 3 horas", "estoy agotado y no puedo mas"), no cansancio normal de entrenar
- availability: cambio de disponibilidad, no puede entrenar cuando estaba previsto
- equipment: falta de material o acceso al lugar de entrenamiento habitual
- user_request: el atleta PIDE EXPLICITAMENTE cambiar una sesion futura ("¿podemos cambiar mañana?", "quiero hacer otra cosa mañana")

NO SON TRIGGERS AUTORIZADOS (nunca deben abrir una modificacion, aunque el Coach reaccione a ellos):
- performance_feedback: comentarios sobre como fue una sesion YA COMPLETADA (facil, dificil, subio repeticiones, bajo peso, sensaciones) — esto es evidencia de rendimiento, no una causa operativa
- coaching_note: observaciones tecnicas, debilidades, dudas
- none: pregunta general, saludo, o cualquier otra cosa sin relacion

Mensaje del atleta: "${mensajeUsuario}"

Responde con este formato exacto:
{"trigger":"injury|fatigue_severe|availability|equipment|user_request|performance_feedback|coaching_note|none","confidence":0.0-1.0}`;

    let triggerAutorizado = false;
    try {
      const triggerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 100, messages: [{ role: "user", content: triggerPrompt }] }),
      });
      const triggerData = await triggerRes.json();
      const triggerTexto = triggerData.content?.map((b: any) => b.text || "").join("") || "{}";
      const triggerClean = triggerTexto.replace(/```json|```/g, "").trim();
      const triggerMatch = triggerClean.match(/\{[\s\S]*\}/);
      if (triggerMatch) {
        const triggerExtraido = JSON.parse(triggerMatch[0]);
        const TRIGGERS_AUTORIZADOS = ["injury", "fatigue_severe", "availability", "equipment", "user_request"];
        triggerAutorizado = TRIGGERS_AUTORIZADOS.includes(triggerExtraido.trigger) && (triggerExtraido.confidence ?? 0) >= 0.6;
        console.log("🛡️ SAFETY NET v2: trigger clasificado =", triggerExtraido.trigger, "confidence =", triggerExtraido.confidence, "autorizado =", triggerAutorizado);
      }
    } catch (err) {
      console.error("Error clasificando trigger:", err);
    }

    // GUARD PRINCIPAL: sin trigger autorizado, NUNCA se procede a construir ninguna modificacion,
    // sin importar lo que diga la respuesta del Coach. Esto es lo que elimina de raiz el bug real.
    if (!triggerAutorizado) {
      return NextResponse.json({ ok: true, detectado: false, motivo: "sin_trigger_autorizado" });
    }

    // PASO 2 — extraer SOLO la intencion/motivo de la propuesta (no el contenido tecnico detallado,
    // que ahora se genera aparte con un Session Builder real, igual que hace el Orchestrator).
    const intencionPrompt = `Analiza esta respuesta de un coach de entrenamiento a su atleta. El atleta ya reporto una causa operativa real que justifica revisar una sesion futura. Extrae la INTENCION de la modificacion (que dia, que tipo de sesion nueva, por que).

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"anuncia_modificacion":true_o_false,"dia":"hoy|mañana|nombre del dia en minusculas sin tildes, o null","tipo_nuevo":"tipo de sesion nueva propuesta (ej: movilidad, tren_superior, descanso, carrera_suave) o null","titulo_breve":"titulo breve de la nueva sesion o null","reason_code":"codigo breve de la causa real en snake_case (ej: rodilla_dolor, disponibilidad_viaje, material_no_disponible) o null","body_area":"zona corporal afectada en su forma mas simple, SOLO si la causa es una molestia/lesion fisica (ej: rodilla, hombro, lumbar), o null si no aplica","affected_exercise":"nombre del ejercicio/movimiento ESPECIFICO que causo el problema, SOLO si el atleta lo menciono explicitamente (ej: snatch_balance), o null","que_evitar":"lista breve y ESPECIFICA de tipos de movimiento/carga a evitar mientras la restriccion este activa (ej: 'carrera, saltos, sentadillas con peso' para una molestia de rodilla), distinta de la explicacion general, o null si no hay suficiente informacion para ser especifico"}

Respuesta del coach: "${respuestaCoach}"

IMPORTANTE sobre "dia": si el coach esta claramente adaptando la sesion de HOY (respondiendo a un problema actual del atleta, sin mencionar explicitamente otro dia como "mañana" o el nombre de un dia futuro), asume "dia":"hoy" por defecto — NO devuelvas null solo porque el coach no repitio la palabra "hoy" literalmente en su respuesta. Solo usa un dia distinto a "hoy" si el coach lo menciona explicitamente (ej: "mañana", "el sábado").`;

    try {
      const intencionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: intencionPrompt }] }),
      });
      const intencionData = await intencionRes.json();
      const intencionTexto = intencionData.content?.map((b: any) => b.text || "").join("") || "{}";
      const intencionClean = intencionTexto.replace(/```json|```/g, "").trim();
      const intencionMatch = intencionClean.match(/\{[\s\S]*\}/);
      if (!intencionMatch) return NextResponse.json({ ok: true, detectado: false });

      const intencion = JSON.parse(intencionMatch[0]);
      if (!intencion.anuncia_modificacion || !intencion.dia) {
        return NextResponse.json({ ok: true, detectado: false });
      }

      const estadoParaDetector = await generarEstadoCanonico(supabase, codigo);
      const diaRealDetectado = intencion.dia === "hoy" ? estadoParaDetector.dia_semana_hoy
        : intencion.dia === "mañana" || intencion.dia === "manana" ? estadoParaDetector.dia_semana_manana
        : intencion.dia;

      // FIX CRITICO: si el dia detectado es "lunes" y HOY no es lunes (ej: hoy domingo), ese lunes
      // pertenece a la SEMANA SIGUIENTE, no a la semana actual — mismo tipo de bug de limites de
      // semana ya corregido para "mañana" en generarEstadoCanonico, aqui replicado para el calculo
      // de week_start del Modification Ledger. Bug real confirmado: creaba pending_actions para el
      // lunes de la semana que se estaba cerrando, en vez de la semana nueva aun sin generar.
      const weekStartDetector = weekStartActual || (() => {
        const hoyDet = new Date();
        const diaSemDet = hoyDet.getDay() || 7;
        const lunesDet = new Date(hoyDet);
        lunesDet.setDate(hoyDet.getDate() - diaSemDet + 1);
        if (diaRealDetectado === "lunes" && diaSemDet !== 1) {
          lunesDet.setDate(lunesDet.getDate() + 7);
        }
        return lunesDet.toISOString().split('T')[0];
      })();

      // FORGE MODIFICATION LEDGER — capturar la PRESCRIPCION ORIGINAL antes de modificar nada.
      // Esto resuelve el hallazgo real de que no podiamos recuperar el contenido original tras
      // una modificacion incorrecta — ahora siempre queda un registro inmutable del "antes".
      const normalizarDiaLedger = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const { data: planOriginalLedger } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartDetector).maybeSingle();
      const sesionOriginal = planOriginalLedger?.sessions?.find((s: any) => normalizarDiaLedger(s.dia) === normalizarDiaLedger(diaRealDetectado));

      // GUARD: si no existe una sesion real que modificar (ej: la semana nueva aun no se ha
      // generado), no tiene sentido crear un pending_action — no hay nada que confirmar todavia.
      // Correcto por diseño: evita banners de "cambio de sesion" sobre dias que no existen aun.
      if (!sesionOriginal) {
        console.log(`🛡️ SAFETY NET: no existe sesion real para ${diaRealDetectado} en week_start=${weekStartDetector} — no se crea pending_action`);
        return NextResponse.json({ ok: true, detectado: false, motivo: "sesion_no_existe_aun" });
      }

      // PASO 3 — generar la sesion nueva con un SESSION BUILDER real (misma calidad que el
      // Orchestrator), no un resumen extraido de la conversacion. Esto corrige el hallazgo de que
      // las sesiones modificadas quedaban como "resumen" en vez de prescripcion tecnica completa.
      const { data: usuarioParaBuilder } = await supabase.from("usuarios").select("categoria,especialidad").eq("codigo", codigo).single();
      const builderPrompt = `Eres el Session Builder de Forge. Genera una sesion de entrenamiento COMPLETA y tecnica (con series, repeticiones, pesos/intensidad cuando aplique, tiempos), estructurada en Calentamiento/Bloque principal/Vuelta a la calma.

CONTEXTO:
Disciplina del atleta: ${usuarioParaBuilder?.especialidad || usuarioParaBuilder?.categoria || "general"}
Tipo de sesion requerido: ${intencion.tipo_nuevo || "adaptada"}
Motivo del cambio: ${intencion.reason_code || "no especificado"}
${intencion.affected_exercise ? `Ejercicio a EVITAR (causo el problema): ${intencion.affected_exercise}` : ""}
Sesion original que se sustituye: ${sesionOriginal?.titulo || "no disponible"} — ${(sesionOriginal?.descripcion || "").substring(0, 200)}

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"titulo":"titulo breve de la sesion","calentamiento":"contenido tecnico completo del calentamiento","bloque_principal":"contenido tecnico completo con series/reps/pesos o intensidad","vuelta_calma":"contenido tecnico completo de vuelta a la calma","por_que":"una frase tecnica explicando por que esta sesion concreta tiene sentido ahora"}`;

      const builderRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 900, messages: [{ role: "user", content: builderPrompt }] }),
      });
      const builderData = await builderRes.json();
      const builderTexto = builderData.content?.map((b: any) => b.text || "").join("") || "{}";
      const builderClean = builderTexto.replace(/```json|```/g, "").trim();
      const builderMatch = builderClean.match(/\{[\s\S]*\}/);
      const sesionConstruida = builderMatch ? JSON.parse(builderMatch[0]) : null;

      const descripcionEstructurada = sesionConstruida ? [
        sesionConstruida.calentamiento ? `**Calentamiento**\n${sesionConstruida.calentamiento}` : "",
        sesionConstruida.bloque_principal ? `**Bloque principal**\n${sesionConstruida.bloque_principal}` : "",
        sesionConstruida.vuelta_calma ? `**Vuelta a la calma**\n${sesionConstruida.vuelta_calma}` : ""
      ].filter(Boolean).join("\n\n") : "";

      // Expirar pending anteriores sin resolver para el mismo dia (fix ya existente, se mantiene)
      const { data: pendingsAnteriores } = await supabase.from("pending_actions").select("id").eq("user_codigo", codigo).eq("estado", "pendiente").eq("accion->>dia", diaRealDetectado);
      if (pendingsAnteriores && pendingsAnteriores.length > 0) {
        await supabase.from("pending_actions").update({ estado: "expirado" }).in("id", pendingsAnteriores.map((p: any) => p.id));
      }

      const { data: nuevaPendingDet, error: errorPendingDet } = await supabase.from("pending_actions").insert({
        user_codigo: codigo,
        tipo: "modificar_sesion",
        accion: {
          week_start: weekStartDetector,
          dia: diaRealDetectado,
          tipo: intencion.tipo_nuevo || "modificado",
          titulo: sesionConstruida?.titulo || intencion.titulo_breve || "Sesión modificada",
          motivo: intencion.reason_code || "Modificación detectada automáticamente",
          por_que: sesionConstruida?.por_que || "",
          descripcion: descripcionEstructurada || "Sesión adaptada — consulta con tu Coach los detalles.",
          debilidad_relacionada: null,
          // Referencia al evento del ledger, para que confirmar_pending_action pueda completarlo
          modification_event_pendiente: {
            trigger_type: intencion.reason_code ? "authorized" : "unknown",
            reason_code: intencion.reason_code || null,
            body_area: intencion.body_area || null,
            affected_exercise: intencion.affected_exercise || null,
            que_evitar: intencion.que_evitar || null,
            original_titulo: sesionOriginal?.titulo || null,
            original_descripcion: sesionOriginal?.descripcion || null,
            original_tipo: sesionOriginal?.tipo || null,
          }
        },
        estado: "pendiente"
      }).select().single();

      if (errorPendingDet) return NextResponse.json({ error: errorPendingDet.message }, { status: 500 });
      console.log("🛡️ SAFETY NET: modificacion detectada, sesion construida por Session Builder real, pending_action creado:", JSON.stringify(intencion));
      return NextResponse.json({ ok: true, detectado: true, pendingId: nuevaPendingDet.id, dia: diaRealDetectado, titulo: sesionConstruida?.titulo || intencion.titulo_breve, motivo: intencion.reason_code });
    } catch (err: any) {
      console.error("Error en verificar_modificacion_sesion_deterministico:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  if (action === "verificar_sesion_completada_deterministico") {
    // FORGE SESSION COMPLETION SAFETY NET — mismo patron robusto que ya usamos para modificaciones,
    // PRs, sueno y coaching notes. NUNCA depende de que el LLM genere el tag [SESION:] en su
    // respuesta conversacional — analiza el MENSAJE DEL USUARIO directamente con Haiku dedicado,
    // detecta si esta reportando un entreno completado, y guarda el registro sin importar si el
    // Coach genero o no el tag correspondiente en su respuesta.
    const { mensaje } = datos;
    if (!mensaje || mensaje.trim().length < 10) return NextResponse.json({ ok: true, detectado: false });

    // Filtro rapido: evitar llamar a Haiku para mensajes que claramente no son reportes de entreno
    // (ej: solo metricas de sueno nocturno, que ya tiene su propio parser dedicado)
    const pareceSoloSueno = /métricas de sueño|dormí|puntuación de sueño|durante la noche|sueño profundo|sueño rem/i.test(mensaje.toLowerCase()) && !/entren|wod|sesion realizada|serie|repeticion|corri|entrené|hice|complet/i.test(mensaje.toLowerCase());
    if (pareceSoloSueno) return NextResponse.json({ ok: true, detectado: false });

    // 🚨 FIX CRITICO: FILTRO DETERMINISTICO DE NEGACION — bug real confirmado: el mensaje "Hoy no
    // he completado ninguna sesión de entreno" fue mal interpretado por el LLM como reporte
    // POSITIVO de entreno completado, marcando erroneamente completada=true. Este filtro regex
    // detecta negacion explicita ANTES de llamar a Haiku, sin depender de que el modelo entienda
    // correctamente la negacion — mas rapido, mas barato, y elimina el riesgo de raiz.
    const contieneNegacionExplicita = /\bno\s+(he|hice|complet|realiz|termin|acab|entren)/i.test(mensaje) ||
      /\b(ninguna|nada de|sin hacer|no realizado|no completado)\b.*(sesion|entreno|entrenamiento)/i.test(mensaje) ||
      /(sesion|entreno|entrenamiento).*\bno\b.*(complet|realiz|hice|hecho)/i.test(mensaje);
    if (contieneNegacionExplicita) {
      console.log("🛡️ SESSION SAFETY NET: negacion explicita detectada, NO se marca como completado:", mensaje.substring(0, 100));
      return NextResponse.json({ ok: true, detectado: false, motivo: "negacion_detectada" });
    }

    const sesionPrompt = `Analiza este mensaje de un atleta a su coach de entrenamiento. Determina si el atleta esta reportando que ACABA DE COMPLETAR un entrenamiento (no una pregunta sobre entrenos futuros, no una peticion de plan, no solo metricas de sueno).

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"es_reporte_entreno":true_o_false,"tipo":"tipo de sesion (ej: carrera, box, fuerza)","notas":"resumen factual breve de lo que reporta: distancia, tiempo, series, sensacion — SOLO lo que aparece literalmente en el mensaje","sensacion":"buena|normal|mala|null si no se menciona"}

Mensaje: "${mensaje}"

"es_reporte_entreno" debe ser true SOLO si el atleta claramente reporta haber COMPLETADO un entrenamiento (usa frases como "he terminado", "acabo de hacer", "hice", "completé", "sesion realizada"). Nunca inventes datos que el mensaje no contenga.`;

    try {
      const sesionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: sesionPrompt }] }),
      });
      const sesionData = await sesionRes.json();
      const sesionTexto = sesionData.content?.map((b: any) => b.text || "").join("") || "{}";
      const sesionClean = sesionTexto.replace(/```json|```/g, "").trim();
      const sesionMatch = sesionClean.match(/\{[\s\S]*\}/);
      if (!sesionMatch) return NextResponse.json({ ok: true, detectado: false });

      const extraido = JSON.parse(sesionMatch[0]);
      if (!extraido.es_reporte_entreno) return NextResponse.json({ ok: true, detectado: false });

      // Fecha de hoy real, misma logica que usa el resto del sistema
      const hoySesionStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

      // FIX: si ya existe una sesion del mismo tipo hoy, ENRIQUECER en vez de bloquear o duplicar —
      // cubre tanto el caso de reporte fragmentado en varios mensajes (el usuario añade detalles
      // despues) como el de correccion de un dato ya reportado.
      const { data: usuarioWorkoutCheck } = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
      const workoutHistoryActual = usuarioWorkoutCheck?.workout_history || [];
      const idxSesionHoyExistente = workoutHistoryActual.findIndex((w: any) => w.fecha?.startsWith(hoySesionStr) && w.tipo === extraido.tipo);

      const nuevaSesionSafety = {
        tipo: extraido.tipo || "entrenamiento",
        fecha: idxSesionHoyExistente >= 0 ? workoutHistoryActual[idxSesionHoyExistente].fecha : new Date().toISOString(),
        notas: idxSesionHoyExistente >= 0
          ? `${workoutHistoryActual[idxSesionHoyExistente].notas || ""} ${extraido.notas || ""}`.trim()
          : (extraido.notas || ""),
        duracion: null,
        sensacion: extraido.sensacion || workoutHistoryActual[idxSesionHoyExistente]?.sensacion || "normal",
        analisis: "",
        source: "safety_net_deterministico"
      };

      let workoutHistoryActualizado;
      if (idxSesionHoyExistente >= 0) {
        workoutHistoryActualizado = [...workoutHistoryActual];
        workoutHistoryActualizado[idxSesionHoyExistente] = nuevaSesionSafety;
        console.log("🛡️ SESSION SAFETY NET: enriqueciendo sesion ya existente de hoy con nuevos detalles");
      } else {
        workoutHistoryActualizado = [...workoutHistoryActual, nuevaSesionSafety];
      }

      await supabase.from("usuarios").update({ workout_history: workoutHistoryActualizado }).eq("codigo", codigo);

      // Marcar tambien la sesion del dia correspondiente en weekly_plan como completada, si existe
      const diaSemSesionNum = new Date().getDay() || 7;
      const lunesSesion = new Date();
      lunesSesion.setDate(new Date().getDate() - diaSemSesionNum + 1);
      const weekStartSesion = lunesSesion.toISOString().split('T')[0];
      const DIAS_SESION = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
      const diaHoySesion = DIAS_SESION[new Date().getDay()];
      const normalizarDiaSesion = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      const { data: planParaMarcar } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartSesion).single();
      if (planParaMarcar) {
        const sessionsMarcadas = planParaMarcar.sessions.map((s: any) => {
          if (normalizarDiaSesion(s.dia) === normalizarDiaSesion(diaHoySesion) && !s.completada) {
            return { ...s, completada: true, titulo_real: extraido.tipo, descripcion_real: extraido.notas || "" };
          }
          return s;
        });
        await supabase.from("weekly_plan").update({ sessions: sessionsMarcadas }).eq("user_codigo", codigo).eq("week_start", weekStartSesion);
      }

      console.log("🛡️ SESSION SAFETY NET: reporte de entreno detectado y guardado automaticamente:", JSON.stringify(nuevaSesionSafety));
      return NextResponse.json({ ok: true, detectado: true, sesion: nuevaSesionSafety });
    } catch (err: any) {
      console.error("Error en verificar_sesion_completada_deterministico:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  if (action === "verificar_referencia_sesion_futura") {
    // FORGE FUTURE SESSION SAFETY — capa determinista que se ejecuta DESPUES de que el Coach genere
    // su respuesta. Si el atleta esta RESTRICTED y la respuesta menciona una sesion futura existente
    // en weekly_plan, verifica compatibilidad contra las hard constraints ANTES de que la mencion
    // llegue al usuario como valida. El LLM puede mencionar la sesion espontaneamente (fuera del
    // flujo de "dato inmutable"), pero su compatibilidad la determina SIEMPRE el codigo, nunca el LLM.
    const { respuestaCoach } = datos;
    if (!respuestaCoach) return NextResponse.json({ ok: true, alerta: null });

    const { data: estadoAtletaFuturo } = await supabase.from("athlete_state_events").select("estado,body_area,motivo").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
    if (!estadoAtletaFuturo || estadoAtletaFuturo.estado === "normal") {
      return NextResponse.json({ ok: true, alerta: null });
    }

    const hoyFuturo = new Date().toISOString().split('T')[0];
    const { data: hardConstraintsFuturo } = await supabase.from("athlete_coaching_notes")
      .select("movement,issue")
      .eq("user_codigo", codigo)
      .eq("constraint_level", "hard")
      .in("status", ["pending", "considerada"])
      .or(`valid_until.is.null,valid_until.gte.${hoyFuturo}`);
    if (!hardConstraintsFuturo || hardConstraintsFuturo.length === 0) {
      return NextResponse.json({ ok: true, alerta: null });
    }

    // Determinar week_start actual y buscar el plan real
    const hoyDetFuturo = new Date();
    const diaSemFuturo = hoyDetFuturo.getDay() || 7;
    const lunesFuturo = new Date(hoyDetFuturo);
    lunesFuturo.setDate(hoyDetFuturo.getDate() - diaSemFuturo + 1);
    const weekStartFuturo = lunesFuturo.toISOString().split('T')[0];
    const { data: planFuturo } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", weekStartFuturo).single();
    if (!planFuturo?.sessions) return NextResponse.json({ ok: true, alerta: null });

    // Deteccion determinista: ¿la respuesta del Coach coincide textualmente con el titulo de alguna
    // sesion futura (no completada) del plan? Si es asi, comparar esa sesion real contra las constraints.
    const normalizarFuturo = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const respuestaNormalizada = normalizarFuturo(respuestaCoach);
    const DIAS_FUTURO = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

    for (const sesion of planFuturo.sessions) {
      if (sesion.completada) continue;
      const tituloNormalizado = normalizarFuturo(sesion.titulo || "");
      if (!tituloNormalizado || tituloNormalizado.length < 5) continue;
      if (!respuestaNormalizada.includes(tituloNormalizado)) continue;

      // La respuesta menciona esta sesion real — verificar compatibilidad contra las hard constraints
      const textoSesionFuturo = normalizarFuturo(`${sesion.titulo || ""} ${sesion.tipo || ""} ${sesion.descripcion || ""}`);
      for (const constraint of hardConstraintsFuturo) {
        const movimientoNorm = normalizarFuturo(constraint.movement || "");
        if (movimientoNorm && textoSesionFuturo.includes(movimientoNorm)) {
          return NextResponse.json({
            ok: true,
            alerta: {
              dia: sesion.dia,
              tituloSesion: sesion.titulo,
              constraintViolada: constraint.movement,
              issue: constraint.issue
            }
          });
        }
      }
    }

    return NextResponse.json({ ok: true, alerta: null });
  }

  if (action === "obtener_estado_atleta_activo") {
    // Solo lectura — permite al frontend saber si hay una restriccion activa, para mostrar UI
    // adecuada (ej: banner de "en gestion de lesion" con opcion de marcar como resuelto).
    const { data: estadoActivo } = await supabase.from("athlete_state_events").select("*").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
    return NextResponse.json({ estado: estadoActivo?.estado || "normal", motivo: estadoActivo?.motivo || null, desde: estadoActivo?.fecha_inicio || null });
  }

  if (action === "obtener_detalle_estado_atleta") {
    // Detalle completo del estado activo — la UI lee el estado ESTRUCTURADO real (reason_description,
    // body_area), nunca infiere la explicacion desde una Coaching Note asociada (consecuencia
    // secundaria). Las Coaching Notes/restricciones se muestran como EVIDENCIA complementaria.
    const { data: estadoDetalle } = await supabase.from("athlete_state_events").select("*").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
    if (!estadoDetalle || estadoDetalle.estado === "normal") {
      return NextResponse.json({ estado: "normal" });
    }
    const hoyDetalle = new Date().toISOString().split('T')[0];
    const { data: restriccionesDetalle } = await supabase.from("athlete_coaching_notes")
      .select("movement,issue,priority")
      .eq("user_codigo", codigo)
      .eq("constraint_level", "hard")
      .in("status", ["pending", "considerada"])
      .or(`valid_until.is.null,valid_until.gte.${hoyDetalle}`);
    return NextResponse.json({
      estado: estadoDetalle.estado,
      motivo: estadoDetalle.motivo,
      bodyArea: estadoDetalle.body_area,
      reasonDescription: estadoDetalle.reason_description,
      desde: estadoDetalle.fecha_inicio,
      restricciones: restriccionesDetalle || []
    });
  }

  if (action === "resolver_restriccion_atleta") {
    // FORGE ATHLETE STATE ENGINE — transicion de salida, SIEMPRE disparada por confirmacion
    // EXPLICITA del usuario (nunca inferida del lenguaje libre del Coach). El atleta pasa a
    // REASSESSMENT: reconocemos que la restriccion se resolvio pero NO asumimos retorno automatico
    // a la carga previa — la siguiente semana debe evaluar tolerancia real antes de progresar.
    const { data: estadoParaResolver } = await supabase.from("athlete_state_events").select("id,estado,motivo,fecha_inicio").eq("user_codigo", codigo).eq("activo", true).maybeSingle();
    if (!estadoParaResolver || estadoParaResolver.estado === "normal") {
      return NextResponse.json({ ok: true, resuelto: false, motivo: "sin_restriccion_activa" });
    }

    await supabase.from("athlete_state_events").update({ activo: false, fecha_fin: new Date().toISOString().split('T')[0] }).eq("id", estadoParaResolver.id);
    await supabase.from("athlete_state_events").insert({
      user_codigo: codigo,
      estado: "reassessment",
      motivo: `Resolución confirmada de: ${estadoParaResolver.motivo}`,
      activo: true
    });

    // FIX CRITICO DE SEGURIDAD CONFIRMADO CON EVIDENCIA REAL (30/08): marcar la constraint como
    // "resuelta" eliminaba TODA proteccion inmediatamente al confirmar resolucion — el Session
    // Builder dejaba de consultarla (status filtra por pending/considerada) y genero contenido de
    // alto impacto (400m Z3) el mismo dia que empezo la reevaluacion de una restriccion de rodilla.
    // REASSESSMENT significa "la restriccion esta siendo reevaluada", NUNCA "ha desaparecido".
    // Ahora: la constraint se mantiene activa (status sigue en pending/considerada) pero cambia a
    // constraint_level="reassessment" — el Session Builder la sigue recibiendo, con instruccion de
    // progresion controlada en vez de bloqueo total.
    await supabase.from("athlete_coaching_notes").update({ constraint_level: "reassessment" }).eq("user_codigo", codigo).eq("constraint_level", "hard").in("status", ["pending", "considerada"]);

    console.log("🟡 ATHLETE STATE ENGINE:", codigo, "transiciona de", estadoParaResolver.estado, "a REASSESSMENT");
    return NextResponse.json({ ok: true, resuelto: true, nuevoEstado: "reassessment" });
  }

  if (action === "verificar_carga_externa_deterministico") {
    // FORGE FOCUS — SAFETY NET Nivel 1: detecta reportes de carga externa (disciplina que Forge
    // NO gestiona) en el mensaje del usuario. Mismo patron ya usado para sueno/PRs/sesiones: el
    // LLM nunca decide si se guarda, un parser dedicado analiza el mensaje real y lo persiste de
    // forma determinista. Solo se dispara si el atleta esta en modo Focus (tiene disciplinas externas).
    const { mensaje } = datos;
    if (!mensaje || mensaje.trim().length < 10) return NextResponse.json({ ok: true, detectado: false });

    const focusContextCarga = await buildFocusContext(supabase, codigo);
    if (!focusContextCarga.esModoFocus) return NextResponse.json({ ok: true, detectado: false, motivo: "no_es_modo_focus" });

    const nombresDisciplinasExternas = focusContextCarga.disciplinasExternas.map((d: any) => d.disciplina);
    const cargaPrompt = `Analiza este mensaje de un atleta. Determina si esta reportando haber completado una sesion de alguna de estas disciplinas EXTERNAS (gestionadas por otro entrenador, no por ti): ${nombresDisciplinasExternas.join(", ")}.

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"es_reporte_externo":true_o_false,"disciplina":"nombre exacto de la lista o null","duracion_minutos":numero_o_null,"intensidad_percibida":numero_1_a_10_o_null,"tipo":"breve descripcion del tipo de trabajo o null","fatiga_post":"baja|media|alta|null"}

Mensaje: "${mensaje}"

"es_reporte_externo" debe ser true SOLO si claramente reporta haber completado una sesion de esas disciplinas especificas. Extrae SOLO datos que el mensaje contenga explicitamente, nunca inventes valores.`;

    try {
      const cargaRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: cargaPrompt }] }),
      });
      const cargaData = await cargaRes.json();
      const cargaTexto = cargaData.content?.map((b: any) => b.text || "").join("") || "{}";
      const cargaClean = cargaTexto.replace(/```json|```/g, "").trim();
      const cargaMatch = cargaClean.match(/\{[\s\S]*\}/);
      if (!cargaMatch) return NextResponse.json({ ok: true, detectado: false });

      const extraidoCarga = JSON.parse(cargaMatch[0]);
      if (!extraidoCarga.es_reporte_externo || !extraidoCarga.disciplina) {
        return NextResponse.json({ ok: true, detectado: false });
      }

      const hoyCargaExterna = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      // Calidad de dato: si tenemos duracion+intensidad es "estimated", si solo confirmo que entreno sin detalle es "unknown"
      const loadQuality = (extraidoCarga.duracion_minutos && extraidoCarga.intensidad_percibida) ? "estimated" : "unknown";

      const { error: errorCargaExterna } = await supabase.from("external_training_records").insert({
        user_codigo: codigo,
        fecha: hoyCargaExterna,
        disciplina: extraidoCarga.disciplina,
        duracion: extraidoCarga.duracion_minutos || null,
        intensidad_percibida: extraidoCarga.intensidad_percibida || null,
        tipo: extraidoCarga.tipo || null,
        fatiga_post: extraidoCarga.fatiga_post || null,
        source: "user_report",
        load_quality: loadQuality,
      });
      if (errorCargaExterna) {
        console.error("Error guardando carga externa:", errorCargaExterna);
        return NextResponse.json({ ok: true, detectado: true, guardado: false });
      }

      console.log(`🛡️ FOCUS EXTERNAL LOAD: reporte de ${extraidoCarga.disciplina} detectado y guardado (calidad: ${loadQuality})`);
      return NextResponse.json({ ok: true, detectado: true, guardado: true, disciplina: extraidoCarga.disciplina, fecha: hoyCargaExterna });
    } catch (err: any) {
      console.error("Error en verificar_carga_externa_deterministico:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  if (action === "guardar_readiness_checkin") {
    // FORGE READINESS CHECKIN — V1: captura pura del estado percibido al despertar, un toque,
    // sin LLM ni interpretacion. La correlacion con datos objetivos (HRV, sueño, FC) vive en
    // V2/V3 como analisis separado — esta accion SOLO persiste el dato crudo, deterministico.
    const { readinessScore, fecha } = datos;
    if (!readinessScore || readinessScore < 1 || readinessScore > 5) {
      return NextResponse.json({ error: "readinessScore debe estar entre 1 y 5" }, { status: 400 });
    }
    const fechaCheckin = fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const { error: errorReadiness } = await supabase.from("readiness_checkins").upsert({
      user_codigo: codigo,
      fecha: fechaCheckin,
      readiness_score: readinessScore,
      fuente: "checkin_manual"
    }, { onConflict: "user_codigo,fecha" });
    if (errorReadiness) return NextResponse.json({ error: errorReadiness.message }, { status: 500 });
    return NextResponse.json({ ok: true, fecha: fechaCheckin, readinessScore });
  }

  if (action === "obtener_readiness_hoy") {
    const hoyReadiness = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const { data: readinessData } = await supabase.from("readiness_checkins").select("readiness_score").eq("user_codigo", codigo).eq("fecha", hoyReadiness).maybeSingle();
    return NextResponse.json({ readinessScore: readinessData?.readiness_score ?? null });
  }

  if (action === "verificar_metricas_sueno_deterministico") {
    // FORGE SLEEP METRICS PARSER — Nivel 1: deteccion 100% deterministica, sin LLM. Se ejecuta
    // ANTES de enviar el mensaje al Coach. El extractor Haiku posterior fallaba de forma intermitente
    // (varios dias sin guardar pese a que el usuario SI reporto), exactamente el mismo patron de
    // fallo ya resuelto con PR Detection y Pending Actions. El LLM nunca decide si se guarda un
    // dato fisiologico critico — este parser lo hace de forma directa y auditable.
    const { mensaje } = datos;
    const parsedSueno = parseSleepMetrics(mensaje);
    if (!parsedSueno.detected) {
      return NextResponse.json({ ok: true, detectado: false });
    }

    const hoySueno = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const valoresGuardar: any = {};
    if (parsedSueno.hrv !== null) valoresGuardar.hrv = parsedSueno.hrv;
    if (parsedSueno.sueno !== null) valoresGuardar.sueno = parsedSueno.sueno;
    if (parsedSueno.rhr !== null) valoresGuardar.rhr = parsedSueno.rhr;

    if (Object.keys(valoresGuardar).length > 0) {
      const { error: errorUpsertSuenoDet } = await supabase.from("physiology_records").upsert({
        user_codigo: codigo,
        fecha: hoySueno,
        ...valoresGuardar,
        source: "manual_parser",
        updated_at: new Date().toISOString()
      }, { onConflict: "user_codigo,fecha" });
      if (errorUpsertSuenoDet) {
        console.error("Error guardando metricas de sueño deterministicas:", errorUpsertSuenoDet);
        return NextResponse.json({ ok: true, detectado: true, guardado: false });
      }
      // Actualizar tambien el snapshot rapido en usuarios.estado_fisiologico (consistencia con el resto del sistema)
      const { data: usuarioSuenoDet } = await supabase.from("usuarios").select("estado_fisiologico").eq("codigo", codigo).single();
      await supabase.from("usuarios").update({
        estado_fisiologico: { ...(usuarioSuenoDet?.estado_fisiologico || {}), ...valoresGuardar }
      }).eq("codigo", codigo);
    }

    // FIX: si hubo valores descartados por estar fuera de rango fisiologico razonable, informar
    // al frontend para que pueda preguntar explicitamente al usuario en vez de guardar silenciosamente
    // o simplemente perder el dato sin decir nada — bug real confirmado: "888ms" de HRV se persistio
    // sin ninguna alerta porque no existia validacion de rango.
    const haySospechosos = parsedSueno.valoresSospechosos && Object.values(parsedSueno.valoresSospechosos).some(v => v !== null);
    return NextResponse.json({ ok: true, detectado: true, guardado: Object.keys(valoresGuardar).length > 0, valores: valoresGuardar, fecha: hoySueno, valoresSospechosos: haySospechosos ? parsedSueno.valoresSospechosos : null });
  }

  if (action === "verificar_pr_deterministico") {
    // FORGE STRENGTH RECORD PARSER — Nivel 1: deteccion 100% deterministica, sin LLM. Se ejecuta
    // ANTES de enviar el mensaje al Coach. Si detecta un candidato y supera la marca anterior real
    // en BD, se registra directamente — nunca depende de que el LLM genere un tag correctamente.
    const { mensaje } = datos;
    const parsed = parseStrengthRecord(mensaje);
    if (!parsed.detected || !parsed.ejercicio || !parsed.valor) {
      return NextResponse.json({ ok: true, esPr: false });
    }

    const { data: usuarioParser } = await supabase.from("usuarios").select("historial_marcas").eq("codigo", codigo).single();
    const histMarcas = usuarioParser?.historial_marcas || [];
    const marcasDelEjercicio = histMarcas.filter((m: any) => m.ejercicio === parsed.ejercicio);
    const marcaAnterior = marcasDelEjercicio[marcasDelEjercicio.length - 1];

    const numNuevo = parseFloat(parsed.valor);
    let esPr = true;
    let mejoraCalculada: string | null = null;
    if (marcaAnterior) {
      const numAnterior = parseFloat(marcaAnterior.valor);
      if (!isNaN(numAnterior) && numNuevo <= numAnterior) {
        esPr = false;
      } else if (!isNaN(numAnterior)) {
        mejoraCalculada = `${(numNuevo - numAnterior).toFixed(1)}`;
      }
    }

    if (!esPr) {
      return NextResponse.json({ ok: true, esPr: false });
    }

    const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const yaExisteHoy = histMarcas.some((m: any) => m.ejercicio === parsed.ejercicio && m.fecha === fechaHoy && m.valor === parsed.valor);
    if (!yaExisteHoy) {
      await supabase.from("usuarios").update({
        historial_marcas: [...histMarcas, { fecha: fechaHoy, ejercicio: parsed.ejercicio, valor: parsed.valor }]
      }).eq("codigo", codigo);
    }

    // FORGE CARDS — progresion visual: ultimas 3 marcas previas + la nueva, con fecha formateada corta
    const formatearFechaCorta = (f: string) => {
      const d = new Date(f + 'T12:00:00');
      const meses = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
      return `${String(d.getDate()).padStart(2,'0')} ${meses[d.getMonth()]}`;
    };
    const progresionConFechas = [
      ...marcasDelEjercicio.slice(-3)
        .map((m: any) => ({ valor: parseFloat(m.valor), fecha: formatearFechaCorta(m.fecha) }))
        .filter((p: any) => !isNaN(p.valor)),
      { valor: numNuevo, fecha: formatearFechaCorta(fechaHoy) }
    ];

    return NextResponse.json({ ok: true, esPr: true, nuevoPrDetectado: { ejercicio: parsed.ejercicio, valor: parsed.valor, mejora: mejoraCalculada, progresion: progresionConFechas } });
  }

  if (action === "generar_contexto_forge_card") {
    // FORGE CARDS — genera la linea de contexto real (nunca inventada) para una tarjeta compartible.
    // El tipo determina que datos reales se usan para fundamentar la frase.
    const { tipoCard, datosCard } = datos;
    const { data: usuarioCard } = await supabase.from("usuarios").select("workout_history,historial_marcas,block_week_summary,ciclo_actual,objetivo_principal").eq("codigo", codigo).single();
    const { data: blockMemoryCard } = await supabase.from("block_week_summary").select("*").eq("user_codigo", codigo).order("week_start", { ascending: false }).limit(3);

    // Calcular dias desde la marca anterior del mismo ejercicio (para narrativa tipo "primer PR en 43 dias")
    let diasDesdeUltimoPr: number | null = null;
    if (tipoCard === "nuevo_pr" && datosCard.ejercicio) {
      const marcasDelEjercicio = (usuarioCard?.historial_marcas || []).filter((m: any) => m.ejercicio === datosCard.ejercicio?.toLowerCase().replace(/\s+/g, "_"));
      if (marcasDelEjercicio.length >= 2) {
        const penultima = marcasDelEjercicio[marcasDelEjercicio.length - 2];
        diasDesdeUltimoPr = Math.round((Date.now() - new Date(penultima.fecha).getTime()) / (24 * 60 * 60 * 1000));
      }
    }

    const reglasGenerales = `REGLAS ESTRICTAS:
- Maximo 15 palabras, una sola frase.
- USA los numeros y datos concretos que tengas disponibles arriba — nunca generica vacia tipo "excelente punto de partida" o "sigue asi".
- Prioriza NARRATIVA TEMPORAL sobre solo el numero: en cuanto tiempo se logro, si rompe una racha, si coincide con una fase del bloque.
- NO inventes datos que no esten en el contexto de arriba.
Ejemplos de BUENA narrativa (varia el estilo, no copies literal):
- "Primer PR tras 43 dias de trabajo constante"
- "Has ganado 5kg en 3 semanas del bloque de fuerza"
- "Superas el objetivo dos semanas antes de lo previsto"
- "Cuarto PR consecutivo en este bloque de intensificacion"
Ejemplos de MALA narrativa (evitar siempre): "Excelente punto de partida", "Sigue asi", "Gran trabajo".`;

    let contextPrompt = "";
    if (tipoCard === "nuevo_pr") {
      contextPrompt = `El atleta acaba de lograr un nuevo PR: ${datosCard.ejercicio} ${datosCard.valor}${datosCard.mejora ? ` (mejora de +${datosCard.mejora} respecto al anterior)` : ""}.
${diasDesdeUltimoPr !== null ? `Han pasado ${diasDesdeUltimoPr} dias desde su ultimo PR en este mismo ejercicio — considera usar este dato si aporta narrativa real.` : "Es su primera marca registrada en este ejercicio."}
Bloque actual: ${JSON.stringify(usuarioCard?.ciclo_actual)}
Resumenes de semanas recientes del bloque: ${JSON.stringify(blockMemoryCard)}
${reglasGenerales}`;
    } else if (tipoCard === "semana_completada") {
      contextPrompt = `El atleta completo ${datosCard.sesionesCompletadas}/${datosCard.sesionesTotales} sesiones esta semana (100%).
Bloque actual: ${JSON.stringify(usuarioCard?.ciclo_actual)}
Resumenes de semanas recientes: ${JSON.stringify(blockMemoryCard)}
${reglasGenerales}
Si hay resumenes de semanas anteriores, menciona si esto continua o rompe una racha de adherencia.`;
    } else if (tipoCard === "objetivo_conseguido") {
      contextPrompt = `El atleta consiguio su objetivo: ${datosCard.objetivo}.
Bloque actual: ${JSON.stringify(usuarioCard?.ciclo_actual)}
${reglasGenerales}`;
    } else if (tipoCard === "racha") {
      contextPrompt = `El atleta lleva ${datosCard.dias} dias consecutivos entrenando sin interrupcion.
${reglasGenerales}
Menciona el numero exacto de dias en la frase.`;
    } else {
      return NextResponse.json({ error: "tipoCard no reconocido" }, { status: 400 });
    }

    try {
      const cardRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 100, messages: [{ role: "user", content: contextPrompt }] }),
      });
      const cardData = await cardRes.json();
      const contexto = cardData.content?.map((b: any) => b.text || "").join("").trim() || "";
      return NextResponse.json({ ok: true, contexto });
    } catch (err: any) {
      return NextResponse.json({ ok: true, contexto: "" }); // fallback silencioso, la card funciona sin contexto tambien
    }
  }

  if (action === "verificar_persistencia_plan") {
    // FORGE PERSISTENCE VALIDATOR — verifica que el plan realmente se guardo con estructura correcta
    const { weekStart } = datos;
    const { data: planGuardado } = await supabase.from("weekly_plan").select("week_start,sessions").eq("user_codigo", codigo).eq("week_start", weekStart).single();

    if (!planGuardado) {
      return NextResponse.json({ valido: false, motivo: "no_existe_plan" });
    }
    const sessions = planGuardado.sessions || [];
    if (sessions.length !== 7) {
      return NextResponse.json({ valido: false, motivo: "faltan_dias", dias_encontrados: sessions.length });
    }
    const diasEsperados = ["lunes","martes","miercoles","miércoles","jueves","viernes","sabado","sábado","domingo"];
    const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const diasUnicos = new Set(sessions.map((s: any) => normalizar(s.dia)));
    const diasBase = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
    const faltantes = diasBase.filter(d => !diasUnicos.has(d));
    if (faltantes.length > 0) {
      return NextResponse.json({ valido: false, motivo: "dias_faltantes", faltantes });
    }
    const sinDescripcion = sessions.filter((s: any) => !s.descripcion || s.descripcion.trim().length < 10);
    if (sinDescripcion.length > 0) {
      return NextResponse.json({ valido: false, motivo: "sesiones_incompletas", cantidad: sinDescripcion.length });
    }

    return NextResponse.json({ valido: true });
  }

  if (action === "verificar_sesion_activa") {
    // VERIFY (solo lectura, NUNCA escribe): distingue 3 casos claramente.
    // 1. Nadie ha adquirido nunca -> sinDueñoRegistrado=true (unico caso donde el frontend puede auto-adquirir)
    // 2. El dueño soy yo mismo -> haySesionActiva=false, no hacer nada
    // 3. Otra sesion viva y distinta a la mia -> haySesionActiva=true, mostrar conflicto
    // NOTA: "viva" ahora se basa en ACTIVIDAD REAL (last_message_at), no solo heartbeat — una pestaña
    // abierta en background (ej: movil sin usar) no debe bloquear indefinidamente a otras pestañas.
    const { sessionId: miSessionId } = datos || {};
    const SESSION_REAL_ACTIVITY_THRESHOLD_MS = 45 * 60 * 1000; // 45 min sin enviar ningun mensaje real
    const { data: sesionActiva } = await supabase.from("active_sessions").select("*").eq("user_codigo", codigo).single();

    if (!sesionActiva) {
      return NextResponse.json({ haySesionActiva: false, sinDueñoRegistrado: true, sesionActiva: null });
    }
    const soyElDueño = sesionActiva.session_id === miSessionId;
    if (soyElDueño) {
      return NextResponse.json({ haySesionActiva: false, sinDueñoRegistrado: false, sesionActiva: null });
    }
    const ultimaActividadReal = sesionActiva.last_message_at || sesionActiva.owner_since;
    const otraEstaViva = (Date.now() - new Date(ultimaActividadReal).getTime()) < SESSION_REAL_ACTIVITY_THRESHOLD_MS;
    if (!otraEstaViva) {
      // El otro dueño no ha enviado ningun mensaje real en 45+ min -> tratar como sin dueño registrado
      return NextResponse.json({ haySesionActiva: false, sinDueñoRegistrado: true, sesionActiva: null });
    }
    return NextResponse.json({ haySesionActiva: true, sinDueñoRegistrado: false, sesionActiva });
  }

  if (action === "tomar_control_sesion") {
    // Esta pestaña toma el control explicitamente (el usuario confirmo "Continuar aqui")
    const { sessionId } = datos;
    const ahora = new Date().toISOString();
    const { error: errorUpsert } = await supabase.from("active_sessions").upsert({
      user_codigo: codigo,
      session_id: sessionId,
      owner_since: ahora,
      updated_at: ahora
    });
    if (errorUpsert) {
      console.error("ERROR upsert active_sessions:", errorUpsert);
      return NextResponse.json({ ok: false, error: errorUpsert.message });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "heartbeat_sesion") {
    // Actualiza el heartbeat SOLO si esta sesion sigue siendo la propietaria del lock
    const { sessionId } = datos;
    const { data: sesionActual } = await supabase.from("active_sessions").select("session_id").eq("user_codigo", codigo).single();
    if (sesionActual?.session_id !== sessionId) {
      return NextResponse.json({ ok: false, motivo: "ya_no_eres_propietario" });
    }
    await supabase.from("active_sessions").update({ updated_at: new Date().toISOString() }).eq("user_codigo", codigo);
    return NextResponse.json({ ok: true });
  }

  if (action === "procesar_mensaje_contexto") {
    // Combina Intent Classifier + Event Aggregator + Context Builder en una sola llamada.
    // Tambien registra ACTIVIDAD REAL (envio de mensaje) para el timeout de sesion abandonada.
    const { mensaje } = datos;
    supabase.from("active_sessions").update({ last_message_at: new Date().toISOString() }).eq("user_codigo", codigo).then(() => {});
    const clasificacion = await clasificarIntencion(apiKey!, mensaje);
    const resultadoAggregator = await forgeEventAggregator(supabase, apiKey!, codigo, mensaje);
    const contextoConstruido = await forgeContextBuilder(supabase, codigo, resultadoAggregator);

    // FORGE KNOWLEDGE ROUTER — cada intent sabe exactamente que funcion del Knowledge Engine consultar.
    // El Coach ya no busca informacion por si mismo, la recibe ya resuelta segun la intencion detectada.
    let datoInmutable: any = null;
    if (clasificacion.familia === "READ" && clasificacion.confidence >= 0.6) {
      if (clasificacion.intent === "PLAN_HOY" || clasificacion.intent === "PLAN_MANANA") {
        // Estos dos viven en el Estado Canonico (ya calculado), no en el Knowledge Engine
        const estado = await generarEstadoCanonico(supabase, codigo);
        datoInmutable = clasificacion.intent === "PLAN_HOY"
          ? { tipo: "sesion_hoy", valor: estado.sesion_hoy }
          : { tipo: "sesion_manana", valor: estado.sesion_manana };
      } else {
        datoInmutable = await knowledgeRouter(codigo, clasificacion.intent);
      }
    }

    // FORGE RESPONSE ENGINE — si el intent tiene modo STATIC y hay dato disponible, componemos
    // la respuesta directamente aqui, SIN llamar al Coach en absoluto. Ahorra tokens, latencia y
    // elimina cualquier posibilidad de alucinacion en el dato mas critico.
    const modoRespuesta = getResponseMode(clasificacion.intent);
    let respuestaEstatica: string | null = null;
    if (modoRespuesta === "STATIC" && datoInmutable) {
      respuestaEstatica = buildStaticResponse(clasificacion.intent, datoInmutable);
    }

    // FORGE CAPABILITY INJECTION — Principio 7: el Coach solo puede mencionar lo que su intent autoriza.
    const capacidades = getCapabilities(clasificacion.intent);
    const instruccionCapacidades = buildCapabilityInstruction(capacidades);

    // FORGE ORCHESTRATOR OWNERSHIP — la planificacion semanal completa es propiedad exclusiva
    // del Orchestrator, nunca del Coach. Si el intent lo detecta, marcamos la respuesta para que
    // el frontend dispare el Orchestrator directamente, sin que el LLM genere ningun [PLAN:] libre.
    const debeDispararOrchestrator = clasificacion.intent === "GENERAR_SEMANA_COMPLETA" && clasificacion.confidence >= 0.6;

    return NextResponse.json({
      eventType: resultadoAggregator.eventType,
      esCorreccion: resultadoAggregator.esCorreccion,
      contexto: contextoConstruido,
      clasificacion,
      datoInmutable,
      modoRespuesta,
      respuestaEstatica,
      instruccionCapacidades,
      debeDispararOrchestrator
    });
  }

  if (action === "obtener_descubrimiento_pendiente") {
    // Devuelve el descubrimiento mas reciente no visto, y lo marca como visto en el mismo paso
    const { data: descubrimiento } = await supabase.from("forge_discoveries").select("*").eq("user_codigo", codigo).eq("visto", false).order("created_at", { ascending: false }).limit(1).single();
    if (descubrimiento) {
      await supabase.from("forge_discoveries").update({ visto: true }).eq("id", descubrimiento.id);
    }
    return NextResponse.json({ descubrimiento: descubrimiento || null });
  }

  if (action === "obtener_saludo_proactivo") {
    // FORGE COACH PROACTIVO — si han pasado varios dias sin actividad Y hay contenido relevante
    // acumulado (insight reciente no comentado, tendencia relevante), Forge inicia con algo util
    // en vez de esperar pasivamente. Es determinista: solo se activa si hay datos reales que ofrecer.
    const { data: usuarioProactivo } = await supabase.from("usuarios").select("ultima_visita,historial_fisiologico").eq("codigo", codigo).single();
    const ultimaVisita = usuarioProactivo?.ultima_visita ? new Date(usuarioProactivo.ultima_visita) : null;
    const diasSinVisitar = ultimaVisita ? Math.floor((Date.now() - ultimaVisita.getTime()) / (24*60*60*1000)) : 0;

    if (diasSinVisitar < 2) return NextResponse.json({ saludo: null }); // visita reciente, no hace falta ser proactivo

    const { data: ultimoInsight } = await supabase.from("athlete_events").select("data,date").eq("user_codigo", codigo).eq("type", "forge_insight").order("date", { ascending: false }).limit(1).single();
    if (!ultimoInsight) return NextResponse.json({ saludo: null });

    const diasDesdeInsight = Math.floor((Date.now() - new Date(ultimoInsight.date).getTime()) / (24*60*60*1000));
    if (diasDesdeInsight > 10) return NextResponse.json({ saludo: null }); // insight demasiado antiguo, ya no es relevante como saludo

    const saludo = `He revisado tu última semana. ${ultimoInsight.data?.notas?.split('\n')[0] || 'Tengo información relevante para ti'} ¿Seguimos por ahí?`;
    return NextResponse.json({ saludo });
  }

  if (action === "obtener_estado_canonico") {
    const estado = await generarEstadoCanonico(supabase, codigo);
    return NextResponse.json({ estado });
  }

  if (action === "obtener_plan_semana") {
    // FIX CRITICO: usar timeZone explicito (igual que el resto del sistema), sin esto el servidor
    // calcula en UTC, causando desfase con usuarios en Canarias/Madrid cerca de medianoche.
    const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const hoy = new Date(hoyStr + 'T12:00:00');
    const diaSemana = hoy.getDay() || 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    const weekStart = lunes.toISOString().split('T')[0];
    const { data: plan } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStart).single();

    // FIX ARQUITECTONICO: cada sesion se marca explicitamente como historica o futura respecto a
    // HOY — corrige un bug real donde el Coach confundia dias ya transcurridos de la semana con
    // dias futuros al mencionarlos en conversacion libre (fuera del flujo hoy/manana ya protegido).
    // El consumidor (buildPrompt) ya no necesita inferir esto — el dato llega con su semantica temporal.
    if (plan?.sessions) {
      const DIAS_ORDEN_SEMANTICA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
      const normalizarDiaSemantica = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const indiceHoySemantica = DIAS_ORDEN_SEMANTICA.indexOf(normalizarDiaSemantica(hoy.toLocaleDateString("es-ES", { weekday: "long" })));
      plan.sessions = plan.sessions.map((s: any) => {
        const indiceSesion = DIAS_ORDEN_SEMANTICA.indexOf(normalizarDiaSemantica(s.dia));
        const esHistorica = indiceSesion >= 0 && indiceHoySemantica >= 0 && indiceSesion < indiceHoySemantica;
        return { ...s, es_historica: esHistorica || !!s.completada, es_futura: !esHistorica && !s.completada && indiceSesion !== indiceHoySemantica };
      });
    }

    return NextResponse.json({ plan: plan || null, weekStart });
  }

  if (action === "guardar_block_outcome") {
    const { tipo_bloque, duracion_semanas, objetivo, adherencia, fatiga_media, sesiones_completadas, pr_obtenidos, debilidades_resueltas, lesiones, resultado_global, fecha_inicio, fecha_fin } = datos;
    await supabase.from("block_outcomes").insert({
      user_codigo: codigo, tipo_bloque, duracion_semanas, objetivo, adherencia,
      fatiga_media, sesiones_completadas, pr_obtenidos, debilidades_resueltas,
      lesiones, resultado_global, fecha_inicio, fecha_fin
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "guardar_intervention") {
    const { problema, accion, resultado, efectividad } = datos;
    await supabase.from("interventions").insert({ user_codigo: codigo, problema, accion, resultado, efectividad });
    return NextResponse.json({ ok: true });
  }

  if (action === "obtener_event_log") {
    const { data: eventoActivo } = await supabase.from("active_events").select("*").eq("user_codigo", codigo).single();
    const { data: eventosLog } = await supabase.from("event_log").select("*").eq("user_codigo", codigo).order("closed_at", { ascending: false }).limit(30);
    return NextResponse.json({ eventoActivo: eventoActivo || null, historial: eventosLog || [] });
  }

  // FORGE ATHLETE KNOWLEDGE — funcion reutilizable, unica fuente de verdad del Nivel de Conocimiento.
// Cualquier pagina (Hoy, Atleta, futuras) llama a la ACCION "calcular_nivel_conocimiento", nunca
// calcula su propia version ni depende de otra pagina — ambas consultan la misma fuente independiente.
async function calcularNivelConocimientoReal(supabase: any, codigo: string): Promise<number> {
  const { data: usuarioCalc } = await supabase.from("usuarios").select("perfil,workout_history,historial_marcas").eq("codigo", codigo).single();
  const { data: knowledgePointsCalc } = await supabase.from("athlete_knowledge_points").select("categoria,confianza,estado").eq("user_codigo", codigo).in("estado", ["activo", "en_evolucion"]);
  const workoutHistoryCalc = usuarioCalc?.workout_history || [];
  const historialMarcasCalc = usuarioCalc?.historial_marcas || [];

  let nivel = 0;
  if (usuarioCalc?.perfil && Object.keys(usuarioCalc.perfil).length > 0) nivel += 10;
  nivel += Math.min(historialMarcasCalc.length * 2, 15);
  const categoriasConConocimiento = new Set((knowledgePointsCalc || []).map((kp: any) => kp.categoria));
  nivel += categoriasConConocimiento.size * 7.5;
  if (knowledgePointsCalc && knowledgePointsCalc.length > 0) {
    const confianzaMedia = knowledgePointsCalc.reduce((sum: number, kp: any) => sum + (kp.confianza || 0), 0) / knowledgePointsCalc.length;
    nivel += confianzaMedia * 20;
  }
  nivel += Math.min(workoutHistoryCalc.length * 0.3, 10);

  return Math.min(Math.round(nivel), 100);
}

if (action === "calcular_nivel_conocimiento") {
  const nivel = await calcularNivelConocimientoReal(supabase, codigo);
  return NextResponse.json({ nivelConocimiento: nivel });
}

if (action === "obtener_daily_briefing") {
    // FORGE DAILY BRIEFING — agrega todo lo necesario para la pantalla "Hoy" en una sola llamada.
    // Responde en <10s a: que ha pasado, que toca hoy, que ha aprendido Forge, como voy.
    // Su contenido varia segun modo_entrada: Coach (sesion del plan) vs Supervision (recuperacion + ultimo entreno).
    const { data: usuarioModoBriefing } = await supabase.from("usuarios").select("modo_entrada,workout_history,estado_fisiologico").eq("codigo", codigo).single();
    const modoEntradaBriefing = usuarioModoBriefing?.modo_entrada || "planificacion";

    if (modoEntradaBriefing === "supervision" || modoEntradaBriefing === "consulta") {
      const workoutHistoryBriefing = usuarioModoBriefing?.workout_history || [];
      const ultimoEntreno = workoutHistoryBriefing[workoutHistoryBriefing.length - 1] || null;
      const estadoFisioBriefing = usuarioModoBriefing?.estado_fisiologico || {};
      return NextResponse.json({
        briefing: {
          modoEntrada: modoEntradaBriefing,
          ultimoEntreno: ultimoEntreno ? { tipo: ultimoEntreno.tipo, fecha: ultimoEntreno.fecha, sensacion: ultimoEntreno.sensacion } : null,
          recuperacion: { hrv: estadoFisioBriefing.hrv || null, sueno: estadoFisioBriefing.sueno || null, tendencia: estadoFisioBriefing.tendencia || null }
        }
      });
    }

    const estado = await generarEstadoCanonico(supabase, codigo);
    const knowledge = await buildAthleteKnowledge(codigo);

    const { data: usuarioBriefing } = await supabase.from("usuarios").select("aprendizajes_atleta,ciclo_actual,workout_history,historial_marcas,perfil,fecha_registro").eq("codigo", codigo).single();
    const aprendizajes = usuarioBriefing?.aprendizajes_atleta || [];
    const ultimoAprendizaje = aprendizajes.length > 0 ? aprendizajes[aprendizajes.length - 1].texto : null;

    // FORGE ATHLETE KNOWLEDGE — consultamos la funcion reutilizable, no calculamos aqui.
    // Esta pagina es CONSUMIDORA del dato, no su fuente — igual que Mi Atleta.
    const nivelConocimiento = await calcularNivelConocimientoReal(supabase, codigo);

    // Descubrimiento/celebracion mas reciente sin ver
    const { data: descubrimiento } = await supabase.from("forge_discoveries").select("*").eq("user_codigo", codigo).eq("visto", false).order("created_at", { ascending: false }).limit(1).single();

    // Debilidad con mayor progreso reciente (para "evolucion destacada")
    const { data: usuarioDev } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const desarrollo = usuarioDev?.athlete_development || [];
    const evolucionDestacada = desarrollo
      .filter((d: any) => d.estado !== "resuelta" && d.progreso > 0)
      .sort((a: any, b: any) => (b.progreso || 0) - (a.progreso || 0))[0] || null;

    return NextResponse.json({
      briefing: {
        modoEntrada: "planificacion",
        diaSemana: estado.dia_semana_hoy,
        sesionHoy: estado.sesion_hoy,
        nivelConocimiento,
        ultimoAprendizaje,
        descubrimiento: descubrimiento || null,
        objetivo: knowledge.objective,
        progresoObjetivo: knowledge.objectiveProgress,
        evolucionDestacada,
        ultimoInsight: knowledge.latestInsight
      }
    });
  }

  if (action === "obtener_progreso_objetivo") {
    const progreso = await getObjectiveProgress(codigo);
    return NextResponse.json({ progreso });
  }

  if (action === "obtener_estado_founder") {
    const { data: usuario } = await supabase.from("usuarios").select("is_beta_founder,beta_number,premium_until,workout_history,historial_fisiologico,historial").eq("codigo", codigo).single();
    if (!usuario?.is_beta_founder) return NextResponse.json({ esFounder: false });

    const ahora = new Date();
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const workoutHistory = usuario.workout_history || [];
    const historialFisio = usuario.historial_fisiologico || [];
    const historialChat = usuario.historial || [];

    const sesionesRecientes = workoutHistory.filter((w: any) => new Date(w.fecha) >= hace30dias).length;
    const registrosFisioRecientes = historialFisio.filter((f: any) => new Date(f.fecha) >= hace30dias).length;
    const mensajesUsuarioRecientes = historialChat.filter((m: any) => m.role === "user").length;
    const actividadTotal = sesionesRecientes + registrosFisioRecientes + Math.min(mensajesUsuarioRecientes, 10);

    const premiumHasta = usuario.premium_until ? new Date(usuario.premium_until) : null;
    const diasRestantes = premiumHasta ? Math.ceil((premiumHasta.getTime() - ahora.getTime()) / (24*60*60*1000)) : 0;

    return NextResponse.json({
      esFounder: true,
      betaNumber: usuario.beta_number,
      sesiones: sesionesRecientes,
      actividadTotal: Math.min(actividadTotal, 10),
      objetivoActividad: 10,
      renovacionAsegurada: sesionesRecientes >= 6 || actividadTotal >= 10,
      diasRestantes
    });
  }

  if (action === "verificar_renovacion_beta") {
    const { data: usuario } = await supabase.from("usuarios").select("is_beta_founder,premium_until,ultima_renovacion_beta,workout_history,historial_fisiologico,historial,renovaciones_beta_completadas,precio_especial_founder").eq("codigo", codigo).single();
    if (!usuario?.is_beta_founder) return NextResponse.json({ renovado: false, motivo: "no_es_founder" });

    // Si ya completó las 3 renovaciones, tiene precio especial de por vida — no se revisa más actividad para el Premium beta
    if ((usuario.renovaciones_beta_completadas || 0) >= 3) {
      return NextResponse.json({ renovado: false, motivo: "ciclo_completado", precio_especial: true });
    }

    const ahora = new Date();
    const premiumHasta = usuario.premium_until ? new Date(usuario.premium_until) : null;

    if (usuario.ultima_renovacion_beta) {
      const diasDesdeUltimaRenovacion = (ahora.getTime() - new Date(usuario.ultima_renovacion_beta).getTime()) / (24*60*60*1000);
      if (diasDesdeUltimaRenovacion < 25) {
        return NextResponse.json({ renovado: false, motivo: "ya_renovo_reciente" });
      }
    }

    if (premiumHasta && premiumHasta.getTime() - ahora.getTime() > 3 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ renovado: false, motivo: "aun_no_toca", dias_restantes: Math.ceil((premiumHasta.getTime() - ahora.getTime()) / (24*60*60*1000)) });
    }

    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const workoutHistory = usuario.workout_history || [];
    const historialFisio = usuario.historial_fisiologico || [];
    const historialChat = usuario.historial || [];

    const sesionesRecientes = workoutHistory.filter((w: any) => new Date(w.fecha) >= hace30dias).length;
    const registrosFisioRecientes = historialFisio.filter((f: any) => new Date(f.fecha) >= hace30dias).length;
    const mensajesUsuarioRecientes = historialChat.filter((m: any) => m.role === "user").length;

    const actividadTotal = sesionesRecientes + registrosFisioRecientes + Math.min(mensajesUsuarioRecientes, 10);
    const activo = sesionesRecientes >= 6 || actividadTotal >= 10;

    if (activo) {
      const nuevasRenovaciones = (usuario.renovaciones_beta_completadas || 0) + 1;
      const base = premiumHasta && premiumHasta.getTime() > ahora.getTime() ? new Date(premiumHasta) : new Date(ahora);
      base.setMonth(base.getMonth() + 1);
      const alcanzaPrecioEspecial = nuevasRenovaciones >= 3;
      await supabase.from("usuarios").update({
        premium_until: base.toISOString(),
        ultima_renovacion_beta: ahora.toISOString(),
        renovaciones_beta_completadas: nuevasRenovaciones,
        precio_especial_founder: alcanzaPrecioEspecial
      }).eq("codigo", codigo);
      return NextResponse.json({ renovado: true, nueva_fecha: base.toISOString(), sesiones: sesionesRecientes, actividad_total: actividadTotal, renovaciones_completadas: nuevasRenovaciones, precio_especial_desbloqueado: alcanzaPrecioEspecial });
    } else {
      // No cumplió actividad: pierde el estatus de Beta Founder (Premium) inmediatamente
      await supabase.from("usuarios").update({ premium: false }).eq("codigo", codigo);
      return NextResponse.json({ renovado: false, motivo: "actividad_insuficiente_perdio_premium", sesiones: sesionesRecientes, actividad_total: actividadTotal });
    }
  }

  if (action === "verificar_activar_beta") {
    const { data: beta } = await supabase.from("beta_program").select("*").eq("id", 1).single();
    if (!beta || !beta.enabled) return NextResponse.json({ activado: false, motivo: "beta_inactiva" });

    const ahora = new Date();
    const expirado = beta.expires_at && new Date(beta.expires_at) < ahora;
    if (expirado) return NextResponse.json({ activado: false, motivo: "beta_expirada" });
    if (beta.used_slots >= beta.max_slots) return NextResponse.json({ activado: false, motivo: "sin_plazas" });

    // Verificar si el usuario ya es beta founder (no duplicar)
    const { data: usuarioActual } = await supabase.from("usuarios").select("is_beta_founder").eq("codigo", codigo).single();
    if (usuarioActual?.is_beta_founder) return NextResponse.json({ activado: false, motivo: "ya_es_founder" });

    // Activar de forma atómica
    const nuevoNumero = beta.used_slots + 1;
    const premiumHasta = new Date(ahora);
    premiumHasta.setMonth(premiumHasta.getMonth() + (beta.meses_premium || 6));

    await supabase.from("beta_program").update({ used_slots: nuevoNumero }).eq("id", 1);
    await supabase.from("usuarios").update({
      is_beta_founder: true,
      premium: true,
      premium_until: premiumHasta.toISOString(),
      joined_beta_at: ahora.toISOString(),
      beta_number: nuevoNumero
    }).eq("codigo", codigo);

    // Enviar email de bienvenida Fundador (no bloqueante — si falla, no rompe la activación)
    const { data: usuarioEmail } = await supabase.from("usuarios").select("email").eq("codigo", codigo).single();
    if (usuarioEmail?.email) {
      const html = await render(FounderEmail({ numero: nuevoNumero, maxSlots: beta.max_slots, meses: beta.meses_premium, codigoUsuario: codigo }));
      sendEmail({
        template: "founder_welcome",
        to: usuarioEmail.email,
        subject: `¡Enhorabuena! Eres el Atleta Fundador #${nuevoNumero} de Forge`,
        html,
        usuarioCodigo: codigo
      }).catch(err => console.error("Error enviando email founder:", err));
    }

    return NextResponse.json({ activado: true, beta_number: nuevoNumero, max_slots: beta.max_slots, meses_premium: beta.meses_premium });
  }

  if (action === "obtener_block_outcomes") {
    const { data: outcomes } = await supabase.from("block_outcomes").select("*").eq("user_codigo", codigo).order("fecha_fin", { ascending: false }).limit(10);
    return NextResponse.json({ outcomes: outcomes || [] });
  }

  if (action === "guardar_resumen_semana") {
    const { week_start, resumen, adherencia } = datos;
    await supabase.from("weekly_plan").update({ resumen_semana: resumen }).eq("user_codigo", codigo).eq("week_start", week_start);

    // Calcular nivel de conocimiento actual (mismo criterio que en Mi Atleta: 40 base + puntos de aprendizajes)
    const { data: usuarioConocimiento } = await supabase.from("usuarios").select("aprendizajes_atleta").eq("codigo", codigo).single();
    const aprendizajesActuales = usuarioConocimiento?.aprendizajes_atleta || [];
    const puntosActuales = aprendizajesActuales.reduce((sum: number, a: any) => sum + (a.puntos || 0), 0);
    const nivelConocimientoActual = Math.min(40 + puntosActuales, 100);

    // Buscar el ultimo Insight anterior para saber el nivel previo
    const { data: ultimoInsight } = await supabase.from("athlete_events").select("data").eq("user_codigo", codigo).eq("type", "forge_insight").order("date", { ascending: false }).limit(1).single();
    const nivelAnterior = ultimoInsight?.data?.nivel_conocimiento ?? nivelConocimientoActual;

    // Forge Insight: conocimiento permanente del atleta, categoria propia distinta a eventos normales
    await supabase.from("athlete_events").insert({
      user_codigo: codigo,
      date: new Date().toISOString().split('T')[0],
      type: "forge_insight",
      title: `Forge Insight — Semana ${week_start}`,
      data: { notas: resumen, adherencia: adherencia || "", nivel_conocimiento: nivelConocimientoActual, nivel_conocimiento_anterior: nivelAnterior }
    });
    return NextResponse.json({ ok: true, nivelConocimientoActual, nivelAnterior });
  }

  if (action === "guardar_plan_semana") {
    // FORGE CAPABILITY GUARD — ultima linea de defensa determinista, sin importar quien invoque esta
    // accion (boton, Coach, Orchestrator, futuro flujo). Un usuario en modo_entrada "supervision" o
    // "consulta" NUNCA puede persistir un weekly_plan — el modo determina la capacidad, no la peticion.
    const { data: usuarioGuardPlan } = await supabase.from("usuarios").select("modo_entrada").eq("codigo", codigo).single();
    if (usuarioGuardPlan?.modo_entrada === "supervision" || usuarioGuardPlan?.modo_entrada === "consulta") {
      console.error(`🚨 BLOCKED guardar_plan_semana — usuario ${codigo} en modo_entrada=${usuarioGuardPlan.modo_entrada}, no tiene capacidad can_generate_plan`);
      return NextResponse.json({ error: "Este modo no permite generar planificacion", blocked: true, reason: "SUPERVISION_NO_PLANNING" }, { status: 403 });
    }

    // FORGE WEEK GENERATION GUARD — limite deterministico de 2 generaciones por semana/usuario.
    // Impide que "genera mi semana" repetido cree/regenere indefinidamente la misma semana o avance
    // el tiempo artificialmente. Se cuenta ANTES de ejecutar nada mas costoso.
    const weekStartParaConteo = datos.plan?.week_start;
    if (weekStartParaConteo) {
      const { count: generacionesExistentes } = await supabase.from("weekly_plan_generation_log").select("id", { count: "exact", head: true }).eq("user_codigo", codigo).eq("week_start", weekStartParaConteo);
      if ((generacionesExistentes || 0) >= 2) {
        console.error(`🚨 BLOCKED guardar_plan_semana — usuario ${codigo} ya alcanzo el limite de 2 generaciones para week_start=${weekStartParaConteo}`);
        return NextResponse.json({ error: "Esta semana ya ha sido planificada dos veces. Para evitar alterar continuamente la estructura, no se generan mas versiones automaticas — puedes pedirme modificar sesiones concretas.", blocked: true, reason: "MAX_GENERATIONS_REACHED" }, { status: 403 });
      }
    }

    const { plan } = datos;
    // CORRECCIÓN DE RAÍZ: recalcular week_start correcto en el servidor, ignorando el que envió el modelo si es incorrecto
    const ahoraServ = new Date();
    const hoyServStr = ahoraServ.toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
    const hoyServFecha = new Date(hoyServStr + 'T12:00:00');
    const diaSemanaServ = hoyServFecha.getDay() || 7;
    const lunesServ = new Date(hoyServFecha);
    lunesServ.setDate(hoyServFecha.getDate() - diaSemanaServ + 1);
    // FIX CRITICO DE RAIZ: aceptar tanto la semana ACTUAL como la SIGUIENTE como validas — el Orchestrator
    // genera legitimamente la semana siguiente, y forzar siempre "la actual" deshacia ese calculo correcto.
    const weekStartActual = lunesServ.toISOString().split('T')[0];
    const lunesSiguiente = new Date(lunesServ);
    lunesSiguiente.setDate(lunesServ.getDate() + 7);
    const weekStartSiguiente = lunesSiguiente.toISOString().split('T')[0];

    if (plan.week_start !== weekStartActual && plan.week_start !== weekStartSiguiente) {
      // Solo corregimos si el valor enviado no es ni la semana actual ni la siguiente (caso realmente erroneo)
      console.log(`CORRIGIENDO week_start: modelo envió ${plan.week_start}, no coincide con actual (${weekStartActual}) ni siguiente (${weekStartSiguiente}). Usando actual.`);
      plan.week_start = weekStartActual;
    }
    // Preservar sesiones ya completadas SOLO si es la semana ACTUAL real (evita mezclar contenido
    // entre una semana nueva y un registro parcial/viejo que pudiera existir con el mismo week_start
    // por un intento anterior fallido del Orchestrator).
    const hoyGuardadoStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const hoyGuardadoFecha = new Date(hoyGuardadoStr + 'T12:00:00');
    const diaSemGuardado = hoyGuardadoFecha.getDay() || 7;
    const lunesGuardado = new Date(hoyGuardadoFecha);
    lunesGuardado.setDate(hoyGuardadoFecha.getDate() - diaSemGuardado + 1);
    const weekStartActualReal = lunesGuardado.toISOString().split('T')[0];
    const esSemanaActual = plan.week_start === weekStartActualReal;

    if (esSemanaActual) {
      const { data: planExistente } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", plan.week_start).single();
      if (planExistente?.sessions) {
        plan.sessions = plan.sessions.map((nuevaSesion: any) => {
          const sesionExistente = planExistente.sessions.find((s: any) => s.dia === nuevaSesion.dia);
          if (sesionExistente?.completada) {
            return sesionExistente;
          }
          return nuevaSesion;
        });
      }
    }
    // FORGE CANONICAL STATE — unico punto autorizado para incrementar ciclo_actual.semana: cuando se
    // guarda una semana genuinamente NUEVA (week_start posterior a la actual real), no una regeneracion
    // de la semana en curso. Deterministico, nunca depende de que el LLM lo detecte o recuerde.
    if (!esSemanaActual) {
      try {
        const { data: usuarioCicloIncr } = await supabase.from("usuarios").select("ciclo_actual").eq("codigo", codigo).single();
        const cicloIncr = usuarioCicloIncr?.ciclo_actual;
        if (cicloIncr && typeof cicloIncr.semana === "number") {
          // FIX CRITICO: bug real confirmado — "semana 23 de 4". El contador se incrementaba SIN
          // limite ni verificacion contra totalSemanas, nunca transicionaba de bloque. Ahora: si la
          // nueva semana superaria totalSemanas, el bloque actual TERMINA y arranca uno nuevo en
          // semana 1 — usando el nombre del bloque tal como lo decidio el plan.block_name real
          // (viene del Block Analyzer/Coach, ya reflejado en el plan que se esta guardando).
          const totalSemanasCiclo = cicloIncr.totalSemanas || 4;
          const superariaLimite = (cicloIncr.semana + 1) > totalSemanasCiclo;

          // FIX CRITICO CONFIRMADO CON EVIDENCIA REAL: block_outcomes existia en el modelo de datos
          // pero dependia de que el LLM generara el tag [BLOCK_OUTCOME:] en el momento exacto del
          // cierre — nunca se disparaba en la practica (0 registros reales tras multiples bloques
          // completados). Ahora: SIEMPRE que se detecta transicion de bloque, el codigo calcula y
          // guarda el outcome deterministamente, con datos reales de las tablas existentes, sin
          // depender de que el LLM recuerde generar ningun tag.
          if (superariaLimite) {
            try {
              const { data: usuarioParaOutcome } = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
              const workoutHistoryOutcome = usuarioParaOutcome?.workout_history || [];
              const hoyOutcome = new Date().toISOString().split('T')[0];
              const fechaInicioBloqueEstimada = (() => {
                const d = new Date();
                d.setDate(d.getDate() - (totalSemanasCiclo * 7));
                return d.toISOString().split('T')[0];
              })();
              const sesionesDelBloque = workoutHistoryOutcome.filter((w: any) => w.fecha >= fechaInicioBloqueEstimada);
              const diasEsperadosBloque = totalSemanasCiclo * 3; // estimacion conservadora, 3 sesiones/semana minimo
              const adherenciaCalculada = Math.min(100, Math.round((sesionesDelBloque.length / Math.max(diasEsperadosBloque, 1)) * 100));

              const { count: prsDelBloque } = await supabase.from("session_modification_events").select("*", { count: "exact", head: true }).eq("user_codigo", codigo).gte("created_at", fechaInicioBloqueEstimada);
              const { count: lesionesDelBloque } = await supabase.from("athlete_state_events").select("*", { count: "exact", head: true }).eq("user_codigo", codigo).eq("estado", "restricted").gte("created_at", fechaInicioBloqueEstimada);

              await supabase.from("block_outcomes").insert({
                user_codigo: codigo,
                tipo_bloque: cicloIncr.bloque || "desconocido",
                duracion_semanas: totalSemanasCiclo,
                objetivo: cicloIncr.objetivo || null,
                adherencia: adherenciaCalculada,
                fatiga_media: null,
                sesiones_completadas: sesionesDelBloque.length,
                pr_obtenidos: prsDelBloque || 0,
                debilidades_resueltas: null,
                lesiones: (lesionesDelBloque || 0) > 0,
                resultado_global: adherenciaCalculada >= 80 ? "bueno" : adherenciaCalculada >= 50 ? "regular" : "deficiente",
                fecha_inicio: fechaInicioBloqueEstimada,
                fecha_fin: hoyOutcome
              });
              console.log(`✅ BLOCK OUTCOME guardado deterministamente: bloque "${cicloIncr.bloque}", adherencia ${adherenciaCalculada}%, ${sesionesDelBloque.length} sesiones`);
            } catch (errBlockOutcome) {
              console.error("Error guardando block_outcome deterministico:", errBlockOutcome);
            }
          }

          const nuevoCiclo = superariaLimite
            ? { ...cicloIncr, bloque: plan.block_name || cicloIncr.bloque, semana: 1, totalSemanas: plan.total_weeks_block || totalSemanasCiclo }
            : { ...cicloIncr, semana: cicloIncr.semana + 1 };
          await supabase.from("usuarios").update({ ciclo_actual: nuevoCiclo }).eq("codigo", codigo);
          console.log(`CICLO ACTUAL: ${superariaLimite ? `TRANSICION DE BLOQUE — nuevo bloque "${nuevoCiclo.bloque}" semana 1` : `semana incrementada de ${cicloIncr.semana} a ${nuevoCiclo.semana}`} al generar nueva semana ${plan.week_start}`);
        }
      } catch (errIncrCiclo) {
        console.error("Error incrementando ciclo_actual.semana:", errIncrCiclo);
      }
    }

    // FORGE DETERMINISTIC PLAN VALIDATOR — ultima linea de defensa antes de persistir. El prompt del
    // Block Analyzer ya recibe las restricciones, pero eso es interpretacion, no garantia. Este
    // validator comprueba el plan REALMENTE GENERADO contra las hard constraints activas — si el
    // LLM ignoro la instruccion, el codigo lo detecta y corrige/bloquea, nunca confia ciegamente.
    // FORGE FOCUS — COMPLETADO DETERMINISTA (no guard reactivo, sino AUTORIDAD activa). El codigo
// SOBRESCRIBE cualquier dia marcado como disciplina externa con external_blocked, sin importar
// que genero el LLM para ese dia. El LLM no decide si respeta el dia externo — el codigo se lo
// impone despues, siempre. Esto sustituye cualquier contenido que el Session Builder haya podido
// generar incorrectamente para esos dias.
const focusContextValidator = await buildFocusContext(supabase, codigo);
    if (focusContextValidator.esModoFocus && Array.isArray(plan.sessions)) {
      const normalizarDiaFocusCompletado = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const mapaDiasExternos: Record<string, string> = {};
      focusContextValidator.disciplinasExternas.forEach((d: any) => {
        (d.dias || []).forEach((dia: string) => { mapaDiasExternos[normalizarDiaFocusCompletado(dia)] = d.disciplina; });
      });
      plan.sessions = plan.sessions.map((s: any) => {
        const diaNorm = normalizarDiaFocusCompletado(s.dia);
        if (mapaDiasExternos[diaNorm]) {
          return {
            dia: s.dia,
            tipo: "external_blocked",
            titulo: `${mapaDiasExternos[diaNorm]} · Entrenamiento externo`,
            por_que: "Gestionado por tu entrenador externo — Forge no prescribe ni modifica esta sesión.",
            descripcion: `Este día entrenas ${mapaDiasExternos[diaNorm]} con tu entrenador. Si quieres, cuéntame cómo fue (duración, intensidad, sensaciones) para que pueda ajustar mejor tus sesiones de running.`,
            disciplina: mapaDiasExternos[diaNorm],
            gestionado_por: "external",
          };
        }
        return s;
      });
      console.log(`✅ FOCUS: días externos [${Object.keys(mapaDiasExternos).join(", ")}] completados deterministicamente con external_blocked`);
    }
    if (focusContextValidator.esModoFocus && Array.isArray(plan.sessions)) {
      const normalizarDiaFocusValidator = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const diasExternosValidator = new Set<string>();
      focusContextValidator.disciplinasExternas.forEach((d: any) => {
        (d.dias || []).forEach((dia: string) => diasExternosValidator.add(normalizarDiaFocusValidator(dia)));
      });
      const violacionesFocusValidator = plan.sessions.filter((s: any) =>
        diasExternosValidator.has(normalizarDiaFocusValidator(s.dia)) && s.tipo !== "descanso" && s.tipo !== "external_blocked"
      );
      if (violacionesFocusValidator.length > 0) {
        console.error(`🚨 FOCUS GUARD: ${violacionesFocusValidator.length} dia(s) de disciplina externa con sesion prescrita por Forge:`, JSON.stringify(violacionesFocusValidator.map((s: any) => ({ dia: s.dia, titulo: s.titulo }))));
        return NextResponse.json({
          error: "El plan generado prescribe contenido en dias de disciplina externa (Focus)",
          blocked: true,
          reason: "FOCUS_EXTERNAL_DAY_VIOLATION",
          violaciones: violacionesFocusValidator.map((s: any) => ({ dia: s.dia, titulo: s.titulo }))
        }, { status: 422 });
      }
      console.log(`✅ FOCUS GUARD: plan verificado, dias externos [${Array.from(diasExternosValidator).join(", ")}] respetados`);
    }

    const { data: hardConstraintsValidator } = await supabase.from("athlete_coaching_notes")
      .select("movement,issue,prohibits_impact,prohibits_jump,prohibits_axial_load,prohibits_deep_flexion,prohibits_overhead_load")
      .eq("user_codigo", codigo)
      .eq("constraint_level", "hard")
      .in("status", ["pending", "considerada"])
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString().split('T')[0]}`);

    if (hardConstraintsValidator && hardConstraintsValidator.length > 0 && Array.isArray(plan.sessions)) {
      // FORGE CONSTRAINT ENGINE V2 — MOVEMENT CLASSIFIER. Sustituye por completo el matching de
      // listas de palabras (deuda tecnica confirmada: cada nueva palabra generaba nuevos falsos
      // positivos/negativos sin escalar). Ahora: un clasificador LLM dedicado analiza CADA sesion
      // y devuelve sus propiedades biomecanicas REALES (impact, jump, axial_load, deep_flexion,
      // overhead_load) como salida estructurada — el CODIGO compara esas propiedades contra lo que
      // la restriccion prohibe, nunca el LLM decide si bloquea. Principio: LLM clasifica atributos
      // objetivos observables, el codigo aplica la regla de compatibilidad.
      const combinedProhibitions = {
        impact: hardConstraintsValidator.some((c: any) => c.prohibits_impact),
        jump: hardConstraintsValidator.some((c: any) => c.prohibits_jump),
        axial_load: hardConstraintsValidator.some((c: any) => c.prohibits_axial_load),
        deep_flexion: hardConstraintsValidator.some((c: any) => c.prohibits_deep_flexion),
        overhead_load: hardConstraintsValidator.some((c: any) => c.prohibits_overhead_load),
      };
      const prohibicionesActivas = Object.entries(combinedProhibitions).filter(([, v]) => v).map(([k]) => k);

      const violaciones: { dia: string; movement: string; propiedad: string }[] = [];
      if (prohibicionesActivas.length > 0) {
        const classifierPrompt = `Eres un clasificador biomecanico de sesiones de entrenamiento. Para CADA sesion de la siguiente lista, determina si su bloque_principal contiene alguna de estas caracteristicas de movimiento: ${prohibicionesActivas.join(", ")}.

Definiciones:
- impact: aterrizaje repetido con impacto real (correr, saltar repetidamente, aterrizajes de salto)
- jump: salto vertical/horizontal real con despegue del suelo (NO cuenta variantes explicitamente "sin salto"/"step back"/"step in")
- axial_load: carga vertical significativa sobre la columna en posicion de pie (peso muerto pesado, sentadilla con barra cargada)
- deep_flexion: flexion profunda de rodilla bajo carga (sentadilla profunda cargada, no aplica a movilidad sin carga)
- overhead_load: carga significativa sostenida por encima de la cabeza (press militar, push press, snatch, jerk)

Sesiones a analizar:
${plan.sessions.map((s: any, i: number) => `[${i}] Dia: ${s.dia} — Titulo: ${s.titulo} — Contenido: ${(s.descripcion || "").substring(0, 500)}`).join("\n\n")}

Responde SOLO con este JSON, sin texto adicional ni markdown — un array con una entrada por sesion analizada:
[{"dia":"nombre del dia","impact":true_o_false,"jump":true_o_false,"axial_load":true_o_false,"deep_flexion":true_o_false,"overhead_load":true_o_false}]

Se ESTRICTO y literal: si la sesion dice explicitamente "sin salto" o "sin impacto" o "sin carga axial", esa propiedad especifica es false aunque el nombre del ejercicio la sugiera.`;

        try {
          const classifierRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1500, messages: [{ role: "user", content: classifierPrompt }] }),
          });
          const classifierData = await classifierRes.json();
          const classifierTexto = classifierData.content?.map((b: any) => b.text || "").join("") || "[]";
          const classifierClean = classifierTexto.replace(/```json|```/g, "").trim();
          const classifierMatch = classifierClean.match(/\[[\s\S]*\]/);
          const clasificaciones = classifierMatch ? JSON.parse(classifierMatch[0]) : [];

          clasificaciones.forEach((clas: any) => {
            prohibicionesActivas.forEach((prop) => {
              if (clas[prop] === true && (combinedProhibitions as any)[prop]) {
                violaciones.push({ dia: clas.dia, movement: prop, propiedad: prop });
              }
            });
          });
        } catch (errClassifier) {
          console.error("Error en Movement Classifier — no se bloquea por fallo del clasificador:", errClassifier);
        }
      }

      if (violaciones.length > 0) {
        console.error(`🚨 CONSTRAINT ENGINE V2: ${violaciones.length} violacion(es) de propiedad biomecanica detectada(s):`, JSON.stringify(violaciones));
        return NextResponse.json({
          error: "El plan generado viola restricciones activas del atleta",
          blocked: true,
          reason: "HARD_CONSTRAINT_VIOLATION",
          violaciones
        }, { status: 422 });
      }
      console.log(`✅ CONSTRAINT ENGINE V2: plan verificado contra propiedades [${prohibicionesActivas.join(", ")}], sin violaciones`);
    }

    // Si NO es la semana actual (es una semana futura nueva), se guarda tal cual, sin fusionar con nada existente
    const { error } = await supabase.from("weekly_plan").upsert({
      user_codigo: codigo,
      week_start: plan.week_start,
      week_number: plan.week_number,
      total_weeks_block: plan.total_weeks_block || null,
      block_name: plan.block_name,
      week_objective: plan.week_objective || null,
      status: plan.status || "active",
      confidence: plan.confidence || 100,
      sessions: plan.sessions,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_codigo,week_start" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // FORGE WEEK GENERATION GUARD — registrar esta generacion exitosa en el log de auditoria.
    if (plan.week_start) {
      const { count: countActual } = await supabase.from("weekly_plan_generation_log").select("id", { count: "exact", head: true }).eq("user_codigo", codigo).eq("week_start", plan.week_start);
      await supabase.from("weekly_plan_generation_log").insert({
        user_codigo: codigo,
        week_start: plan.week_start,
        version: (countActual || 0) + 1,
        generation_reason: esSemanaActual ? "regeneracion_semana_actual" : "nueva_semana"
      });
      // NIVEL A — regeneracion/generacion de semana completa, cuenta contra el limite de 2
      await supabase.from("weekly_plan_events").insert({
        user_codigo: codigo,
        week_start: plan.week_start,
        nivel: "A_regeneracion_completa",
        accion: esSemanaActual ? "regenerar_semana" : "generar_semana_nueva",
        motivo: plan.week_objective || null,
        confirmado_por_usuario: true
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "actualizar_sesion_plan") {
    const { dia, cambios, motivo, confidence } = datos;
    // CORRECCIÓN DE RAÍZ: ignorar el week_start que envió el modelo (puede estar mal calculado)
    // y usar siempre el de la semana actual real, igual que hacemos en guardar_plan_semana.
    const ahoraMod = new Date();
    const hoyModStr = ahoraMod.toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
    const hoyModFecha = new Date(hoyModStr + 'T12:00:00');
    const diaSemanaMod = hoyModFecha.getDay() || 7;
    const lunesMod = new Date(hoyModFecha);
    lunesMod.setDate(hoyModFecha.getDate() - diaSemanaMod + 1);
    const week_start = lunesMod.toISOString().split('T')[0];

    const { data: planActual } = await supabase.from("weekly_plan").select("sessions,confidence").eq("user_codigo", codigo).eq("week_start", week_start).single();
    if (!planActual) return NextResponse.json({ error: "Plan no encontrado para la semana actual", week_start_usado: week_start }, { status: 404 });
    const sessions = planActual.sessions.map((s: any) => {
      if (s.dia === dia) {
        return { ...s, ...cambios, modificado: true, motivo_modificacion: motivo || "", modificado_at: new Date().toISOString() };
      }
      return s;
    });
    const updates: any = { sessions, updated_at: new Date().toISOString() };
    if (confidence !== undefined && confidence !== null) {
      updates.confidence = Math.max(0, Math.min(100, confidence));
    }
    await supabase.from("weekly_plan").update(updates).eq("user_codigo", codigo).eq("week_start", week_start);
    return NextResponse.json({ ok: true });
  }

  if (action === "registrar_aprendizaje") {
    const { texto, puntos, categoria } = datos;
    const { data: usuarioActual } = await supabase.from("usuarios").select("aprendizajes_atleta").eq("codigo", codigo).single();
    const aprendizajesActuales = usuarioActual?.aprendizajes_atleta || [];

    // Evitar duplicados: mismo texto ya registrado
    const yaExiste = aprendizajesActuales.some((a: any) => a.texto?.toLowerCase().trim() === (texto || "").toLowerCase().trim());
    if (yaExiste) {
      return NextResponse.json({ ok: true, duplicado: true });
    }

    const nuevoAprendizaje = {
      texto,
      puntos: puntos || 2,
      categoria: categoria || "general",
      fecha: new Date().toISOString()
    };
    const actualizados = [...aprendizajesActuales, nuevoAprendizaje];
    await supabase.from("usuarios").update({ aprendizajes_atleta: actualizados }).eq("codigo", codigo);

    const totalPuntos = 40 + actualizados.reduce((sum: number, a: any) => sum + (a.puntos || 0), 0);
    return NextResponse.json({ ok: true, nuevoAprendizaje, porcentajeTotal: Math.min(totalPuntos, 100) });
  }

  if (action === "recalcular_seguimiento_debilidades") {
    // FORGE WEAKNESS FOLLOW-UP ENGINE — version standalone para verificacion manual/diagnostico,
    // sin necesidad de generar una semana nueva completa. Misma logica exacta que la version
    // integrada en analizar_bloque_semana — determinista e idempotente.
    const { data: usuarioRecalculo } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const { data: exposicionesRecalculo } = await supabase.from("weakness_exposure").select("weakness_id,last_exposure_date").eq("user_codigo", codigo);
    const hoyRecalculo = new Date();
    const desarrolloRecalculado = (usuarioRecalculo?.athlete_development || []).map((d: any) => {
      if (d.estado !== "activa") return d;
      const exposicionReciente = (exposicionesRecalculo || []).find((e: any) => e.weakness_id === d.nombre_visible);
      const fechaReferencia = exposicionReciente?.last_exposure_date || d.ultima_revision || d.detectado;
      const diasSinSeguimiento = fechaReferencia ? Math.floor((hoyRecalculo.getTime() - new Date(fechaReferencia).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      if (diasSinSeguimiento >= 28) {
        return { ...d, estado: "sin_seguimiento" };
      }
      return d;
    });
    await supabase.from("usuarios").update({ athlete_development: desarrolloRecalculado }).eq("codigo", codigo);
    const cambios = desarrolloRecalculado.filter((d: any, i: number) => d.estado !== (usuarioRecalculo?.athlete_development || [])[i]?.estado);
    return NextResponse.json({ ok: true, totalDebilidades: desarrolloRecalculado.length, marcadasSinSeguimiento: cambios.map((c: any) => c.nombre_visible) });
  }

  if (action === "confirmar_estado_debilidad") {
    // FORGE ATHLETE CONFIRMATION — tercera señal, distinta de weakness_exposure ("¿se trabajó?").
    // Esta responde "¿sigue presente la molestia real?" segun confirmacion EXPLICITA del atleta,
    // nunca inferida de que siga entrenando la zona preventivamente. resuelta = "sin sintoma actual
    // reportado", no "nunca volvera" — el atleta puede seguir haciendo trabajo preventivo despues.
    const { nombreVisible, estadoConfirmado } = datos; // estadoConfirmado: "resuelto" | "mejorando" | "igual_o_peor"
    if (!["resuelto", "mejorando", "igual_o_peor"].includes(estadoConfirmado)) {
      return NextResponse.json({ error: "estadoConfirmado invalido" }, { status: 400 });
    }
    const { data: usuarioConfirmacion } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const devConfirmacion = usuarioConfirmacion?.athlete_development || [];
    const idxConfirmacion = devConfirmacion.findIndex((d: any) => d.nombre_visible === nombreVisible);
    if (idxConfirmacion < 0) return NextResponse.json({ ok: true, mensaje: "No encontrado" });

    const devActualizadoConfirmacion = [...devConfirmacion];
    const nuevoEstado = estadoConfirmado === "resuelto" ? "resuelta" : "activa";
    const progresoNuevo = estadoConfirmado === "resuelto" ? 100 : estadoConfirmado === "mejorando" ? Math.min((devConfirmacion[idxConfirmacion].progreso || 0) + 25, 90) : devConfirmacion[idxConfirmacion].progreso || 0;
    devActualizadoConfirmacion[idxConfirmacion] = {
      ...devActualizadoConfirmacion[idxConfirmacion],
      estado: nuevoEstado,
      progreso: progresoNuevo,
      ultima_revision: new Date().toISOString().split('T')[0],
      confirmacion_atleta: estadoConfirmado,
      fecha_confirmacion_atleta: new Date().toISOString().split('T')[0],
    };
    await supabase.from("usuarios").update({ athlete_development: devActualizadoConfirmacion }).eq("codigo", codigo);
    console.log(`✅ ATHLETE CONFIRMATION: "${nombreVisible}" confirmado como "${estadoConfirmado}" por el atleta`);
    return NextResponse.json({ ok: true, nuevoEstado, progresoNuevo });
  }

  if (action === "establecer_password_auth_admin") {
    // FORGE MOBILE — accion administrativa temporal para establecer password directamente via
    // Service Role Key, sin depender del flujo de correo de recovery (que redirige a la landing
    // web en vez de gestionar el token, problema de configuracion de Site URL/Redirect URLs).
    const { authUserId, nuevaPassword } = datos;
    if (!authUserId || !nuevaPassword || nuevaPassword.length < 6) {
      return NextResponse.json({ error: "authUserId y nuevaPassword (min 6 caracteres) requeridos" }, { status: 400 });
    }
    const { data: resultadoAdmin, error: errorAdmin } = await supabase.auth.admin.updateUserById(authUserId, { password: nuevaPassword });
    if (errorAdmin) return NextResponse.json({ error: errorAdmin.message }, { status: 500 });
    console.log(`🔑 PASSWORD ESTABLECIDA (admin): usuario ${authUserId}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "verificar_correccion_disponibilidad_deterministico") {
    // FORGE SAFETY NET — segunda capa de respaldo, independiente del tag [DISPONIBILIDAD_ACTUALIZADA:]
    // que el Coach puede olvidar generar (mismo patron de fragilidad ya visto varias veces esta
    // semana). Se dispara SIEMPRE tras la respuesta a "¿sigue igual tu disponibilidad?", sin importar
    // si el tag aparecio o no — si el tag ya actualizo el dato, esto simplemente confirma lo mismo.
    const { mensajeUsuario, distribucionActual } = datos;
    if (!mensajeUsuario) return NextResponse.json({ ok: true, detectado: false });

    const correccionPrompt = `El atleta respondio a la pregunta "¿sigue igual tu disponibilidad?" con este mensaje: "${mensajeUsuario}"

Disponibilidad actual guardada: ${distribucionActual || "no especificada"}

¿El atleta esta pidiendo un CAMBIO real en su disponibilidad (ej: quitar un dia, añadir uno, cambiar duracion)? Si es asi, responde SOLO con este JSON: {"hayCambio":true,"nuevaDescripcion":"descripcion breve y clara de la disponibilidad CORREGIDA, incorporando el cambio pedido"}
Si el mensaje es solo una confirmacion sin cambios reales, responde: {"hayCambio":false}
Responde SOLO el JSON, sin texto adicional.`;

    try {
      const correccionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: correccionPrompt }] }),
      });
      const correccionData = await correccionRes.json();
      const correccionTexto = correccionData.content?.map((b: any) => b.text || "").join("") || "{}";
      const correccionClean = correccionTexto.replace(/```json|```/g, "").trim();
      const correccionMatch = correccionClean.match(/\{[\s\S]*\}/);
      if (!correccionMatch) return NextResponse.json({ ok: true, detectado: false });
      const extraido = JSON.parse(correccionMatch[0]);

      if (extraido.hayCambio && extraido.nuevaDescripcion) {
        await supabase.from("usuarios").update({ distribucion_semanal: JSON.stringify({ descripcion: extraido.nuevaDescripcion }) }).eq("codigo", codigo);
        console.log(`🛡️ SAFETY NET DISPONIBILIDAD: ${codigo} — "${extraido.nuevaDescripcion}"`);
        return NextResponse.json({ ok: true, detectado: true, actualizado: true, nuevaDescripcion: extraido.nuevaDescripcion });
      }
      return NextResponse.json({ ok: true, detectado: false });
    } catch (err: any) {
      console.error("Error en verificar_correccion_disponibilidad_deterministico:", err);
      return NextResponse.json({ ok: true, detectado: false });
    }
  }

  if (action === "guardar_disponibilidad_actualizada") {
    // FORGE — el Coach genera el tag [DISPONIBILIDAD_ACTUALIZADA:] cuando detecta que el atleta
    // corrigio su disponibilidad real (respondiendo a la pregunta determinista "¿sigue igual?" con
    // un cambio, ej: "no generes el jueves"). Bug real confirmado con evidencia: el Coach entendia
    // correctamente en la conversacion, pero eso nunca se traducia en actualizar distribucion_semanal,
    // asi que la semana generada seguia ignorando el cambio pedido.
    const { descripcion } = datos;
    if (!descripcion) return NextResponse.json({ error: "Falta descripcion" }, { status: 400 });
    // FIX: cambio_permanente:true por defecto era enganoso — una peticion puntual ("no generes
    // el jueves ESTA semana") no deberia asumirse como permanente para siempre. Se elimina el
    // campo, dejando que la propia pregunta de "¿sigue igual tu disponibilidad?" de cada semana
    // sea el punto real de confirmacion/correccion, sin arrastrar un cambio antiguo indefinidamente.
    await supabase.from("usuarios").update({ distribucion_semanal: JSON.stringify({ descripcion }) }).eq("codigo", codigo);
    console.log(`🛡️ DISPONIBILIDAD ACTUALIZADA (via tag del Coach): ${codigo} — "${descripcion}"`);
    return NextResponse.json({ ok: true });
  }

  if (action === "registrar_debilidad_dev") {
    const { area, indicador, nombre_visible, diagnostico, estado, progreso, confianza, prioridad, evidencias, plan_accion, beneficio_esperado } = datos;
    const { data: usuarioActual } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const devActual = usuarioActual?.athlete_development || [];
    const hoy = new Date().toISOString().split('T')[0];

    // FORGE WEAKNESS DEDUPLICATION VALIDATOR — bug real confirmado con evidencia: el Coach
    // registraba el mismo problema real con nombres/indicadores distintos cada vez (ej: 3 registros
    // separados para la misma extension de cadera adelantada en snatch), nunca fusionados porque
    // la deduplicacion anterior solo comparaba "indicador" con igualdad exacta de texto. Ahora se
    // compara semanticamente (misma area + solapamiento real de diagnostico/nombre_visible).
    const resultadoDedup = detectarDebilidadDuplicada(
      { area, indicador, nombre_visible: nombre_visible || indicador, diagnostico: diagnostico || "" },
      devActual.map((d: any) => ({ area: d.area, indicador: d.indicador, nombre_visible: d.nombre_visible, diagnostico: d.diagnostico }))
    );
    if (resultadoDedup.esDuplicadoSemantico) {
      console.log(`🔗 WEAKNESS DEDUP: "${indicador}" fusionado con registro existente — ${resultadoDedup.motivo}`);
    }
    const yaExiste = resultadoDedup.esDuplicadoSemantico ? resultadoDedup.indiceExistente : -1;

    const nuevaEntrada = {
      area, indicador,
      nombre_visible: nombre_visible || indicador,
      diagnostico: diagnostico || "",
      estado: estado || "activa",
      progreso: progreso || (yaExiste >= 0 ? devActual[yaExiste].progreso || 0 : 0),
      confianza: confianza || 60,
      prioridad: prioridad || "media",
      detectado: yaExiste >= 0 ? devActual[yaExiste].detectado : hoy,
      ultima_revision: hoy,
      // Al fusionar, conserva evidencias previas + añade las nuevas (no las pierde por tener otro nombre)
      evidencias: yaExiste >= 0 ? [...(devActual[yaExiste].evidencias || []), ...(evidencias || [])] : (evidencias || []),
      plan_accion: plan_accion || (yaExiste >= 0 ? devActual[yaExiste].plan_accion : []) || [],
      beneficio_esperado: beneficio_esperado || (yaExiste >= 0 ? devActual[yaExiste].beneficio_esperado : []) || []
    };
    let devActualizado;
    if (yaExiste >= 0) {
      devActualizado = [...devActual];
      devActualizado[yaExiste] = nuevaEntrada;
    } else {
      devActualizado = [...devActual, nuevaEntrada];
    }
    await supabase.from("usuarios").update({ athlete_development: devActualizado }).eq("codigo", codigo);
    return NextResponse.json({ ok: true, fusionado: yaExiste >= 0, motivoFusion: resultadoDedup.motivo });
  }

  if (action === "actualizar_debilidad_dev") {
    const { indicador, estado, progreso, confianza, nueva_evidencia } = datos;
    const { data: usuarioActual } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const devActual = usuarioActual?.athlete_development || [];
    const idx = devActual.findIndex((d: any) => d.indicador?.toLowerCase() === indicador?.toLowerCase());
    if (idx < 0) return NextResponse.json({ ok: true, mensaje: "No encontrado" });
    const devActualizado = [...devActual];
    const estadoAnterior = devActualizado[idx].estado;
    const progresoAnterior = devActualizado[idx].progreso || 0;
    const nombreVisible = devActualizado[idx].nombre_visible;
    devActualizado[idx] = {
      ...devActualizado[idx],
      estado: estado || devActualizado[idx].estado,
      progreso: progreso !== undefined ? progreso : devActualizado[idx].progreso,
      confianza: confianza !== undefined ? confianza : devActualizado[idx].confianza,
      ultima_revision: new Date().toISOString().split('T')[0],
      evidencias: nueva_evidencia ? [...devActualizado[idx].evidencias, nueva_evidencia] : devActualizado[idx].evidencias
    };
    await supabase.from("usuarios").update({ athlete_development: devActualizado }).eq("codigo", codigo);

    // FORGE TIMELINE NARRATIVA — si pasó a resuelta, generar evento en Historia + notificacion narrativa
    // que conecta explicitamente el momento de deteccion con el de resolucion.
    if (estado === "resuelta" && estadoAnterior !== "resuelta") {
      const fechaDeteccion = new Date(devActualizado[idx].detectado);
      const diasTrabajado = Math.round((new Date().getTime() - fechaDeteccion.getTime()) / (24*60*60*1000));
      const mesesTrabajado = Math.round(diasTrabajado / 30);
      const tiempoTexto = mesesTrabajado >= 1 ? `hace ${mesesTrabajado} ${mesesTrabajado === 1 ? "mes" : "meses"}` : `hace ${diasTrabajado} días`;

      await supabase.from("athlete_events").insert({
        user_codigo: codigo,
        date: new Date().toISOString().split('T')[0],
        type: "development_complete",
        title: `${devActualizado[idx].nombre_visible} — ${diasTrabajado} días de trabajo`,
        data: { notas: nueva_evidencia||"" }
      });

      // Narrativa conectando pasado y presente, mostrada con la misma notificacion tipo sorpresa
      await supabase.from("forge_discoveries").insert({
        user_codigo: codigo,
        descubrimiento: `📖 ${tiempoTexto} detectamos que tu debilidad era ${devActualizado[idx].nombre_visible.toLowerCase()}. Hoy esa debilidad ya no aparece entre tus prioridades.`,
        categoria: "timeline_narrativa",
        nivel: "recomendacion",
        confianza: 100,
        puntos_evidencia: 0,
        visto: false,
        presentado_al_usuario: false
      });
    }

    return NextResponse.json({ ok: true, nombreVisible, progresoAnterior, progresoNuevo: devActualizado[idx].progreso });
  }

  if (action === "registrar_evento") {
    const { evento } = datos;
    // Deduplicación: verificar si ya existe un evento con mismo tipo+fecha+titulo similar
    const { data: existentes } = await supabase.from("athlete_events").select("id,title").eq("user_codigo", codigo).eq("date", evento.date).eq("type", evento.type);
    const tituloNormalizado = (evento.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const yaExiste = (existentes || []).some((e: any) => (e.title || "").toLowerCase().replace(/[^a-z0-9]/g, "") === tituloNormalizado);
    if (yaExiste) {
      return NextResponse.json({ ok: true, duplicado: true, mensaje: "Evento ya registrado, evitando duplicado" });
    }
    const { error } = await supabase.from("athlete_events").insert({
      user_codigo: codigo,
      date: evento.date,
      type: evento.type,
      title: evento.title || "",
      data: evento.data || {}
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Si es un PR, también añadir a historial_marcas para gráficas
    if (evento.type === "pr" && evento.data) {
      const { data: usuarioActual } = await supabase.from("usuarios").select("historial_marcas").eq("codigo", codigo).single();
      const histMarcas = usuarioActual?.historial_marcas || [];
      // Intentar extraer ejercicio y valor del título o data
      const ejercicioRaw = evento.data.ejercicio || evento.title?.split(/\s+\d/)[0]?.trim() || evento.title;
      const valor = evento.data.valor || evento.title?.match(/[\d.]+\s*kg|[\d:]+/)?.[0] || "";
      if (ejercicioRaw && valor) {
        const ejercicio = ejercicioRaw.toLowerCase()
          .replace(/sentadilla trasera/i, "back_squat")
          .replace(/sentadilla frontal/i, "front_squat")
          .replace(/peso muerto/i, "deadlift")
          .replace(/press banca|press de banca/i, "bench_press")
          .replace(/\s+/g, "_");
        const fechaEvento = evento.date;
        const yaExisteMarca = histMarcas.some((m:any) => m.ejercicio === ejercicio && m.fecha === fechaEvento);
        if (!yaExisteMarca) {
          await supabase.from("usuarios").update({
            historial_marcas: [...histMarcas, { fecha: fechaEvento, ejercicio, valor }]
          }).eq("codigo", codigo);

          // FORGE CARDS — fuente FIABLE de deteccion de PR: el tag [EVENTO:] del propio Coach,
          // en vez de depender del extractor Haiku posterior (que puede fallar de forma inconsistente
          // segun el formato exacto del mensaje del usuario). Calculamos la mejora aqui mismo.
          const marcasAnteriores = histMarcas.filter((m:any) => m.ejercicio === ejercicio);
          const marcaAnterior = marcasAnteriores[marcasAnteriores.length - 1];
          let mejoraCalculada: string | null = null;
          if (marcaAnterior) {
            const numAnterior = parseFloat(marcaAnterior.valor);
            const numNuevo = parseFloat(valor);
            if (!isNaN(numAnterior) && !isNaN(numNuevo) && numNuevo > numAnterior) {
              mejoraCalculada = `${(numNuevo - numAnterior).toFixed(1)}`;
            }
          }
          return NextResponse.json({ ok: true, nuevoPrDetectado: { ejercicio, valor, mejora: mejoraCalculada } });
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "calcular_logros") {
    const { data: usuario } = await supabase.from("usuarios").select("workout_history,historial_marcas,created_at").eq("codigo", codigo).single();
    if (!usuario) return NextResponse.json({ logros: [] });

    const workouts = usuario.workout_history || [];
    const marcas = usuario.historial_marcas || [];
    const logros: any[] = [];

    // Hitos de sesiones (solo si hay suficiente volumen para ser relevante)
    [50, 100, 200].forEach(hito => {
      if (workouts.length >= hito) {
        const sesionHito = [...workouts].sort((a:any,b:any)=>new Date(a.fecha).getTime()-new Date(b.fecha).getTime())[hito-1];
        logros.push({ tipo: `sesiones_${hito}`, emoji: "💯", titulo: `${hito} sesiones completadas`, subtitulo: "Constancia que da resultados", fecha: sesionHito?.fecha || new Date().toISOString() });
      }
    });

    // Solo mejoras reales de marca (mínimo 2 registros, con % de mejora calculado)
    const porEjercicio: Record<string, any[]> = {};
    marcas.forEach((m: any) => {
      if (!porEjercicio[m.ejercicio]) porEjercicio[m.ejercicio] = [];
      porEjercicio[m.ejercicio].push(m);
    });
    Object.entries(porEjercicio).forEach(([ejercicio, registros]) => {
      const ordenados = [...registros].sort((a:any,b:any)=>new Date(a.fecha).getTime()-new Date(b.fecha).getTime());
      for (let i = 1; i < ordenados.length; i++) {
        const actual = ordenados[i];
        const anterior = ordenados[i-1];
        const valorActual = parseFloat(String(actual.valor).replace(/[^\d.]/g,''));
        const valorAnterior = parseFloat(String(anterior.valor).replace(/[^\d.]/g,''));
        if (!isNaN(valorActual) && !isNaN(valorAnterior) && valorAnterior > 0 && valorActual > valorAnterior) {
          const mejoraPct = (((valorActual - valorAnterior) / valorAnterior) * 100).toFixed(1);
          const unidad = String(actual.valor).replace(/[\d.,]/g,'').trim();
          logros.push({
            tipo: `mejora_${ejercicio}_${actual.fecha}`,
            emoji: "📈",
            titulo: `${ejercicio.replace(/_/g,' ')}: ${actual.valor}`,
            subtitulo: `+${mejoraPct}% vs anterior (${anterior.valor})`,
            fecha: actual.fecha
          });
        }
      }
    });

    logros.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return NextResponse.json({ logros });
  }

  if (action === "eliminar_evento") {
    const { eventoId } = datos;
    await supabase.from("athlete_events").delete().eq("id", eventoId).eq("user_codigo", codigo);
    return NextResponse.json({ ok: true });
  }

  if (action === "editar_evento") {
    const { eventoId, date, type, title, notas } = datos;
    await supabase.from("athlete_events").update({
      date, type, title,
      data: { notas: notas || "" }
    }).eq("id", eventoId).eq("user_codigo", codigo);
    return NextResponse.json({ ok: true });
  }

  if (action === "obtener_historia") {
    const { data: eventos } = await supabase
      .from("athlete_events")
      .select("*")
      .eq("user_codigo", codigo)
      .order("date", { ascending: false })
      .limit(100);
    return NextResponse.json({ eventos: eventos || [] });
  }

  if (action === "calcular_adherencia") {
    const { data: usuario } = await supabase.from("usuarios").select("perfil,workout_history,ciclo_actual").eq("codigo", codigo).single();
    if (!usuario) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const workouts = usuario.workout_history || [];
    const perfil = usuario.perfil || {};
    const ciclo = usuario.ciclo_actual || {};

    const diasStr = perfil.dias || "3 dias";
    const diasSemana = parseInt(diasStr) || 3;

    const ahora = new Date();
    const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace28 = new Date(ahora.getTime() - 28 * 24 * 60 * 60 * 1000);

    const sesiones7 = workouts.filter((w: any) => new Date(w.fecha) >= hace7).length;
    const sesiones28 = workouts.filter((w: any) => new Date(w.fecha) >= hace28).length;

    const planificadas7 = diasSemana;
    const planificadas28 = diasSemana * 4;

    const semanasCiclo = ciclo.semana || 1;
    const sesionesBloque = workouts.filter((w: any) => {
      const fechaInicioCiclo = new Date(ahora.getTime() - (semanasCiclo * 7 * 24 * 60 * 60 * 1000));
      return new Date(w.fecha) >= fechaInicioCiclo;
    }).length;
    const planificadasBloque = diasSemana * semanasCiclo;

    const adherencia7 = Math.min(100, Math.round((sesiones7 / planificadas7) * 100));
    const adherencia28 = Math.min(100, Math.round((sesiones28 / planificadas28) * 100));
    const adherenciaBloque = Math.min(100, Math.round((sesionesBloque / planificadasBloque) * 100));

    return NextResponse.json({ adherencia7, adherencia28, adherenciaBloque, diasSemana });
  }

  if (action === "admin_stats") {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - (hoy.getDay()===0?6:hoy.getDay()-1));

    const { data: todos } = await supabase.from("usuarios").select("codigo,categoria,especialidad,premium,admin,created_at,updated_at,consultas_usadas,total_visitas,ultima_visita,primera_sesion_at");
    if (!todos) return NextResponse.json({ error: "Error" }, { status: 500 });

    const total = todos.length;
    const premium = todos.filter((u: any) => u.premium).length;
    const activos = todos.filter((u: any) => u.updated_at && new Date(u.updated_at) > new Date(hace7dias)).length;
    const inactivos = todos.filter((u: any) => !u.updated_at || new Date(u.updated_at) <= new Date(hace7dias)).length;
    const enLimite = todos.filter((u: any) => {
      if(!u.created_at || u.premium || u.admin) return false;
      const diasUsados = Math.floor((new Date().getTime() - new Date(u.created_at).getTime()) / (1000*60*60*24));
      return diasUsados >= 10;
    }).length;
    const unaVisita = todos.filter((u: any) => !u.total_visitas || u.total_visitas <= 1).length;
    const recurrentes = todos.filter((u: any) => u.total_visitas > 1).length;
    const nuevosHoy = todos.filter((u: any) => {
      if(!u.created_at) return false;
      const fechaCreacion = new Date(u.created_at);
      return fechaCreacion.toDateString() === new Date().toDateString();
    }).length;
    const nuevosSemana = todos.filter((u: any) => u.created_at && new Date(u.created_at) >= inicioSemana).length;
    const ultimos = [...todos].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

    // Activación: usuarios que completaron al menos 1 sesión
    const activados = todos.filter((u: any) => u.primera_sesion_at).length;
    const tasaActivacion = total > 0 ? Math.round((activados / total) * 100) : 0;

    return NextResponse.json({ total, premium, activos, inactivos, enLimite, nuevosHoy, nuevosSemana, ultimos, unaVisita, recurrentes, activados, tasaActivacion });
  }

  // Llamada normal a la IA con timeout de 120 segundos (aumentado por prompts largos con Estado Canonico + plan semanal completo)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "La respuesta está tardando demasiado. Inténtalo de nuevo." }, { status: 504 });
    }
    throw err;
  }
  clearTimeout(timeoutId);

  const data = await response.json();
  return NextResponse.json(data);
}