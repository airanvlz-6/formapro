/** Existing outcome projection moved out of the cycle writer. No progression authority. */
export async function prepareCompletedBlockOutcome(supabase: any, codigo: string, cicloIncr: any) {
  if (!cicloIncr || typeof cicloIncr.semana !== 'number') return null;
  const totalSemanasCiclo = cicloIncr.totalSemanas || 4;
  const superariaLimite = cicloIncr.semana >= totalSemanasCiclo;
  let outcomePreparado: Record<string, unknown> | null = null;
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

              outcomePreparado = {
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
              };
            } catch (errBlockOutcome) {
              console.error("Error guardando block_outcome deterministico:", errBlockOutcome);
            }
          }

  return outcomePreparado;
}
