import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";
import { sendEmail } from "@/lib/email/sendEmail";
import FounderEmail from "@/lib/email/templates/FounderEmail";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { data: usuario } = await supabase.from("usuarios").select("ciclo_actual,estado_fisiologico,historial_fisiologico,objetivo_principal,debilidades,athlete_development").eq("codigo", codigo).single();
  const { data: plan } = await supabase.from("weekly_plan").select("*").eq("user_codigo", codigo).eq("week_start", weekStart).single();

  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const sesionHoy = plan?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaHoy));
  const sesionManana = plan?.sessions?.find((s: any) => normalizar(s.dia) === normalizar(diaSemanaManana));

  const histFisio = usuario?.historial_fisiologico || [];
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 500 });
  }

  const { messages, system, model, max_tokens, action, codigo, datos, email, codigoConjunto } = await req.json();

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
        const soloUsuario = datos.historial.slice(-6).filter((m:any) => m.role === "user").map((m: any) => extraerTextoContenido(m.content)).join("\n\n");

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
          const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
          // Solo procesar si los valores son simples (no arrays ni objetos)
          const valoresSimples = Object.fromEntries(
            Object.entries(extracted.estado_fisiologico).filter(([k,v]) => 
              v !== null && typeof v === 'number' && ['hrv','sueno','rhr','fatiga_aguda'].includes(k)
            )
          );
          if(Object.keys(valoresSimples).length > 0){
            const entradaHoy = { fecha: hoy, ...valoresSimples };
            const indiceHoy = historialActual.findIndex((e: any) => e.fecha === hoy);
            updates.estado_fisiologico = { ...estadoActual, ...valoresSimples };
            if(indiceHoy >= 0){
              // Actualizar entrada existente de hoy, mezclando datos nuevos con los que ya tenía
              const historialActualizado = [...historialActual];
              historialActualizado[indiceHoy] = { ...historialActual[indiceHoy], ...entradaHoy };
              updates.historial_fisiologico = historialActualizado;
            } else {
              updates.historial_fisiologico = [...historialActual.slice(-29), entradaHoy];
            }
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
          updates.distribucion_semanal = extracted.distribucion_semanal;
        }
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
            // Evitar duplicado exacto mismo ejercicio+fecha+valor
            const yaExiste = histMarcas.some((m:any) => m.ejercicio === ejercicioNormalizado && m.fecha === fechaHoy && m.valor === valorNuevo);
            if (!yaExiste) {
              updates.historial_marcas = [...histMarcas, { fecha: fechaHoy, ejercicio: ejercicioNormalizado, valor: valorNuevo }];
            }
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

  if (action === "analizar_bloque_semana") {
    // FORGE ORCHESTRATOR — Paso 1: Block Analyzer. Solo decide estructura, no genera entrenamientos.
    const estado = await generarEstadoCanonico(supabase, codigo);
    const { data: usuarioAnalyzer } = await supabase.from("usuarios").select("ciclo_actual,athlete_development,distribucion_semanal").eq("codigo", codigo).single();

    const debilidadesActivas = (usuarioAnalyzer?.athlete_development || []).filter((d: any) => d.estado !== "resuelta");
    const debilidadPrioritaria = debilidadesActivas.sort((a: any, b: any) => (b.prioridad === "alta" ? 1 : 0) - (a.prioridad === "alta" ? 1 : 0))[0];

    const analyzerPrompt = `Eres un analizador de bloques de entrenamiento. Tu ÚNICA tarea es devolver un JSON pequeño describiendo la estructura de la PRÓXIMA semana. NO generes entrenamientos ni sesiones detalladas.

CONTEXTO:
Ciclo actual: ${JSON.stringify(estado.ciclo)}
Debilidad prioritaria activa: ${debilidadPrioritaria ? debilidadPrioritaria.nombre_visible : "ninguna"}
Disponibilidad: ${usuarioAnalyzer?.distribucion_semanal || "no especificada"}

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"tipo_semana":"acumulacion|intensificacion|realizacion|deload","objetivo":"frase corta del objetivo de esta semana","volumen_relativo":0.0-1.0,"intensidad_relativa":0.0-1.0,"debilidad_prioritaria":"nombre o null","dias_entreno_sugeridos":número}`;

    try {
      const analyzerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 300, messages: [{ role: "user", content: analyzerPrompt }] }),
      });
      const analyzerData = await analyzerRes.json();
      const analyzerTexto = analyzerData.content?.map((b: any) => b.text || "").join("") || "{}";
      const analyzerClean = analyzerTexto.replace(/```json|```/g, "").trim();
      const analisisBloque = JSON.parse(analyzerClean);
      return NextResponse.json({ ok: true, analisis: analisisBloque });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Block Analyzer: " + err.message }, { status: 500 });
    }
  }

  if (action === "planificar_semana") {
    // FORGE ORCHESTRATOR — Paso 2: Week Planner. Recibe el analisis del Block Analyzer y decide QUE TIPO de sesion va cada dia, sin detalle.
    const { analisis: analisisRecibido } = datos;
    const { data: usuarioPlanner } = await supabase.from("usuarios").select("distribucion_semanal,especialidad,categoria").eq("codigo", codigo).single();

    const plannerPrompt = `Eres un planificador semanal. Tu ÚNICA tarea es decidir QUÉ TIPO de sesión va cada día de la semana (lunes a domingo). NO escribas el contenido detallado de cada sesión, solo el tipo y un título breve.

ANÁLISIS DEL BLOQUE:
${JSON.stringify(analisisRecibido)}

DISPONIBILIDAD DEL ATLETA:
${usuarioPlanner?.distribucion_semanal || "sin restricciones especificadas, asume disponibilidad flexible"}

ESPECIALIDAD: ${usuarioPlanner?.especialidad || usuarioPlanner?.categoria}

Responde SOLO con este JSON, sin texto adicional ni markdown, con los 7 días (lunes a domingo):
{"sessions":[{"dia":"lunes","tipo":"carrera|box|fuerza|descanso|otro","titulo_breve":"3-5 palabras describiendo la sesion"},{"dia":"martes",...},...]}
Respeta la disponibilidad indicada. Si un día no tiene sesión, usa tipo "descanso".`;

    try {
      const plannerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 500, messages: [{ role: "user", content: plannerPrompt }] }),
      });
      const plannerData = await plannerRes.json();
      const plannerTexto = plannerData.content?.map((b: any) => b.text || "").join("") || "{}";
      const plannerClean = plannerTexto.replace(/```json|```/g, "").trim();
      const estructuraSemana = JSON.parse(plannerClean);
      return NextResponse.json({ ok: true, estructura: estructuraSemana });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Week Planner: " + err.message }, { status: 500 });
    }
  }

  if (action === "construir_sesion_dia") {
    // FORGE ORCHESTRATOR — Paso 3: Session Builder. Genera el contenido COMPLETO de UN solo dia.
    const { dia, tipo, titulo_breve, analisis: analisisSesion, debilidad_relacionada } = datos;
    const { data: usuarioBuilder } = await supabase.from("usuarios").select("especialidad,categoria,perfil,marcas_especificas,athlete_development").eq("codigo", codigo).single();

    const debilidadInfo = (usuarioBuilder?.athlete_development || []).find((d: any) => d.nombre_visible === debilidad_relacionada);

    const builderPrompt = `Eres un constructor de sesiones de entrenamiento. Tu ÚNICA tarea es escribir el contenido COMPLETO Y DETALLADO de UNA sola sesión de entrenamiento.

DÍA: ${dia}
TIPO DE SESIÓN: ${tipo}
IDEA GENERAL: ${titulo_breve}
CONTEXTO DEL BLOQUE: ${JSON.stringify(analisisSesion)}
ESPECIALIDAD: ${usuarioBuilder?.especialidad || usuarioBuilder?.categoria}
MARCAS DEL ATLETA: ${JSON.stringify(usuarioBuilder?.marcas_especificas || {})}
${debilidadInfo ? `DEBILIDAD A TRABAJAR HOY: ${debilidadInfo.nombre_visible} — ${debilidadInfo.diagnostico}` : ""}

Responde SOLO con este JSON, sin texto adicional ni markdown:
{"titulo":"título breve y claro","por_que":"UNA frase explicando el propósito de esta sesión concreta","descripcion":"SESIÓN COMPLETA: Calentamiento: X. Bloque principal: Y (series, reps, intensidad, zonas FC si aplica). Vuelta a la calma: Z. Notas técnicas: W.","debilidad_relacionada":${debilidadInfo ? `"${debilidadInfo.nombre_visible}"` : "null"}}`;

    try {
      const builderRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 600, messages: [{ role: "user", content: builderPrompt }] }),
      });
      const builderData = await builderRes.json();
      const builderTexto = builderData.content?.map((b: any) => b.text || "").join("") || "{}";
      const builderClean = builderTexto.replace(/```json|```/g, "").trim();
      const sesionCompleta = JSON.parse(builderClean);
      return NextResponse.json({ ok: true, sesion: { dia, tipo, ...sesionCompleta } });
    } catch (err: any) {
      return NextResponse.json({ error: "Error en Session Builder: " + err.message }, { status: 500 });
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

  if (action === "obtener_estado_canonico") {
    const estado = await generarEstadoCanonico(supabase, codigo);
    return NextResponse.json({ estado });
  }

  if (action === "obtener_plan_semana") {
    const hoy = new Date();
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
    const { plan } = datos;
    // CORRECCIÓN DE RAÍZ: recalcular week_start correcto en el servidor, ignorando el que envió el modelo si es incorrecto
    const ahoraServ = new Date();
    const hoyServStr = ahoraServ.toLocaleDateString('en-CA', {timeZone: 'Europe/Madrid'});
    const hoyServFecha = new Date(hoyServStr + 'T12:00:00');
    const diaSemanaServ = hoyServFecha.getDay() || 7;
    const lunesServ = new Date(hoyServFecha);
    lunesServ.setDate(hoyServFecha.getDate() - diaSemanaServ + 1);
    const weekStartCorrecto = lunesServ.toISOString().split('T')[0];
    if (plan.week_start !== weekStartCorrecto) {
      console.log(`CORRIGIENDO week_start: modelo envió ${plan.week_start}, correcto es ${weekStartCorrecto}`);
      plan.week_start = weekStartCorrecto;
    }
    // Preservar sesiones ya completadas si existen
    const { data: planExistente } = await supabase.from("weekly_plan").select("sessions").eq("user_codigo", codigo).eq("week_start", plan.week_start).single();
    if (planExistente?.sessions) {
      plan.sessions = plan.sessions.map((nuevaSesion: any) => {
        const sesionExistente = planExistente.sessions.find((s: any) => s.dia === nuevaSesion.dia);
        if (sesionExistente?.completada) {
          // Mantener la sesión completada tal cual estaba, no sobrescribir
          return sesionExistente;
        }
        return nuevaSesion;
      });
    }
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
    return NextResponse.json({ ok: true });
  }

  if (action === "actualizar_sesion_plan") {
    const { week_start, dia, cambios, motivo, confidence } = datos;
    const { data: planActual } = await supabase.from("weekly_plan").select("sessions,confidence").eq("user_codigo", codigo).eq("week_start", week_start).single();
    if (!planActual) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
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

    // Si pasó a resuelta, generar evento en Historia
    if (estado === "resuelta" && estadoAnterior !== "resuelta") {
      const diasTrabajado = Math.round((new Date().getTime() - new Date(devActualizado[idx].detectado).getTime()) / (24*60*60*1000));
      await supabase.from("athlete_events").insert({
        user_codigo: codigo,
        date: new Date().toISOString().split('T')[0],
        type: "development_complete",
        title: `${devActualizado[idx].nombre_visible} — ${diasTrabajado} días de trabajo`,
        data: { notas: nueva_evidencia||"" }
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
        const yaExiste = histMarcas.some((m:any) => m.ejercicio === ejercicio && m.fecha === fechaEvento);
        if (!yaExiste) {
          await supabase.from("usuarios").update({
            historial_marcas: [...histMarcas, { fecha: fechaEvento, ejercicio, valor }]
          }).eq("codigo", codigo);
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