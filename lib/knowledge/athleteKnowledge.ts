// FORGE KNOWLEDGE ENGINE — athleteKnowledge.ts
// Cada funcion responde UNA unica pregunta determinista sobre el atleta.
// Nunca razona, nunca decide. Solo informa. El Coach decide que hacer con la informacion.

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

export async function getBenchmark(codigo: string, nombreEjercicio?: string): Promise<any> {
  const { data } = await supabase.from("usuarios").select("historial_marcas,marcas_especificas").eq("codigo", codigo).single();
  const historialMarcas = data?.historial_marcas || [];
  if (!nombreEjercicio) return { marcas_especificas: data?.marcas_especificas || {}, historial_reciente: historialMarcas.slice(-10) };
  const normalizado = nombreEjercicio.toLowerCase().replace(/\s+/g, "_");
  const coincidencias = historialMarcas.filter((m: any) => m.ejercicio?.includes(normalizado) || normalizado.includes(m.ejercicio));
  return coincidencias.length > 0 ? coincidencias[coincidencias.length - 1] : null;
}

export async function getWeekPlan(codigo: string): Promise<any> {
  const hoy = new Date();
  const diaSemana = hoy.getDay() || 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diaSemana + 1);
  const weekStart = lunes.toISOString().split('T')[0];
  const { data } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStart).single();
  return data || null;
}

// NUEVA — Objetivos vivos: calcula un porcentaje de progreso real hacia el objetivo del atleta,
// combinando adherencia reciente y evolucion de debilidades activas. No es exacto pero es honesto:
// se basa en datos reales, nunca en una estimacion inventada por el LLM.
export async function getObjectiveProgress(codigo: string): Promise<{ percentage: number; daysRemaining: number | null } | null> {
  const { data } = await supabase.from("usuarios").select("objetivo_principal,workout_history,athlete_development,fecha_registro").eq("codigo", codigo).single();
  const objetivo = data?.objetivo_principal;
  if (!objetivo?.fecha) return null;

  const hoy = new Date();
  const fechaObjetivo = new Date(objetivo.fecha);
  const diasRestantes = Math.round((fechaObjetivo.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
  if (diasRestantes < 0) return { percentage: 100, daysRemaining: 0 };

  const workoutHistory = data?.workout_history || [];
  const hace28dias = new Date(hoy.getTime() - 28 * 24 * 60 * 60 * 1000);
  const sesionesRecientes = workoutHistory.filter((w: any) => new Date(w.fecha) >= hace28dias).length;
  const adherenciaScore = Math.min(sesionesRecientes / 16, 1) * 40;

  const desarrollo = data?.athlete_development || [];
  const resueltas = desarrollo.filter((d: any) => d.estado === "resuelta").length;
  const totalDebilidades = desarrollo.length || 1;
  const debilidadesScore = (resueltas / totalDebilidades) * 30;

  // FIX: tiempoScore era un valor fijo (30) sin ningun calculo real, causando que atletas con
// fechas de objetivo completamente distintas mostraran el mismo porcentaje. Ahora se calcula
// genuinamente segun el avance temporal real: tiempo transcurrido vs tiempo total hasta el objetivo.
// Usa fecha_inicio REAL del objetivo (registrada al establecerlo/cambiarlo) — nunca un proxy
  // generico, para que un cambio de objetivo a mitad de camino no arrastre una fecha incorrecta.
  let tiempoScore = 15; // valor conservador si el objetivo no tiene fecha_inicio registrada aun
  if (objetivo.fecha_inicio) {
    const fechaInicio = new Date(objetivo.fecha_inicio);
    const tiempoTotalMs = fechaObjetivo.getTime() - fechaInicio.getTime();
    const tiempoTranscurridoMs = hoy.getTime() - fechaInicio.getTime();
    if (tiempoTotalMs > 0) {
      const avanceTemporal = Math.max(0, Math.min(tiempoTranscurridoMs / tiempoTotalMs, 1));
      tiempoScore = avanceTemporal * 30;
    }
  }

  const percentage = Math.round(Math.min(adherenciaScore + debilidadesScore + tiempoScore, 100));
  return { percentage, daysRemaining: diasRestantes };
}

export async function buildAthleteKnowledge(codigo: string) {
  const [objective, block, weaknesses, latestInsight, latestWorkout, recovery, objectiveProgress] = await Promise.all([
    getCurrentObjective(codigo),
    getCurrentBlock(codigo),
    getActiveWeaknesses(codigo),
    getLatestInsight(codigo),
    getLatestWorkout(codigo),
    getRecoveryStatus(codigo),
    getObjectiveProgress(codigo)
  ]);
  return { objective, block, weaknesses, latestInsight, latestWorkout, recovery, objectiveProgress };
}

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
      return null;
  }
}