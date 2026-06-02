import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 500 });
  }

  const { messages, system, model, max_tokens, action, codigo, datos, email } = await req.json();

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
    return NextResponse.json({ data });
  }

  // Actualizar historial y marcas
  if(action==="recuperar_por_email"){
  const{data,error}=await supabase.from("usuarios").select("codigo").eq("email",email||"").single();
  if(error) return NextResponse.json({error:"No encontrado"},{status:404});
  return NextResponse.json({data});
}
  if (action === "actualizar_usuario") {
    const { error } = await supabase
      .from("usuarios")
      .update({ ...datos, updated_at: new Date().toISOString() })
      .eq("codigo", codigo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "admin_stats") {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const inicioSemana = new Date(ahora.setDate(ahora.getDate() - ahora.getDay() + 1)).toISOString();
    const hoy = new Date(); hoy.setHours(0,0,0,0);

    const { data: todos } = await supabase.from("usuarios").select("codigo,categoria,especialidad,premium,admin,created_at,updated_at,limite_consultas,consultas_usadas,total_visitas,ultima_visita");
    if (!todos) return NextResponse.json({ error: "Error" }, { status: 500 });

    const total = todos.length;
    const premium = todos.filter((u: any) => u.premium).length;
    const activos = todos.filter((u: any) => u.updated_at && new Date(u.updated_at) > new Date(hace7dias)).length;
    const inactivos = todos.filter((u: any) => !u.updated_at || new Date(u.updated_at) <= new Date(hace7dias)).length;
    const enLimite = todos.filter((u: any) => {
      const consultas = u.consultas_usadas || 0;
      const limite = u.limite_consultas || 8;
      return !u.premium && !u.admin && consultas >= limite;
    }).length;
    const unaVisita = todos.filter((u: any) => !u.total_visitas || u.total_visitas <= 1).length;
    const recurrentes = todos.filter((u: any) => u.total_visitas > 1).length;
    const nuevosHoy = todos.filter((u: any) => u.created_at && new Date(u.created_at) >= hoy).length;
    const nuevosSemana = todos.filter((u: any) => u.created_at && new Date(u.created_at) >= new Date(inicioSemana)).length;
    const ultimos = [...todos].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

    return NextResponse.json({ total, premium, activos, inactivos, enLimite, nuevosHoy, nuevosSemana, ultimos, unaVisita, recurrentes });
  }

  // Llamada normal a la IA
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  });

  const data = await response.json();
  return NextResponse.json(data);
}