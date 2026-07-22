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