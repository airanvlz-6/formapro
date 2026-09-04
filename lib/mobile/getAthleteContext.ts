// FORGE MOBILE — getAthleteContext.ts
// Replica EXACTAMENTE el mismo contexto que la web construye en su estado de React antes de
// llamar a buildPrompt(). Este archivo es NUEVO y AISLADO — no toca ni depende de FormaPro.tsx.
// Contrato de equivalencia documentado en FORGE_BUILDPROMPT_CONTRATO_EQUIVALENCIA.md

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Replica minima de CATEGORIAS (solo lo que buildPrompt necesita: id y titulo)
const CATEGORIAS_MOBILE: Record<string, { id: string; titulo: string }> = {
  crossfit: { id: "crossfit", titulo: "CrossFit / Funcional" },
  running: { id: "running", titulo: "Running" },
  hyrox: { id: "hyrox", titulo: "Hyrox" },
  fuerza: { id: "fuerza", titulo: "Fuerza / Halterofilia" },
  triatlon: { id: "triatlon", titulo: "Triatlón" },
  ciclismo: { id: "ciclismo", titulo: "Ciclismo" },
  otro: { id: "otro", titulo: "Entrenamiento general" },
};

export async function getAthleteContext(codigo: string) {
  // Query principal — replica exactamente los campos que la web carga en recuperarUsuario/useEffect
  const { data: u, error } = await supabase
    .from("usuarios")
    .select("categoria,especialidad,perfil,marcas,historial,lesiones_actuales,plan_proxima_semana,notas_coach,ciclo_actual,perfil_psicologico,premium,admin,athlete_state,datos_entrenamiento,distribucion_semanal,objetivo_principal,debilidades,analisis_bloques")
    .eq("codigo", codigo)
    .single();

  if (error || !u) {
    throw new Error(`getAthleteContext: usuario no encontrado para codigo=${codigo}`);
  }

  // resumen (historialResumen) — replica EXACTA de como la web construye este string desde
  // historial.slice(-6), incluyendo el mismo formato y truncado a 150 caracteres.
  const historial = u.historial || [];
  const resumen = historial.slice(-6).map((m: any) =>
    `${m.role === "user" ? "Usuario" : "Coach"}: ${typeof m.content === "string" ? m.content.substring(0, 150) : "[imagen/archivo]"}...`
  ).join("\n");

  // catObj — derivado de especialidad/categoria, replicando CATEGORIAS_MOBILE
  const catKey = u.especialidad || u.categoria;
  const catObj = CATEGORIAS_MOBILE[catKey] || CATEGORIAS_MOBILE.otro;

  // memoriaCoach — combina 3 columnas separadas en el mismo objeto que espera buildPrompt
  const memoriaCoach = {
    lesiones: u.lesiones_actuales || "",
    plan: u.plan_proxima_semana || "",
    notas: u.notas_coach || "",
  };

  // planSemanal — requiere query separada a weekly_plan (misma logica que obtener_plan_semana)
  const ahoraCtx = new Date();
  const hoyCtxStr = ahoraCtx.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const hoyCtxFecha = new Date(hoyCtxStr + 'T12:00:00');
  const diaSemCtx = hoyCtxFecha.getDay() || 7;
  const lunesCtx = new Date(hoyCtxFecha);
  lunesCtx.setDate(hoyCtxFecha.getDate() - diaSemCtx + 1);
  const weekStartCtx = lunesCtx.toISOString().split('T')[0];
  const { data: planSemanaData } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStartCtx).single();
  const planSemanal = planSemanaData || null;

  // blockOutcomes — replica EXACTA de la accion obtener_block_outcomes ya existente
  const { data: blockOutcomesData } = await supabase.from("block_outcomes").select("*").eq("user_codigo", codigo).order("fecha_fin", { ascending: false }).limit(10);
  const blockOutcomes = blockOutcomesData || [];

  // estadoCanonico — la funcion generarEstadoCanonico() es INTERNA de route.ts (sin "export"),
  // no se puede importar directamente. Reutilizamos la accion HTTP ya existente "obtener_estado_canonico"
  // que ya expone exactamente el mismo resultado — cero duplicacion de logica.
  const estadoCanonicoRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.forgeapp.es'}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "obtener_estado_canonico", codigo }),
  });
  const estadoCanonicoData = await estadoCanonicoRes.json();
  const estadoCanonico = estadoCanonicoData?.estado || {};

  return {
    catObj,
    perfil: u.perfil || {},
    marcas: u.marcas || [],
    resumen,
    memoriaCoach,
    cicloActual: u.ciclo_actual || {},
    perfilPsicologico: u.perfil_psicologico || {},
    esPremiumOAdmin: !!(u.premium || u.admin),
    athleteState: u.athlete_state || {},
    datosEntrenamiento: u.datos_entrenamiento || {},
    estadoFisiologico: {
      fatiga_aguda: estadoCanonico?.recovery?.subjective?.acuteFatigue ?? undefined,
      tendencia: estadoCanonico?.recovery?.subjective?.trend ?? undefined,
    },
    historialFisiologico: [],
    distribucionSemanal: u.distribucion_semanal || "",
    objetivoPrincipal: u.objetivo_principal || {},
    planSemanal,
    debilidades: u.debilidades || [],
    blockOutcomes,
    estadoCanonico,
    historial, // se devuelve tambien el historial completo para construir el array de messages
  };
}