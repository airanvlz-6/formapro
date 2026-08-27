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

  // Migrado del panel antiguo: codigo/email/editar perfil/eliminar cuenta
  const [mostrarCodigoReal, setMostrarCodigoReal] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [errorPerfil, setErrorPerfil] = useState("");
  const [mensajePerfil, setMensajePerfil] = useState("");
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [perfilEdit, setPerfilEdit] = useState<Record<string,string>>({});
  const [confirmandoEliminarCuenta, setConfirmandoEliminarCuenta] = useState(false);
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false);

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

  const [missingFieldsDef, setMissingFieldsDef] = useState<any[]>([]);
  const [pasoActualModo, setPasoActualModo] = useState(0);
  const [respuestaTemp, setRespuestaTemp] = useState<any>(null);
  const [guardandoCampo, setGuardandoCampo] = useState(false);

  const iniciarCambioModo = async(destino:string)=>{
    setModoDestino(destino);
    setVerificandoModo(true);
    setMostrarCambioModo(true);
    setPasoActualModo(0);
    setRespuestaTemp(null);
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verificar_cambio_modo",codigo,datos:{targetMode:destino}})});
    const data = await res.json();
    setMissingFieldsModo(data?.missingFields || []);
    setMissingFieldsDef(data?.missingFieldsConDefinicion || []);
    setVerificandoModo(false);
  };

  const guardarCampoActual = async()=>{
    const campo = missingFieldsDef[pasoActualModo];
    if(!campo || respuestaTemp===null || (Array.isArray(respuestaTemp)&&respuestaTemp.length===0)) return;
    setGuardandoCampo(true);
    await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"guardar_campo_mode_change",codigo,datos:{fieldId:campo.id,value:respuestaTemp}})});
    setGuardandoCampo(false);
    setRespuestaTemp(null);
    if(pasoActualModo<missingFieldsDef.length-1){
      setPasoActualModo(pasoActualModo+1);
    }else{
      // Todos los campos guardados — reverificar por si acaso y pasar a confirmacion
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verificar_cambio_modo",codigo,datos:{targetMode:modoDestino}})});
      const data = await res.json();
      setMissingFieldsModo(data?.missingFields || []);
      setMissingFieldsDef(data?.missingFieldsConDefinicion || []);
    }
  };

  const confirmarCambioModo = async()=>{
    setCambiandoModo(true);
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cambiar_modo_atleta",codigo,datos:{targetMode:modoDestino}})});
    const data = await res.json();
    setCambiandoModo(false);
    if(data?.ok){
      setMensajeCambioModo("listo");
    }else{
      setMensajeCambioModo(data?.error || "Error al cambiar de modo");
    }
  };

  const actualizarPerfil = async()=>{
    setErrorPerfil("");setMensajePerfil("");
    let codigoDestino = codigo;
    if(nuevoCodigo.trim().length>0){
      if(nuevoCodigo.trim().length<5){ setErrorPerfil("El código debe tener al menos 5 caracteres."); return; }
      const resCambio = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cambiar_codigo_usuario",codigo,datos:{nuevoCodigo:nuevoCodigo.trim().toUpperCase()}})});
      const dataCambio = await resCambio.json();
      if(dataCambio?.error){ setErrorPerfil(dataCambio.error); return; }
      codigoDestino = nuevoCodigo.trim().toUpperCase();
    }
    if(nuevoEmail.trim().length>0){
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"actualizar_usuario",codigo:codigoDestino,datos:{email:nuevoEmail.trim().toLowerCase()}})});
      const data = await res.json();
      if(data?.error){ setErrorPerfil(data.error); return; }
    }
    if(nuevoCodigo.trim().length===0 && nuevoEmail.trim().length===0){ setErrorPerfil("No hay cambios que guardar."); return; }
    setMensajePerfil("Guardado correctamente.");
    if(codigoDestino!==codigo){
      setTimeout(()=>{ window.location.href=`/perfil?codigo=${codigoDestino}`; },1200);
    } else {
      setTimeout(()=>setMensajePerfil(""),3000);
    }
  };

  const guardarEdicionPerfil = async()=>{
    const nuevosPerfil = {...datos.perfil, ...perfilEdit};
    await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"actualizar_usuario",codigo,datos:{perfil:nuevosPerfil}})});
    setDatos((d:any)=>({...d, perfil:nuevosPerfil}));
    setEditandoPerfil(false);
    setMensajePerfil("Perfil actualizado. El coach tendrá en cuenta los cambios.");
    setTimeout(()=>setMensajePerfil(""),3000);
  };

  const ejecutarEliminarCuenta = async()=>{
    setEliminandoCuenta(true);
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"eliminar_cuenta",codigo})});
    const data = await res.json();
    if(data?.ok){
      window.location.href="/";
    }else{
      setEliminandoCuenta(false);
      setConfirmandoEliminarCuenta(false);
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

        {/* Código de acceso */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Código de acceso</p>
              <p style={{ color: C.accent, fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>{mostrarCodigoReal ? codigo : "••••••"}</p>
            </div>
            <button onClick={()=>setMostrarCodigoReal(!mostrarCodigoReal)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.muted, cursor: "pointer" }}>
              {mostrarCodigoReal ? "Ocultar" : "Ver"}
            </button>
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ color: C.ink, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cambiar código</p>
            <input value={nuevoCodigo} onChange={e=>setNuevoCodigo(e.target.value.toUpperCase().replace(/\s/g,""))}
              placeholder="Nuevo código (mínimo 5 caracteres)"
              style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.bg, fontFamily: "inherit", letterSpacing: 1 }}/>
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ color: C.ink, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Actualizar email</p>
            <input value={nuevoEmail} onChange={e=>setNuevoEmail(e.target.value)}
              placeholder={datos?.email || "tu@email.com"}
              style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.bg, fontFamily: "inherit" }}/>
          </div>
          {errorPerfil && <p style={{ color: "#ff4444", fontSize: 12, marginBottom: 10 }}>{errorPerfil}</p>}
          {mensajePerfil && <p style={{ color: "#4CAF50", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{mensajePerfil}</p>}
          <button onClick={actualizarPerfil} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Guardar código y email
          </button>
        </div>

        {/* Editar datos del perfil */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>✏️ Editar datos del perfil</p>
            <button onClick={()=>{ setEditandoPerfil(!editandoPerfil); setPerfilEdit(datos?.perfil||{}); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: C.muted, cursor: "pointer" }}>
              {editandoPerfil ? "Cancelar" : "Editar"}
            </button>
          </div>
          {!editandoPerfil ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[["Días disponibles", datos?.perfil?.dias_disponibles ? (Array.isArray(datos.perfil.dias_disponibles) ? datos.perfil.dias_disponibles.join(", ") : datos.perfil.dias_disponibles) : datos?.perfil?.dias], ["Duración sesión", datos?.perfil?.duracion], ["Lesiones", datos?.perfil?.lesiones]].map(([label, val]) => val ? (
                <div key={label as string} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <span style={{ color: C.muted, minWidth: 130 }}>{label as string}:</span>
                  <span style={{ color: C.ink, fontWeight: 500 }}>{val as string}</span>
                </div>
              ) : null)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <p style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Lesiones / limitaciones actuales</p>
                <textarea value={perfilEdit.lesiones || ""} onChange={e=>setPerfilEdit(p=>({...p, lesiones: e.target.value}))} rows={2}
                  placeholder="Ej: rodilla derecha, lumbar... o ninguna"
                  style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, color: C.ink, background: C.bg, fontFamily: "inherit", resize: "none" }}/>
              </div>
              <div>
                <p style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Objetivo actual</p>
                <textarea value={perfilEdit.objetivo_detalle || ""} onChange={e=>setPerfilEdit(p=>({...p, objetivo_detalle: e.target.value}))} rows={2}
                  placeholder="Ej: correr 10K en menos de 50 min..."
                  style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, color: C.ink, background: C.bg, fontFamily: "inherit", resize: "none" }}/>
              </div>
              <button onClick={guardarEdicionPerfil} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Guardar cambios del perfil
              </button>
            </div>
          )}
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

        {/* Cuenta */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🔒 Cuenta</p>
          {!confirmandoEliminarCuenta ? (
            <button onClick={()=>setConfirmandoEliminarCuenta(true)} style={{ width: "100%", background: "none", border: "1px solid #ff444460", borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#ff4444", fontFamily: "inherit" }}>
              Eliminar cuenta
            </button>
          ) : (
            <div style={{ background: "#ff444410", border: "1px solid #ff444440", borderRadius: 12, padding: 14 }}>
              <p style={{ color: "#ff4444", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>¿Seguro que quieres eliminar tu cuenta?</p>
              <p style={{ color: C.muted, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>Se eliminará toda tu planificación, historial y datos. Esta acción no se puede deshacer.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={ejecutarEliminarCuenta} disabled={eliminandoCuenta} style={{ flex: 1, background: "#ff4444", color: "#fff", border: "none", borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: eliminandoCuenta ? 0.6 : 1 }}>
                  {eliminandoCuenta ? "Eliminando..." : "Sí, eliminar"}
                </button>
                <button onClick={()=>setConfirmandoEliminarCuenta(false)} disabled={eliminandoCuenta} style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.ink, fontFamily: "inherit" }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal de cambio de modo */}
        {mostrarCambioModo&&(
          <div onClick={()=>{if(!cambiandoModo){setMostrarCambioModo(false);setMensajeCambioModo("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,padding:22,maxWidth:420,width:"100%",border:`1px solid ${C.border}`}}>
              <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cambiar a {modoDestino && MODOS_INFO[modoDestino]?.titulo}</p>
              {verificandoModo?(
                <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Comprobando qué datos necesitamos...</p>
              ):missingFieldsDef.length>0?(
                <div style={{marginTop:12}}>
                  <div style={{width:"100%",height:3,background:C.border,borderRadius:10,marginBottom:16}}>
                    <div style={{height:3,borderRadius:10,background:C.accent,width:`${((pasoActualModo+1)/missingFieldsDef.length)*100}%`,transition:"width 0.3s ease"}}/>
                  </div>
                  <p style={{ color: C.ink, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{missingFieldsDef[pasoActualModo]?.label}</p>
                  {missingFieldsDef[pasoActualModo]?.tipo==="opciones"&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
                      {missingFieldsDef[pasoActualModo]?.opciones?.map((op:string)=>(
                        <button key={op} onClick={()=>setRespuestaTemp(op)} style={{padding:"8px 14px",borderRadius:100,border:`2px solid ${respuestaTemp===op?C.accent:C.border}`,background:respuestaTemp===op?C.accent:"transparent",color:respuestaTemp===op?"#fff":C.ink,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{op}</button>
                      ))}
                    </div>
                  )}
                  {missingFieldsDef[pasoActualModo]?.tipo==="dias_semana"&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
                      {["lunes","martes","miercoles","jueves","viernes","sabado","domingo"].map(d=>{
                        const sel=Array.isArray(respuestaTemp)?respuestaTemp:[];
                        return (
                          <button key={d} onClick={()=>setRespuestaTemp(sel.includes(d)?sel.filter((x:string)=>x!==d):[...sel,d])} style={{padding:"8px 14px",borderRadius:100,border:`2px solid ${sel.includes(d)?C.accent:C.border}`,background:sel.includes(d)?C.accent:"transparent",color:sel.includes(d)?"#fff":C.ink,fontSize:12.5,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{d}</button>
                        );
                      })}
                    </div>
                  )}
                  {missingFieldsDef[pasoActualModo]?.tipo==="texto"&&(
                    <input value={respuestaTemp||""} onChange={e=>setRespuestaTemp(e.target.value)} placeholder="Escribe tu respuesta" style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit",marginBottom:16}}/>
                  )}
                  <button onClick={guardarCampoActual} disabled={guardandoCampo||respuestaTemp===null||(Array.isArray(respuestaTemp)&&respuestaTemp.length===0)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:12,fontSize:14,fontWeight:600,cursor:"pointer",opacity:(guardandoCampo||respuestaTemp===null||(Array.isArray(respuestaTemp)&&respuestaTemp.length===0))?0.4:1}}>
                    {guardandoCampo?"Guardando...":pasoActualModo<missingFieldsDef.length-1?"Siguiente":"Continuar"}
                  </button>
                </div>
              ):mensajeCambioModo==="listo"?(
                <div>
                  <p style={{ color: "#4CAF50", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>✅ Modo {MODOS_INFO[modoDestino!]?.titulo} activado</p>
                  <p style={{ color: C.muted, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>Tu perfil ya está listo. El siguiente paso es hablar con el Coach para generar tu primera semana de entrenamiento.</p>
                  <a href={`/app?codigo=${codigo}&generar_semana_focus=1`} style={{ display: "block", textAlign: "center", width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                    Ir al Coach y generar mi semana →
                  </a>
                </div>
              ):mensajeCambioModo?(
                <p style={{ color: "#ff4444", fontSize: 13, marginTop: 12 }}>{mensajeCambioModo}</p>
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