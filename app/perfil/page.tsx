'use client';
import { useState, useEffect } from "react";

export default function MiPerfil() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [fuentesTraining, setFuentesTraining] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");

  // Cambio de modo
  const [mostrarCambioModo, setMostrarCambioModo] = useState(false);
  const [modoDestino, setModoDestino] = useState<string | null>(null);
  const [verificandoModo, setVerificandoModo] = useState(false);
  const [missingFieldsModo, setMissingFieldsModo] = useState<string[]>([]);
  const [confirmandoCambioModo, setConfirmandoCambioModo] = useState(false);
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [mensajeCambioModo, setMensajeCambioModo] = useState("");

  const C = {
    bg:"#0D0D0D", card:"#1A1A1A", ink:"#F0EDE8", muted:"#9A9590",
    border:"#2A2A2A", accent:"#FF6B00"
  };

  const MODOS_INFO: Record<string, {titulo: string; desc: string; emoji: string}> = {
    supervision: {titulo:"Supervisión", desc:"Ya tienes plan o entrenador. Forge complementa.", emoji:"👥"},
    focus: {titulo:"Focus", desc:"Forge gestiona una disciplina, respeta tu entrenamiento externo.", emoji:"🎯"},
    coach: {titulo:"Coach", desc:"Forge diseña tu planificación completa.", emoji:"📅"},
  };

  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const codigoUrl = params.get("codigo");
    if(codigoUrl){
      setCodigo(codigoUrl.toUpperCase());
      cargarDatos(codigoUrl.toUpperCase());
    } else {
      setCargando(false);
      setIniciado(true);
    }
  },[]);

  const cargarDatos = async(cod:string)=>{
    setCargando(true);
    try{
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"recuperar_usuario",codigo:cod})});
      const data = await res.json();
      if(data.error){ setError("Código no encontrado"); return; }
      setDatos(data.data);
      setAutenticado(true);
      if(data.data.modo_entrada==="focus"){
        const resFuentes = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"obtener_training_sources",codigo:cod})});
        const dataFuentes = await resFuentes.json();
        setFuentesTraining(dataFuentes?.fuentes || []);
      }
    }catch{ setError("Error de conexión"); }
    finally{ setCargando(false); setIniciado(true); }
  };

  const iniciarCambioModo = async(destino:string)=>{
    setModoDestino(destino);
    setVerificandoModo(true);
    setMostrarCambioModo(true);
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verificar_cambio_modo",codigo,datos:{targetMode:destino}})});
    const data = await res.json();
    setMissingFieldsModo(data?.missingFields || []);
    setVerificandoModo(false);
  };

  const confirmarCambioModo = async()=>{
    setCambiandoModo(true);
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cambiar_modo_atleta",codigo,datos:{targetMode:modoDestino}})});
    const data = await res.json();
    setCambiandoModo(false);
    if(data?.ok){
      setMensajeCambioModo(`Modo cambiado a ${MODOS_INFO[modoDestino!]?.titulo}. Recargando...`);
      setTimeout(()=>window.location.reload(),1500);
    }else{
      setMensajeCambioModo(data?.error || "Error al cambiar de modo");
    }
  };

  if(cargando && !iniciado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src="/logo-forge.png" alt="Forge" style={{width:80,height:80,objectFit:"contain",borderRadius:"50%"}}/>
    </div>
  );

  if(!autenticado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:24}}>
      <div style={{background:C.card,borderRadius:20,padding:32,width:"100%",maxWidth:360,border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src="/logo-forge.png" alt="Forge" style={{width:60,height:60,objectFit:"contain",marginBottom:12}}/>
          <h1 style={{fontSize:24,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Perfil</h1>
        </div>
        <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e=>e.key==="Enter"&&cargarDatos(codigo)}
          style={{width:"100%",border:`2px solid ${C.accent}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.bg,letterSpacing:2,textAlign:"center",marginBottom:12,fontFamily:"inherit"}}/>
        {error&&<p style={{color:C.accent,fontSize:12,marginBottom:12,textAlign:"center"}}>{error}</p>}
        <button onClick={()=>cargarDatos(codigo)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Ver mi perfil
        </button>
      </div>
    </div>
  );

  const modoActual = datos?.modo_entrada || "supervision";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px", paddingBottom: 90 }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <img src="/logo-forge.png" alt="Forge" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: "Georgia, serif" }}>Mi Perfil</h1>
          </div>
          <a href={`/app?codigo=${codigo}`} style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            💬 Coach
          </a>
        </div>

        {/* Datos personales */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>👤 Datos personales</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[["Edad", datos?.perfil?.edad],["Nivel", datos?.perfil?.nivel],["Especialidad", datos?.especialidad],["Objetivo", datos?.perfil?.objetivo_detalle]].map(([label,val])=>val?(
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>{label as string}</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600, textAlign:"right", maxWidth:"60%" }}>{val as string}</span>
              </div>
            ):null)}
          </div>
        </div>

        {/* Mi entrenamiento */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏋️ Mi entrenamiento</p>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: fuentesTraining.length>0?12:0 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>Modo actual</span>
            <span style={{ color: C.accent, fontSize: 13, fontWeight: 700 }}>{MODOS_INFO[modoActual]?.emoji} {MODOS_INFO[modoActual]?.titulo}</span>
          </div>
          {fuentesTraining.map((f:any)=>(
            <div key={f.id} style={{ background: C.bg, borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{f.disciplina}</span>
                <span style={{ color: f.owner==="forge"?C.accent:C.muted, fontSize: 11, fontWeight: 600 }}>{f.owner==="forge"?"Gestiona Forge":"Entrenador externo"}</span>
              </div>
              {f.dias&&<p style={{ color: C.muted, fontSize: 12 }}>{f.dias.join(", ")}</p>}
            </div>
          ))}
        </div>

        {/* Mi planificación */}
        {datos?.ciclo_actual?.bloque&&(
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📅 Mi planificación</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Bloque</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600, textTransform:"capitalize" }}>{datos.ciclo_actual.bloque}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Semana</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{datos.ciclo_actual.semana} / {datos.ciclo_actual.totalSemanas}</span>
              </div>
            </div>
            <a href={`/plan?codigo=${codigo}`} style={{ display: "block", marginTop: 12, textAlign: "center", color: C.accent, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Ver Mi Plan completo →
            </a>
          </div>
        )}

        {/* Cambiar plan */}
        <div style={{ background: C.card, border: `1px solid ${C.accent}60`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🔄 Cambiar plan</p>
          <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 14, lineHeight:1.5 }}>Cambia cómo Forge gestiona tu entrenamiento. Se reutilizarán tus datos ya guardados.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(MODOS_INFO).filter(([k])=>k!==modoActual).map(([key,info])=>(
              <button key={key} onClick={()=>iniciarCambioModo(key)} style={{ display:"flex", alignItems:"center", gap:10, background: C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:18 }}>{info.emoji}</span>
                <div>
                  <p style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>Cambiar a {info.titulo}</p>
                  <p style={{ color: C.muted, fontSize: 11 }}>{info.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Modal de cambio de modo */}
        {mostrarCambioModo&&(
          <div onClick={()=>{if(!cambiandoModo){setMostrarCambioModo(false);setMensajeCambioModo("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,padding:22,maxWidth:420,width:"100%",border:`1px solid ${C.border}`}}>
              <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cambiar a {modoDestino && MODOS_INFO[modoDestino]?.titulo}</p>
              {verificandoModo?(
                <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Comprobando qué datos necesitamos...</p>
              ):missingFieldsModo.length>0?(
                <>
                  <p style={{ color: C.muted, fontSize: 13, marginTop: 12, marginBottom: 16, lineHeight:1.5 }}>Este modo necesita algunos datos adicionales. Habla con el Coach para completarlos antes de cambiar — te preguntará solo lo que falta.</p>
                  <p style={{ color: C.accent, fontSize: 12, marginBottom: 16 }}>Faltan: {missingFieldsModo.join(", ")}</p>
                  <button onClick={()=>{setMostrarCambioModo(false);window.location.href=`/app?codigo=${codigo}&mode_change_target=${modoDestino}&mode_change_missing=${missingFieldsModo.join(',')}`;}} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                    Ir al Coach
                  </button>
                </>
              ):mensajeCambioModo?(
                <p style={{ color: mensajeCambioModo.includes("Error")||mensajeCambioModo.includes("error")?"#ff4444":"#4CAF50", fontSize: 13, marginTop: 12 }}>{mensajeCambioModo}</p>
              ):(
                <>
                  <p style={{ color: C.muted, fontSize: 13, marginTop: 12, marginBottom: 16, lineHeight:1.5 }}>Tienes todos los datos necesarios. ¿Confirmas el cambio de modo?</p>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={confirmarCambioModo} disabled={cambiandoModo} style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:12,fontSize:14,fontWeight:600,cursor:"pointer",opacity:cambiandoModo?0.6:1}}>
                      {cambiandoModo?"Cambiando...":"Sí, confirmar"}
                    </button>
                    <button onClick={()=>setMostrarCambioModo(false)} disabled={cambiandoModo} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:12,fontSize:14,fontWeight:600,cursor:"pointer",color:C.ink}}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#141414",borderTop:`1px solid ${C.border}`,padding:"10px 16px calc(10px + env(safe-area-inset-bottom))",display:"flex",justifyContent:"space-around",maxWidth:600,margin:"0 auto",zIndex:41}}>
        {[
          {href:`/hoy?codigo=${codigo}`,icon:"🏠",label:"Hoy"},
          {href:`/progreso?codigo=${codigo}`,icon:"📈",label:"Progreso"},
          {href:`/atleta?codigo=${codigo}`,icon:"👤",label:"Atleta"},
          {href:`/perfil?codigo=${codigo}`,icon:"⚙️",label:"Perfil",active:true},
        ].map(item=>(
          <a key={item.label} href={item.href} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",opacity:item.active?1:0.5}}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:10,fontWeight:600,color:item.active?C.accent:C.muted}}>{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}