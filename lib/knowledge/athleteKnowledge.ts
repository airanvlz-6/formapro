// FORGE KNOWLEDGE ENGINE — athleteKnowledge.ts
// Cada funcion responde UNA unica pregunta determinista sobre el atleta.
// Nunca razona, nunca decide. Solo informa. El Coach decide que hacer con la informacion.
// Si mañana cambia la base de datos, solo cambian estas funciones — el resto de Forge no se entera.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getCurrentObjective(codigo: string): Promise<string | null> {
  const { data } = await supabase.from("usuarios").select("objetivo_principal").eq("codigo", codigo).single();
  return data?.objetivo_principal?.descripcion || null;
}

export async function getCurrentBlock(codigo: string): Promise<{ bloque: string; semana: number; totalSemanas: number } | null> {
  const { data } = await supabase.from("usuarios").select("ciclo_actual").eq("codigo", codigo).single();
  const ciclo = data?.ciclo_actual;
  if (!ciclo?.bloque) return null;
  return { bloque: ciclo.bloque, semana: ciclo.semana, totalSemanas: ciclo.totalSemanas };
}

export async function getActiveWeaknesses(codigo: string): Promise<string[]> {
  const { data } = await supabase.from("usuarios").select("athlete_development").eq("codigo", codigo).single();
  const dev = data?.athlete_development || [];
  return dev.filter((d: any) => d.estado !== "resuelta").map((d: any) => d.nombre_visible || d.indicador);
}

export async function getLatestInsight(codigo: string): Promise<string | null> {
  const { data } = await supabase.from("athlete_events").select("data").eq("user_codigo", codigo).eq("type", "forge_insight").order("date", { ascending: false }).limit(1).single();
  return data?.data?.notas || null;
}

export async function getLatestWorkout(codigo: string): Promise<{ tipo: string; fecha: string; notas: string } | null> {
  const { data } = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
  const historia = data?.workout_history || [];
  if (historia.length === 0) return null;
  const ultimo = historia[historia.length - 1];
  return { tipo: ultimo.tipo, fecha: ultimo.fecha, notas: ultimo.notas };
}

export async function getRecoveryStatus(codigo: string): Promise<{ hrv: number | null; sueno: number | null; tendencia: string | null } | null> {
  const { data } = await supabase.from("usuarios").select("estado_fisiologico").eq("codigo", codigo).single();
  const estado = data?.estado_fisiologico;
  if (!estado) return null;
  return { hrv: estado.hrv, sueno: estado.sueno, tendencia: estado.tendencia };
}

// NUEVA — necesaria para el intent BENCHMARK del Knowledge Router
export async function getBenchmark(codigo: string, nombreEjercicio?: string): Promise<any> {
  const { data } = await supabase.from("usuarios").select("historial_marcas,marcas_especificas").eq("codigo", codigo).single();
  const historialMarcas = data?.historial_marcas || [];
  if (!nombreEjercicio) return { marcas_especificas: data?.marcas_especificas || {}, historial_reciente: historialMarcas.slice(-10) };
  const normalizado = nombreEjercicio.toLowerCase().replace(/\s+/g, "_");
  const coincidencias = historialMarcas.filter((m: any) => m.ejercicio?.includes(normalizado) || normalizado.includes(m.ejercicio));
  return coincidencias.length > 0 ? coincidencias[coincidencias.length - 1] : null;
}

// NUEVA — necesaria para el intent PLAN_SEMANA del Knowledge Router
export async function getWeekPlan(codigo: string): Promise<any> {
  const hoy = new Date();
  const diaSemana = hoy.getDay() || 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diaSemana + 1);
  const weekStart = lunes.toISOString().split('T')[0];
  const { data } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStart).single();
  return data || null;
}

// Punto de entrada unico: recopila todo el conocimiento relevante en un solo objeto compacto.
export async function buildAthleteKnowledge(codigo: string) {
  const [objective, block, weaknesses, latestInsight, latestWorkout, recovery] = await Promise.all([
    getCurrentObjective(codigo),
    getCurrentBlock(codigo),
    getActiveWeaknesses(codigo),
    getLatestInsight(codigo),
    getLatestWorkout(codigo),
    getRecoveryStatus(codigo)
  ]);
  return { objective, block, weaknesses, latestInsight, latestWorkout, recovery };
}

// FORGE KNOWLEDGE ROUTER — mapea cada intent detectado por el Intent Classifier
// a la funcion exacta del Knowledge Engine que debe responderlo. El Coach ya no
// "busca" informacion: el Router se la entrega ya resuelta segun la intencion.
export async function knowledgeRouter(codigo: string, intent: string, entidad?: string): Promise<any> {
  switch (intent) {
    case "OBJETIVO":
      return { tipo: "objetivo_principal", valor: await getCurrentObjective(codigo) };
    case "DEBILIDADES":
      return { tipo: "debilidades_activas", valor: await getActiveWeaknesses(codigo) };
    case "ULTIMO_INSIGHT":
      return { tipo: "ultimo_insight", valor: await getLatestInsight(codigo) };
    case "HISTORIAL_FISIOLOGICO":
      return { tipo: "estado_recuperacion", valor: await getRecoveryStatus(codigo) };
    case "BENCHMARK":
      return { tipo: "benchmark", valor: await getBenchmark(codigo, entidad) };
    case "PLAN_SEMANA":
      return { tipo: "plan_semana", valor: await getWeekPlan(codigo) };
    default:
      return null; // El intent no corresponde a una consulta de Knowledge Engine (ej: PLAN_HOY/MANANA se resuelven via Estado Canonico)
  }
}