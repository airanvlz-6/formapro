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
        const {data: usuarioData} = await supabase.from("usuarios").select("ciclo_actual,notas_coach,datos_entrenamiento,estado_fisiologico,workout_history,historial_fisiologico,distribucion_semanal,objetivo_principal").eq("codigo", codigo).single();
        const cicloActual = usuarioData?.ciclo_actual || {};
        const ultimos = datos.historial.slice(-6).map((m: any) => `${m.role === "user" ? "ATLETA" : "COACH"}: ${typeof m.content === "string" ? m.content.substring(0, 300) : "[archivo]"}`).join("\n\n");

        const extractPrompt = `Analiza esta conversación y extrae datos en JSON. Responde SOLO con JSON válido:
{
  "lesiones": "lesiones mencionadas o vacío",
  "plan": "sesiones planificadas próximos 7 días o vacío",
  "notas": "decisiones importantes máx 80 palabras o vacío",
  "nueva_marca": "nueva marca en formato ejercicio:valor o vacío",
  "ciclo": {"bloque": "${cicloActual.bloque||"vacío"}", "semana": ${cicloActual.semana||"null"}, "totalSemanas": ${cicloActual.totalSemanas||"null"}, "objetivo": "${cicloActual.objetivo||"vacío"}"},
  "estado_fisiologico": {"hrv": null, "sueno": null, "rhr": null, "fatiga_aguda": null, "tendencia": null},
IMPORTANTE para estado_fisiologico: "sueno" debe ser SIEMPRE un número 0-100 (la puntuación), NUNCA un objeto. "hrv" en ms como número. "rhr" en bpm como número.
  "sesion_completada": null,
  "datos_entrenamiento": null,
  "distribucion_semanal": null,
  "objetivo_principal": null
}

Para "objetivo_principal": si el atleta menciona un objetivo concreto con fecha (competición, carrera, evento, marca objetivo), extrae: {"descripcion":"descripción del objetivo","fecha":"YYYY-MM-DD","tipo":"competicion|marca|evento|otro"}. null si no hay objetivo mencionado.
Para "distribucion_semanal": si el coach y atleta acuerdan qué tipo de sesión corresponde a cada día, extrae como texto. Ejemplo: "lunes-carrera, martes-box, miercoles-carrera, jueves-box, viernes-carrera, sabado-box". null si no se habló de distribución.

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
        const extracted = JSON.parse(jsonMatch[0]);

        const updates: any = {};
        if (extracted.lesiones) updates.lesiones_actuales = extracted.lesiones;
        if (extracted.plan) updates.plan_proxima_semana = extracted.plan;
        if (extracted.notas) updates.notas_coach = extracted.notas;

        if (extracted.ciclo?.bloque) {
          updates.ciclo_actual = { ...cicloActual, ...Object.fromEntries(Object.entries(extracted.ciclo).filter(([,v]) => v !== null)) };
        }

        if (extracted.estado_fisiologico && Object.values(extracted.estado_fisiologico).some(v => v !== null)) {
          const estadoActual = usuarioData?.estado_fisiologico || {};
          const nuevoEstado = { ...estadoActual, ...Object.fromEntries(Object.entries(extracted.estado_fisiologico).filter(([,v]) => v !== null)) };
          updates.estado_fisiologico = nuevoEstado;
          
          // Añadir al historial fisiológico
          const historialActual = usuarioData?.historial_fisiologico || [];
          const hoy = new Date().toISOString().split('T')[0];
          const entradaHoy = { 
            fecha: hoy,
            ...Object.fromEntries(Object.entries(extracted.estado_fisiologico).filter(([k,v]) => v !== null && ['hrv','sueno','rhr','fatiga_aguda'].includes(k)))
          };
          // Solo añadir si tiene datos y no existe entrada de hoy
          const yaExisteHoy = historialActual.some((e: any) => e.fecha === hoy);
          if(Object.keys(entradaHoy).length > 1 && !yaExisteHoy){
            updates.historial_fisiologico = [...historialActual.slice(-29), entradaHoy]; // máximo 30 días
          }
        }

        if (extracted.sesion_completada && extracted.sesion_completada !== "null") {
          const sesion = typeof extracted.sesion_completada === "string" ? JSON.parse(extracted.sesion_completada) : extracted.sesion_completada;
          if (sesion && typeof sesion === "object") {
            const workoutActual = usuarioData?.workout_history || [];
            const ultimaSesion = workoutActual[workoutActual.length - 1];
            const tiempoUltima = ultimaSesion ? new Date(ultimaSesion.fecha).getTime() : 0;
            if (new Date().getTime() - tiempoUltima > 300000) {
              // Normalizar formato de sesión
              const sesionNormalizada = {
                tipo: sesion.tipo || sesion.type || "Entrenamiento",
                fecha: new Date().toISOString(),
                notas: sesion.notas || sesion.notes || Object.entries(sesion).filter(([k])=>!['tipo','type','fecha','date','duracion','duration','sensacion'].includes(k)).map(([k,v])=>`${k}: ${v}`).join(', ') || "",
                duracion: sesion.duracion || sesion.duration || null,
                sensacion: sesion.sensacion || sesion.feeling || "buena"
              };
              updates.workout_history = [...workoutActual, sesionNormalizada];
            }
          }
        }

        if (extracted.distribucion_semanal && extracted.distribucion_semanal !== "null" && extracted.distribucion_semanal !== "") {
          updates.distribucion_semanal = extracted.distribucion_semanal;
        }
        if (extracted.objetivo_principal && extracted.objetivo_principal !== "null") {
          const obj = typeof extracted.objetivo_principal === "string" ? JSON.parse(extracted.objetivo_principal) : extracted.objetivo_principal;
          if (obj && typeof obj === "object") updates.objetivo_principal = obj;
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

        if (Object.keys(updates).length > 0) {
          await supabase.from("usuarios").update(updates).eq("codigo", codigo);
        }
      } catch (e) {
        console.error("Error extraccion servidor:", e);
      }
    }

    return NextResponse.json({ ok: true });
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

    const { data: todos } = await supabase.from("usuarios").select("codigo,categoria,especialidad,premium,admin,created_at,updated_at,consultas_usadas,total_visitas,ultima_visita");
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