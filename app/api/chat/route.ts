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

  const { messages, system, model, max_tokens, action, codigo, datos, email, codigoConjunto } = await req.json();

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
        const {data: usuarioData} = await supabase.from("usuarios").select("ciclo_actual,notas_coach,datos_entrenamiento,estado_fisiologico,workout_history,historial_fisiologico,distribucion_semanal,objetivo_principal,historial_marcas,analisis_bloques").eq("codigo", codigo).single();
        const cicloActual = usuarioData?.ciclo_actual || {};
        const ultimos = datos.historial.slice(-6).map((m: any) => `${m.role === "user" ? "ATLETA" : "COACH"}: ${typeof m.content === "string" ? m.content.substring(0, 1500) : "[archivo]"}`).join("\n\n");
        const soloUsuario = datos.historial.slice(-6).filter((m:any) => m.role === "user").map((m: any) => typeof m.content === "string" ? m.content.substring(0, 1500) : "").join("\n\n");

        const extractPrompt = `Analiza esta conversación y extrae datos en JSON. Responde SOLO con JSON válido:
{
  "lesiones": "lesiones mencionadas o vacío",
  "plan": "sesiones planificadas próximos 7 días o vacío",
  "notas": "decisiones importantes máx 80 palabras o vacío",
  "nueva_marca": "nueva marca en formato ejercicio:valor o vacío",
  "ciclo": {"bloque": "${cicloActual.bloque||"vacío"}", "semana": ${cicloActual.semana||"null"}, "totalSemanas": ${cicloActual.totalSemanas||"null"}, "objetivo": "${cicloActual.objetivo||"vacío"}"},
  "estado_fisiologico": {"hrv": null, "sueno": null, "rhr": null, "fatiga_aguda": null, "tendencia": null},
INSTRUCCIONES PARA estado_fisiologico — analiza SOLO mensajes del ATLETA:
- "hrv": busca HRV, VFC, variabilidad cardíaca — extrae el número en ms. Ejemplo: "VFC 92ms" → 92
- "sueno": busca puntuación sueño, calidad sueño, score sueño — extrae SOLO el número 0-100. Ejemplo: "puntuación 93" → 93. NUNCA un objeto
- "rhr": busca FC reposo, frecuencia mínima nocturna, pulsaciones reposo — extrae el número en bpm. Ejemplo: "mínima 43bpm" → 43
- "fatiga_aguda": estima 0-100 según sensaciones reportadas por el atleta
- Extrae TODOS los valores presentes en los mensajes del atleta
- Si el atleta reporta métricas del reloj (Oura, Garmin, Apple Watch) extrae todas las métricas de recuperación
MENSAJES DEL ATLETA PARA ANALIZAR:
${soloUsuario}
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

if (extracted.estado_fisiologico && Object.values(extracted.estado_fisiologico).some(v => v !== null && typeof v !== 'object')) {
          const estadoActual = usuarioData?.estado_fisiologico || {};
          const historialActual = usuarioData?.historial_fisiologico || [];
          const hoy = new Date().toISOString().split('T')[0];
          // Solo procesar si los valores son simples (no arrays ni objetos)
          const valoresSimples = Object.fromEntries(
            Object.entries(extracted.estado_fisiologico).filter(([k,v]) => 
              v !== null && typeof v === 'number' && ['hrv','sueno','rhr','fatiga_aguda'].includes(k)
            )
          );
          if(Object.keys(valoresSimples).length > 0){
            const entradaHoy = { fecha: hoy, ...valoresSimples };
            const yaExisteHoy = historialActual.some((e: any) => e.fecha === hoy);
            updates.estado_fisiologico = { ...estadoActual, ...valoresSimples };
            if(!yaExisteHoy){
              updates.historial_fisiologico = [...historialActual.slice(-29), entradaHoy];
            }
          }
        }

        // Registro de sesiones por acción explícita del usuario

        if (extracted.distribucion_semanal && extracted.distribucion_semanal !== "null" && extracted.distribucion_semanal !== "") {
          updates.distribucion_semanal = extracted.distribucion_semanal;
        }
        if (extracted.nueva_marca && extracted.nueva_marca !== "" && extracted.nueva_marca !== "vacío") {
          const histMarcas = usuarioData?.historial_marcas || [];
          const partes = extracted.nueva_marca.split(":");
          if (partes.length >= 2) {
            const nuevaEntrada = {
              fecha: new Date().toISOString().split('T')[0],
              ejercicio: partes[0].trim(),
              valor: partes.slice(1).join(":").trim()
            };
            updates.historial_marcas = [...histMarcas, nuevaEntrada];
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
          // Solo actualizar objetivo si el usuario lo menciona explícitamente en primera persona
          // No actualizar si viene de una sesión conjunta (el historial contiene datos de otro atleta)
          const ultMensajeUsuario = datos.historial?.filter((m:any)=>m.role==="user").slice(-1)[0]?.content||"";
          const mencionaObjetivo = typeof ultMensajeUsuario === "string" && 
            (ultMensajeUsuario.toLowerCase().includes("objetivo") || 
             ultMensajeUsuario.toLowerCase().includes("competición") ||
             ultMensajeUsuario.toLowerCase().includes("carrera") ||
             ultMensajeUsuario.toLowerCase().includes("quiero") ||
             ultMensajeUsuario.toLowerCase().includes("meta"));
          if (obj && typeof obj === "object" && mencionaObjetivo) updates.objetivo_principal = obj;
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
    // Verificar que es el creador
    const { data: equipo } = await supabase.from("teams").select("created_by").eq("id", team_id).single();
    if (equipo?.created_by !== codigo) return NextResponse.json({ error: "Solo el creador puede disolver el equipo" }, { status: 403 });
    // Borrar en orden correcto para evitar violaciones de foreign key
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
    const { data: usuarioFresh } = await supabase.from("usuarios").select("workout_history").eq("codigo", codigo).single();
    const workoutActual = usuarioFresh?.workout_history || [];
    const sesionNormalizada = {
      tipo: sesion.tipo || "Entrenamiento",
      fecha: sesion.fecha || new Date().toISOString(),
      notas: sesion.notas || "",
      duracion: sesion.duracion || null,
      sensacion: sesion.sensacion || "buena"
    };
    // Insertar en orden cronológico
    const workoutActualizado = [...workoutActual, sesionNormalizada].sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    await supabase.from("usuarios").update({ workout_history: workoutActualizado }).eq("codigo", codigo);
    return NextResponse.json({ ok: true });
  }

  if (action === "registrar_metrica_pasada") {
    const { fecha, hrv, sueno, rhr } = datos;
    const { data: usuarioFresh } = await supabase.from("usuarios").select("historial_fisiologico").eq("codigo", codigo).single();
    const historialActual = usuarioFresh?.historial_fisiologico || [];
    // No duplicar fechas
    const yaExiste = historialActual.some((e:any) => e.fecha === fecha);
    if(yaExiste) return NextResponse.json({ ok: true, mensaje: "Fecha ya registrada" });
    const nuevaEntrada:any = { fecha };
    if(hrv) nuevaEntrada.hrv = hrv;
    if(sueno) nuevaEntrada.sueno = sueno;
    if(rhr) nuevaEntrada.rhr = rhr;
    const historialActualizado = [...historialActual, nuevaEntrada].sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).slice(-30);
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

  if (action === "registrar_evento") {
    const { evento } = datos;
    const { error } = await supabase.from("athlete_events").insert({
      user_codigo: codigo,
      date: evento.date,
      type: evento.type,
      title: evento.title || "",
      data: evento.data || {}
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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