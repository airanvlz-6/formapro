import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";
import { validateExtraction } from "@/lib/validators/extractionRules";
import { buildCatalogoPrompt, validarCatalogoDisciplina } from "@/lib/sports/disciplineCatalog";
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
  // FUENTE ATOMICA: physiology_records reemplaza el JSON historial_fisiologico, elimina RMW
  const { data: fisioRecords } = await supabase.from("physiology_records").select("fecha,hrv,sueno,rhr,fatiga_aguda").eq("user_codigo", codigo).order("fecha", { ascending: false }).limit(30);
  const historialFisiologicoAtomico = (fisioRecords || []).map((r: any) => ({ fecha: r.fecha, hrv: r.hrv, sueno: r.sueno, rhr: r.rhr, fatiga_aguda: r.fatiga_aguda }));

  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const sesionHoy = plan?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaHoy));
  const sesionManana = plan?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaManana));

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
- GENERAR_SEMANA_COMPLETA (familia PLAN): pide generar, crear, planificar o preparar la SEMANA COMPLETA (7 dias) de entrenamiento, ya sea la proxima semana o una nueva planificacion completa
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

  // FORGE ATHLETE SNAPSHOT — construye el estado real y auditable del atleta que TODOS los componentes
// del Orchestrator deben recibir. Elimina la pregunta "¿esta usando mis datos?" haciendola verificable
// en los logs. Incluye ultimas sesiones reales, volumen reciente por disciplina, y marcas.
async function buildAthleteSnapshot(supabase: any, codigo: string) {
  const { data: usuario } = await supabase.from("usuarios").select("workout_history,marcas_especificas,estado_fisiologico").eq("codigo", codigo).single();
  const workoutHistory = usuario?.workout_history || [];
  const ultimas5Sesiones = workoutHistory.slice(-5).map((w: any) => ({ tipo: w.tipo, fecha: w.fecha, sensacion: w.sensacion }));

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
    const { data: usuarioAnalyzer } = await supabase.from("usuarios").select("ciclo_actual,athlete_development,distribucion_semanal,categoria,especialidad,objetivo_principal,perfil").eq("codigo", codigo).single();

    const debilidadesActivas = (usuarioAnalyzer?.athlete_development || []).filter((d: any) => d.estado !== "resuelta");

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
    const { data: coachingNotesPendientes } = await supabase.from("athlete_coaching_notes")
      .select("id,type,domain,movement,issue,priority,confidence,veces_mencionado")
      .eq("user_codigo", codigo)
      .in("status", ["pending", "considerada"])
      .order("confidence", { ascending: false })
      .limit(5);

    let coachingNotesTexto = "";
    if (coachingNotesPendientes && coachingNotesPendientes.length > 0) {
      coachingNotesTexto = `\nOBSERVACIONES TECNICAS PENDIENTES (registradas en conversacion, NUNCA aplicadas todavia a ninguna sesion — evalua si alguna encaja con el bloque/fase actual y merece incorporarse esta semana):\n${coachingNotesPendientes.map((n: any) => `- [${n.movement || n.domain || "general"}] ${n.issue} (mencionado ${n.veces_mencionado}x, confianza ${n.confidence})`).join("\n")}`;
    }

    // FIX CRITICO DE RAIZ: el Block Analyzer nunca recibia especialidad ni objetivo del atleta,
    // generando estructuras genericas sin anclaje a la disciplina real (ej: CrossFit/halterofilia).
    const analyzerPrompt = `Eres un analizador de bloques de entrenamiento. Tu ÚNICA tarea es devolver un JSON pequeño describiendo la estructura de la PRÓXIMA semana. NO generes entrenamientos ni sesiones detalladas.

CONTEXTO OBLIGATORIO — RESPETAR SIEMPRE:
Categoría/especialidad del atleta: ${usuarioAnalyzer?.especialidad || usuarioAnalyzer?.categoria || "no especificada"} (la estructura semanal DEBE incluir las disciplinas propias de esta especialidad — si es hibrido/crossfit, incluye halterofilia y gimnasticos; si incluye running, incluye sesiones de carrera; etc.)
Objetivo principal: ${JSON.stringify(usuarioAnalyzer?.objetivo_principal) || "no especificado"}
Ciclo actual: ${JSON.stringify(estado.ciclo)}
Debilidad prioritaria activa: ${debilidadPrioritaria ? debilidadPrioritaria.nombre_visible : "ninguna"}
Disponibilidad: ${usuarioAnalyzer?.distribucion_semanal || "no especificada"}
${metodosYaProbadosTexto}
${coachingNotesTexto}

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
    const { dia, tipo, titulo_breve, analisis: analisisSesion, debilidad_relacionada, focus, volume, intensity, conditioning, diaAnterior, diaSiguiente, trabaja_debilidad } = datos;
    const { data: usuarioBuilder } = await supabase.from("usuarios").select("especialidad,categoria,perfil,marcas_especificas,athlete_development,datos_entrenamiento").eq("codigo", codigo).single();
    console.log(`CHECKPOINT construir_sesion_dia [${dia}]: usuarioBuilder obtenido`);

    const debilidadInfo = (usuarioBuilder?.athlete_development || []).find((d: any) => d.nombre_visible === debilidad_relacionada);

    // FORGE ATHLETE SNAPSHOT — contexto real y auditable del atleta, elimina la duda de "¿usa mis datos?"
    // COLD-START SAFE: envuelto en try/catch propio, un usuario nuevo sin historial no debe bloquear el flujo.
    let snapshot: any = { ultimas_5_sesiones: [], sesiones_ultimos_7_dias: 0, volumen_carrera_7dias: 0, volumen_box_7dias: 0, marcas: {}, fatiga_actual: null };
    try {
      snapshot = await buildAthleteSnapshot(supabase, codigo);
    } catch (errSnapshot) {
      console.error(`CHECKPOINT construir_sesion_dia [${dia}]: ERROR en snapshot, usando snapshot vacio:`, errSnapshot);
    }
    console.log(`CHECKPOINT construir_sesion_dia [${dia}]: snapshot listo`);

    // FORGE SESSION ENGINE (v1): el Session Builder ya no inventa la estructura desde cero.
    // Recibe la INTENCION exacta que ya decidio el Week Planner y solo la desarrolla en detalle.
    const builderPrompt = `Eres un constructor de sesiones de entrenamiento. Tu ÚNICA tarea es DESARROLLAR EN DETALLE
la sesion segun la intencion ya decidida — NO inventes una estructura distinta, solo redacta el contenido
especifico (ejercicios, series, reps, cargas) que cumpla exactamente esta intencion.

DÍA: ${dia}
TIPO DE SESIÓN: ${tipo}
IDEA GENERAL: ${titulo_breve}
INTENCION YA DECIDIDA (respeta esto, no la cambies):
- Foco/movimiento principal: ${focus || "no especificado"}
- Volumen: ${volume || "medio"}
- Intensidad: ${intensity || "no especificada"}
- Condicionamiento metabolico: ${conditioning || "ninguno"}
CONTEXTO DEL BLOQUE: ${JSON.stringify(analisisSesion)}
ESPECIALIDAD: ${usuarioBuilder?.especialidad || usuarioBuilder?.categoria}
MARCAS DEL ATLETA: ${JSON.stringify(usuarioBuilder?.marcas_especificas || {})}
${debilidadInfo ? `DEBILIDAD A TRABAJAR HOY: ${debilidadInfo.nombre_visible} — ${debilidadInfo.diagnostico}` : ""}

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
${diaAnterior ? `Dia anterior (${diaAnterior.dia}): ${diaAnterior.focus || diaAnterior.titulo_breve}, intensidad ${diaAnterior.intensity || "no especificada"}` : "Sin dato de dia anterior"}
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

    const domingoSemanaCheck = new Date(lunesCheck);
    domingoSemanaCheck.setDate(lunesCheck.getDate() + 6);
    const semanaTerminadaCronologicamenteCheck = hoyCheckFecha.getTime() > domingoSemanaCheck.getTime();

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
    const domingoDeEstaSemana = new Date(lunesCierre);
    domingoDeEstaSemana.setDate(lunesCierre.getDate() + 6);
    const semanaTerminadaCronologicamente = hoyCierreFecha.getTime() > domingoDeEstaSemana.getTime();

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
    // FORGE PENDING ACTIONS — cuando el Coach propone un cambio (modificar sesion, etc.), se guarda
    // AQUI como propuesta pendiente, ANTES de que el usuario confirme. El guardado real NUNCA depende
    // de que el LLM recuerde generar un tag tras la confirmacion — el backend ya tiene todo lo necesario.
    const { tipo, accion } = datos;
    // Expirar automaticamente cualquier pending anterior del mismo tipo sin resolver (evita acumular)
    await supabase.from("pending_actions").update({ estado: "expirado" }).eq("user_codigo", codigo).eq("tipo", tipo).eq("estado", "pendiente");
    const { data: nuevaPending, error } = await supabase.from("pending_actions").insert({
      user_codigo: codigo, tipo, accion, estado: "pendiente"
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
          return { ...s, tipo: acc.tipo, titulo: acc.titulo, descripcion: acc.descripcion, modificado: true, motivo_modificacion: acc.motivo || "", modificado_at: new Date().toISOString(), completada: s.completada ?? false };
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
    }

    await supabase.from("pending_actions").update({ estado: "ejecutado", resuelto_at: new Date().toISOString() }).eq("id", pendiente.id);
    return NextResponse.json({ ok: true, ejecutado: true, tipo: pendiente.tipo });
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
{"es_observacion":true_o_false,"type":"weakness|intencion","domain":"olympic_lifting|running|strength|conditioning|mobility|otro","movement":"nombre del movimiento o area especifica, o null","issue":"resumen breve y factual del problema/objetivo en pocas palabras","priority":"alta|normal|baja"}

Mensaje: "${mensaje}"

"es_observacion" debe ser false para preguntas simples, reportes de entreno sin problema mencionado, o mensajes sin contenido tecnico relevante. Nunca inventes datos que el mensaje no contenga.`;

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

    return NextResponse.json({ ok: true, detectado: true, guardado: true, valores: valoresGuardar, fecha: hoySueno });
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
          const nuevaSemana = cicloIncr.semana + 1;
          await supabase.from("usuarios").update({ ciclo_actual: { ...cicloIncr, semana: nuevaSemana } }).eq("codigo", codigo);
          console.log(`CICLO ACTUAL: semana incrementada automaticamente de ${cicloIncr.semana} a ${nuevaSemana} al generar nueva semana ${plan.week_start}`);
        }
      } catch (errIncrCiclo) {
        console.error("Error incrementando ciclo_actual.semana:", errIncrCiclo);
      }
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

  if (action === "registrar_debilidad_dev") {
    const { area, indicador, nombre_visible, diagnostico, estado, progreso, confianza, prioridad, evidencias, plan_accion, beneficio_esperado } = datos;
    const { data: usuarioActual } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
    const devActual = usuarioActual?.athlete_development || [];
    const yaExiste = devActual.findIndex((d: any) => d.indicador?.toLowerCase() === indicador?.toLowerCase());
    const hoy = new Date().toISOString().split('T')[0];
    const nuevaEntrada = {
      area, indicador,
      nombre_visible: nombre_visible || indicador,
      diagnostico: diagnostico || "",
      estado: estado || "activa",
      progreso: progreso || 0,
      confianza: confianza || 60,
      prioridad: prioridad || "media",
      detectado: yaExiste >= 0 ? devActual[yaExiste].detectado : hoy,
      ultima_revision: hoy,
      evidencias: evidencias || [],
      plan_accion: plan_accion || [],
      beneficio_esperado: beneficio_esperado || []
    };
    let devActualizado;
    if (yaExiste >= 0) {
      devActualizado = [...devActual];
      devActualizado[yaExiste] = nuevaEntrada;
    } else {
      devActualizado = [...devActual, nuevaEntrada];
    }
    await supabase.from("usuarios").update({ athlete_development: devActualizado }).eq("codigo", codigo);
    return NextResponse.json({ ok: true });
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