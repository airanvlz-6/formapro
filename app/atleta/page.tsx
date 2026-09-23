'use client';
import AuthenticatedSurface from '../auth/AuthenticatedSurface';
import { authenticatedFetch } from '@/lib/auth/authenticatedFetch';
import { useState, useEffect, useRef } from "react";

import { athleteStatePresentation } from '@/lib/athlete/athleteStatePresentation';

export default function MiAtleta() {
  return <AuthenticatedSurface>{codigo => <MiAtletaContent codigo={codigo} />}</AuthenticatedSurface>;
}

function MiAtletaContent({ codigo }: { codigo: string }) {
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [progresoObjetivo, setProgresoObjetivo] = useState<{percentage:number;daysRemaining:number|null}|null>(null);
  const [nivelConocimientoReal, setNivelConocimientoReal] = useState<number>(0);
  const [mostrarMas, setMostrarMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");
  const [estadoAtleta, setEstadoAtleta] = useState<{estado:string;motivo:string;bodyArea:string|null;reasonDescription:string|null;desde:string;restricciones:{movement:string;issue:string;priority:string}[]}|null>(null);
  const [confirmandoReevaluacion, setConfirmandoReevaluacion] = useState<string|null>(null);
  const [estadoEnviando, setEstadoEnviando] = useState(false);
  const estadoRequestPending = useRef(false);
  const [errorEstado, setErrorEstado] = useState("");

  const C = {
    bg:"#0D0D0D", card:"#1A1A1A", ink:"#F0EDE8", muted:"#9A9590",
    border:"#2A2A2A", accent:"#FF6B00"
  };
  useEffect(() => {
    void cargarDatos(codigo);
  }, [codigo]);

  const cargarDatos = async(cod:string)=>{
    setCargando(true);
    try{
      const res = await authenticatedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"recuperar_usuario",codigo:cod})});
      const data = await res.json();
      if(data.error){ setError("No se pudieron cargar tus datos"); return; }
      setDatos(data.data);
      setAutenticado(true);
      // Objetivos vivos: cargar el progreso real hacia el objetivo
      const resProgreso = await authenticatedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"obtener_progreso_objetivo",codigo:cod})});
      const dataProgreso = await resProgreso.json();
      if(dataProgreso?.progreso) setProgresoObjetivo(dataProgreso.progreso);
      // FORGE ATHLETE KNOWLEDGE — consulta INDEPENDIENTE a la fuente real, no depende de la pagina Hoy
      const resNivel = await authenticatedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"calcular_nivel_conocimiento",codigo:cod})});
      const dataNivel = await resNivel.json();
      setNivelConocimientoReal(dataNivel?.nivelConocimiento ?? 0);
      // FORGE ATHLETE STATE ENGINE — estado de restriccion completo, con detalle de movimientos evitados
      const resEstado = await authenticatedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"obtener_detalle_estado_atleta",codigo:cod})});
      const dataEstado = await resEstado.json();
      if (!resEstado.ok || !["normal", "restricted", "reassessment"].includes(dataEstado.estado)) throw new Error("state_read_failed");
      setEstadoAtleta(athleteStatePresentation(dataEstado?.estado) ? dataEstado : null);
    }catch{ setError("Error de conexión"); }
    finally{ setCargando(false); setIniciado(true); }
  };

  const confirmarTransicion = async () => {
    if (estadoRequestPending.current || !confirmandoReevaluacion || confirmandoReevaluacion !== estadoAtleta?.estado) return;
    const action = estadoAtleta.estado === "restricted" ? "resolver_restriccion_atleta"
      : estadoAtleta.estado === "reassessment" ? "completar_reevaluacion_atleta" : null;
    if (!action) return;
    estadoRequestPending.current = true;
    setEstadoEnviando(true); setErrorEstado("");
    try {
      const res = await authenticatedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, codigo, ...(action === "completar_reevaluacion_atleta" ? { datos: { confirmado: true } } : {}) }) });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error('transition_failed');
      const refreshed = await authenticatedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "obtener_detalle_estado_atleta", codigo }) });
      const detail = await refreshed.json();
      if (!refreshed.ok || !['normal', 'restricted', 'reassessment'].includes(detail.estado)) throw new Error('refresh_failed');
      setEstadoAtleta(athleteStatePresentation(detail.estado) ? detail : null);
      setConfirmandoReevaluacion(null);
    } catch { setErrorEstado("No se pudo confirmar el cambio de estado. Recarga para comprobar el estado actual antes de volver a intentarlo."); }
    finally { estadoRequestPending.current = false; setEstadoEnviando(false); }
  };
  const estadoVisual = athleteStatePresentation(estadoAtleta?.estado);

  if(cargando && !iniciado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src="/logo-forge.png" alt="Forge" style={{width:80,height:80,objectFit:"contain",borderRadius:"50%"}}/>
    </div>
  );

  if (!autenticado) return <main style={{ padding: 32 }} role="status">{error || 'Cargando tus datos…'} <button onClick={() => window.location.reload()}>Reintentar</button></main>;

  const test = datos?.test_atleta?.informe;
  const fechaTest = datos?.test_atleta_fecha;
  const diasDesdeTest = fechaTest ? Math.round((new Date().getTime()-new Date(fechaTest).getTime())/(24*60*60*1000)) : null;
  const debilidades = datos?.debilidades || [];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px", paddingBottom: 90 }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <img src="/logo-forge.png" alt="Forge" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: "Georgia, serif" }}>Mi Atleta</h1>
            <p style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>••••••</p>
          </div>
          <a href={`/app?codigo=${codigo}`} style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            💬 Coach
          </a>
        </div>

        {estadoAtleta&&estadoVisual&&(
          <div style={{background:estadoVisual.background,borderRadius:16,padding:"20px 22px",marginBottom:20}}>
            <p style={{color:"#fff",fontSize:16,fontWeight:800,marginBottom:6}}>{estadoVisual.athleteTitle}</p>
            <p style={{color:"#fff",fontSize:11,opacity:0.7,marginBottom:6}}>Desde {new Date(estadoAtleta.desde).toLocaleDateString('es-ES')}</p>
            <p style={{color:"#fff",fontSize:13.5,marginBottom:14,lineHeight:1.5}}>{estadoAtleta.estado === "restricted" ? estadoAtleta.reasonDescription || estadoVisual.description : estadoVisual.description}</p>
            {estadoAtleta.restricciones?.length>0&&(
              <div style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <p style={{color:"#fff",fontSize:11,fontWeight:700,marginBottom:8}}>{estadoAtleta.estado === "restricted" ? "Forge está evitando:" : "En reevaluación:"}</p>
                {estadoAtleta.restricciones.map((r,i)=>(
                  <p key={i} style={{color:"#fff",fontSize:12.5,marginBottom:4}}>• {r.movement}: {r.issue}</p>
                ))}
              </div>
            )}
            {!confirmandoReevaluacion&&(
              <>
                <p style={{color:"#fff",fontSize:12,marginBottom:12}}>{estadoAtleta.estado === "restricted"
                  ? "Si ya no tienes molestias, puedes iniciar una reevaluación. Forge no retomará automáticamente tu planificación anterior hasta comprobar tu estado actual."
                  : "Si has completado la reevaluación y quieres retirar las restricciones temporales restantes, confirma la finalización."}</p>
                <button onClick={()=>{setErrorEstado("");setConfirmandoReevaluacion(estadoAtleta.estado);}} style={{width:"100%",background:"#fff",color:estadoVisual.color,border:"none",borderRadius:100,padding:"12px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  {estadoAtleta.estado === "restricted" ? "Iniciar reevaluación" : "Finalizar reevaluación"}
                </button>
              </>
            )}
            {confirmandoReevaluacion&&(
              <div>
                <p style={{color:"#fff",fontSize:13,fontWeight:600,marginBottom:10}}>{confirmandoReevaluacion === "restricted"
                  ? "Confirmo que ya no tengo molestias y quiero iniciar la reevaluación."
                  : "Confirmo que he completado la reevaluación y quiero retirar las restricciones temporales restantes. Esta acción no es una valoración médica."}</p>
                <div style={{display:"flex",gap:8}}>
                  <button disabled={estadoEnviando} onClick={confirmarTransicion} style={{flex:1,background:"#fff",color:estadoVisual.color,border:"none",borderRadius:100,padding:"12px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                    {estadoEnviando ? "Guardando…" : "Sí, confirmar"}
                  </button>
                  <button disabled={estadoEnviando} onClick={()=>setConfirmandoReevaluacion(null)} style={{flex:1,background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,0.5)",borderRadius:100,padding:"12px 18px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            )}
            {errorEstado&&<p role="alert" style={{color:"#fff",fontSize:13,marginTop:12}}>{errorEstado}</p>}
          </div>
        )}

        {/* Conocimiento del atleta — usa la fuente REAL independiente (athlete_knowledge_points) */}
        <div style={{ background: C.card, border: `1px solid ${C.accent}60`, borderRadius: 16, padding: "18px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🧠 Conocimiento del atleta</p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 6 }}>
            <span>Nivel de conocimiento</span>
            <span>{nivelConocimientoReal}%</span>
          </div>
          <div style={{ height: 8, background: C.border, borderRadius: 100, marginBottom: 14 }}>
            <div style={{ height: 8, borderRadius: 100, background: C.accent, width: `${nivelConocimientoReal}%`, transition: "width 0.8s ease" }}/>
          </div>
          {nivelConocimientoReal===0 && (
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>Cuando completes tu primera semana y Forge acumule suficiente evidencia real, empezaremos a detectar patrones personales de rendimiento y recuperación.</p>
          )}
        </div>

        {/* Datos personales */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>👤 Datos personales</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {datos?.especialidad && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Especialidad</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{datos.especialidad.replace(/_/g,' ')}</span>
              </div>
            )}
            {datos?.objetivo_principal?.descripcion && (
              <div style={{ marginBottom: progresoObjetivo ? 4 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: progresoObjetivo ? 8 : 0 }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>Objetivo</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600, textAlign: "right" }}>{datos.objetivo_principal.descripcion}</span>
                </div>
                {progresoObjetivo && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.accent, marginBottom: 4 }}>
                      <span>Estás un {progresoObjetivo.percentage}% más cerca</span>
                      {progresoObjetivo.daysRemaining !== null && <span>{progresoObjetivo.daysRemaining} días restantes</span>}
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 100 }}>
                      <div style={{ height: 6, borderRadius: 100, background: C.accent, width: `${progresoObjetivo.percentage}%`, transition: "width 0.8s ease" }}/>
                    </div>
                  </>
                )}
              </div>
            )}
            {datos?.perfil?.dias && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Disponibilidad</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{datos.perfil.dias}</span>
              </div>
            )}
          </div>
        </div>

        {/* Evaluación */}
        <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🎯 Evaluación</p>
          {test ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <p style={{ color: C.muted, fontSize: 11 }}>Nivel actual</p>
                  <p style={{ color: C.accent, fontSize: 20, fontWeight: 700 }}>{test.nivel}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: C.muted, fontSize: 11 }}>Última evaluación</p>
                  <p style={{ color: C.ink, fontSize: 13 }}>hace {diasDesdeTest} días</p>
                </div>
              </div>
              {test.fortalezas?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ color: "#4CAF50", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>💪 Fortalezas</p>
                  <p style={{ color: C.ink, fontSize: 13 }}>{test.fortalezas.join(", ")}</p>
                </div>
              )}
              {(test.debilidades?.length > 0 || debilidades.length > 0) && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ color: "#FF6B00", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>🎯 A trabajar</p>
                  <p style={{ color: C.ink, fontSize: 13 }}>{[...(test.debilidades||[]), ...debilidades.map((d:any)=>d.ejercicio)].join(", ")}</p>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>Aún no has realizado tu evaluación inicial.</p>
          )}
          <a href={`/app?codigo=${codigo}&test=1`} style={{ display: "block", background: C.accent, color: "#fff", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>
            {test ? "Actualizar evaluación" : "Realizar evaluación"}
          </a>
        </div>

        {/* Disponibilidad */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📅 Disponibilidad</p>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
            {(()=>{
              const dist = datos?.distribucion_semanal;
              if(!dist) return datos?.perfil?.dias || "No especificada";
              const limpiar = (t:string) => t.replace(/_/g,' ').replace(/-/g,': ');
              if(typeof dist === "string" && dist.trim().startsWith("{")){
                try{
                  const parsed = JSON.parse(dist);
                  return Object.values(parsed).map((v:any)=>limpiar(String(v))).join(" — ");
                }catch{ return datos?.perfil?.dias || "No especificada"; }
              }
              return limpiar(dist);
            })()}
          </p>
        </div>

        {/* Desarrollo del atleta */}
        {(!datos?.athlete_development || datos.athlete_development.length === 0) && (
          <div style={{ background: C.card, border: `1px solid ${C.accent}60`, borderRadius: 16, padding: "18px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎯 Áreas de desarrollo</p>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>Aquí Forge detectará automáticamente fortalezas, debilidades y estancamientos según tu progreso.</p>
            <p style={{ color: C.accent, fontSize: 13, fontWeight: 600 }}>Empieza entrenando tu primera semana.</p>
          </div>
        )}
        {datos?.athlete_development?.length > 0 && (
          <div style={{ background: C.card, border: `1px solid #FF6B0060`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎯 Áreas de desarrollo</p>
            {datos.athlete_development.map((d:any,i:number)=>{
              const coloresEstado: Record<string,string> = {activa:"#FF6B00",en_intervencion:"#FF8C42",en_progreso:"#FFD700",validando:"#64B5F6",resuelta:"#4CAF50"};
              const labelsEstado: Record<string,string> = {activa:"Activa",en_intervencion:"En intervención",en_progreso:"En progreso",validando:"Validando",resuelta:"Resuelta"};
              const colorEstado = coloresEstado[d.estado] || "#FF6B00";
              const labelEstado = labelsEstado[d.estado] || "Activa";
              if(d.estado==="resuelta") return null;
              const colorPrioridad = d.prioridad==="alta"?"#ff4444":d.prioridad==="baja"?C.muted:"#FF6B00";
              const diasDetectado = Math.round((new Date().getTime()-new Date(d.detectado).getTime())/(24*60*60*1000));
              return (
                <div key={i} style={{ background: C.bg, borderRadius: 12, padding: "14px 16px", marginBottom: i<datos.athlete_development.length-1?12:0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <p style={{ color: C.ink, fontSize: 15, fontWeight: 700 }}>{d.nombre_visible || d.indicador}</p>
                    <span style={{ color: colorEstado, fontSize: 11, fontWeight: 700 }}>● {labelEstado}</span>
                  </div>
                  <div style={{ height: 6, background: C.border, borderRadius: 100, marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 100, background: colorEstado, width: `${d.progreso || 0}%`, transition: "width 0.8s ease" }}/>
                  </div>

                  {d.diagnostico && (
                    <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{d.diagnostico}</p>
                  )}

                  {d.evidencias?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform:"uppercase", letterSpacing:1, marginBottom: 4 }}>Evidencias</p>
                      {d.evidencias.map((e:string,j:number)=>(
                        <p key={j} style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>• {e}</p>
                      ))}
                    </div>
                  )}

                  {d.plan_accion?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ color: C.accent, fontSize: 10, fontWeight: 700, textTransform:"uppercase", letterSpacing:1, marginBottom: 4 }}>Plan de acción</p>
                      {d.plan_accion.map((p:string,j:number)=>(
                        <p key={j} style={{ color: C.ink, fontSize: 12, lineHeight: 1.6 }}>→ {p}</p>
                      ))}
                    </div>
                  )}

                  {d.beneficio_esperado?.length > 0 && (
                    <div style={{ marginBottom: 12, background: "#4CAF5010", borderRadius: 8, padding: "8px 10px" }}>
                      <p style={{ color: "#4CAF50", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Si mejoras esto probablemente conseguirás</p>
                      {d.beneficio_esperado.map((b:string,j:number)=>(
                        <p key={j} style={{ color: C.ink, fontSize: 12, lineHeight: 1.6 }}>✓ {b}</p>
                      ))}
                    </div>
                  )}

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <p style={{ color: C.muted, fontSize: 10 }}>Confianza del diagnóstico</p>
                      <p style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>{d.confianza}%</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: C.muted, fontSize: 10 }}>Prioridad</p>
                      <p style={{ color: colorPrioridad, fontSize: 12, fontWeight: 700, textTransform:"uppercase" }}>{d.prioridad || "media"}</p>
                    </div>
                  </div>
                  <p style={{ color: C.muted, fontSize: 10, marginTop: 8 }}>Detectado hace {diasDetectado} días</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Lesiones */}
        {datos?.lesiones_actuales && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🩹 Lesiones</p>
            <p style={{ color: C.muted, fontSize: 13 }}>{datos.lesiones_actuales}</p>
          </div>
        )}

        {/* Material */}
        {datos?.perfil?.material && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏋️ Material disponible</p>
            <p style={{ color: C.muted, fontSize: 13 }}>{Array.isArray(datos.perfil.material) ? datos.perfil.material.join(", ") : datos.perfil.material}</p>
          </div>
        )}

        {/* Preferencias */}
        {datos?.perfil?.lugar_entreno && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📍 Preferencias</p>
            <p style={{ color: C.muted, fontSize: 13 }}>{datos.perfil.lugar_entreno}</p>
          </div>
        )}

        </div>

      {mostrarMas && (
        <div onClick={()=>setMostrarMas(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:40}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:74,left:16,right:16,maxWidth:600,margin:"0 auto",background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:8}}>
            {[
              {href:`/app?codigo=${codigo}`,icon:"💬",label:"Coach"},
              {href:`/historia?codigo=${codigo}`,icon:"📖",label:"Mi Historia"},
              {href:"https://t.me/forgeapp_es",icon:"🧪",label:"Forge Labs",external:true},
              {href:`/app?codigo=${codigo}&ajustes=1`,icon:"⚙️",label:"Ajustes"},
            ].map(item=>(
              <a key={item.label} href={item.href} target={item.external?"_blank":undefined} rel={item.external?"noopener noreferrer":undefined} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",textDecoration:"none",borderRadius:10}}>
                <span style={{fontSize:18}}>{item.icon}</span>
                <span style={{fontSize:14,fontWeight:600,color:C.ink}}>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#141414",borderTop:`1px solid ${C.border}`,padding:"10px 16px calc(10px + env(safe-area-inset-bottom))",display:"flex",justifyContent:"space-around",maxWidth:600,margin:"0 auto",zIndex:41}}>
        {[
          {href:`/hoy?codigo=${codigo}`,icon:"🏠",label:"Hoy",active:false},
          {href:`/progreso?codigo=${codigo}`,icon:"📈",label:"Progreso",active:false},
          (datos?.modo_entrada==="supervision"||datos?.modo_entrada==="consulta")
            ? {href:`/historia?codigo=${codigo}`,icon:"📖",label:"Historia",active:false}
            : {href:`/plan?codigo=${codigo}`,icon:"📅",label:"Plan",active:false},
          {href:`/atleta?codigo=${codigo}`,icon:"👤",label:"Atleta",active:true},
        ].map(item=>(
          <a key={item.label} href={item.href} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",opacity:item.active?1:0.5}}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:10,fontWeight:600,color:item.active?C.accent:C.muted}}>{item.label}</span>
          </a>
        ))}
        <button onClick={()=>setMostrarMas(true)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",opacity:0.5}}>
          <span style={{fontSize:20}}>☰</span>
          <span style={{fontSize:10,fontWeight:600,color:C.muted}}>Más</span>
        </button>
      </div>
    </div>
  );
}