import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Proteger el endpoint con un secreto simple para que no lo ejecute cualquiera
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = new Date();
  const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Buscar todos los Beta Founders con premium activo cuyo premium_until ya expiró (o está a punto)
  const { data: founders } = await supabase
    .from("usuarios")
    .select("codigo,premium_until,ultima_renovacion_beta,workout_history,historial_fisiologico,historial,renovaciones_beta_completadas")
    .eq("is_beta_founder", true)
    .eq("premium", true)
    .lte("premium_until", ahora.toISOString());

  if (!founders || founders.length === 0) {
    return NextResponse.json({ ok: true, revisados: 0, mensaje: "No hay founders pendientes de revisión" });
  }

  const resultados: any[] = [];

  for (const usuario of founders) {
    // Si ya completó las 3 renovaciones, no se toca más (tiene precio especial, ya no depende de esta lógica)
    if ((usuario.renovaciones_beta_completadas || 0) >= 3) {
      resultados.push({ codigo: usuario.codigo, accion: "ciclo_completado_omitido" });
      continue;
    }

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
      const nuevaFecha = new Date(ahora);
      nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
      const alcanzaPrecioEspecial = nuevasRenovaciones >= 3;
      await supabase.from("usuarios").update({
        premium_until: nuevaFecha.toISOString(),
        ultima_renovacion_beta: ahora.toISOString(),
        renovaciones_beta_completadas: nuevasRenovaciones,
        precio_especial_founder: alcanzaPrecioEspecial
      }).eq("codigo", usuario.codigo);
      resultados.push({ codigo: usuario.codigo, accion: "renovado", renovaciones: nuevasRenovaciones });
    } else {
      await supabase.from("usuarios").update({ premium: false }).eq("codigo", usuario.codigo);
      resultados.push({ codigo: usuario.codigo, accion: "premium_revocado", actividad: actividadTotal });
    }
  }

  return NextResponse.json({ ok: true, revisados: founders.length, resultados });
}