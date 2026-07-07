'use client';
import { useState, useEffect } from "react";

export default function MiAtleta() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");

  const C = {
    bg:"#0D0D0D", card:"#1A1A1A", ink:"#F0EDE8", muted:"#9A9590",
    border:"#2A2A2A", accent:"#FF6B00"
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
    }catch{ setError("Error de conexión"); }
    finally{ setCargando(false); setIniciado(true); }
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
          <h1 style={{fontSize:24,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Atleta</h1>
          <p style={{color:C.muted,fontSize:13,marginTop:4}}>Quién eres como atleta</p>
        </div>
        <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e=>e.key==="Enter"&&cargarDatos(codigo)}
          style={{width:"100%",border:`2px solid ${C.accent}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.bg,letterSpacing:2,textAlign:"center",marginBottom:12,fontFamily:"inherit"}}/>
        {error&&<p style={{color:C.accent,fontSize:12,marginBottom:12,textAlign:"center"}}>{error}</p>}
        <button onClick={()=>cargarDatos(codigo)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Ver mi atleta
        </button>
      </div>
    </div>
  );

  const test = datos?.test_atleta?.informe;
  const fechaTest = datos?.test_atleta_fecha;
  const diasDesdeTest = fechaTest ? Math.round((new Date().getTime()-new Date(fechaTest).getTime())/(24*60*60*1000)) : null;
  const debilidades = datos?.debilidades || [];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: 13 }}>Objetivo</span>
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{datos.objetivo_principal.descripcion}</span>
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
          <a href={`/app?codigo=${codigo}`} style={{ display: "block", background: C.accent, color: "#fff", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>
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
              if(typeof dist === "string" && dist.trim().startsWith("{")){
                try{
                  const parsed = JSON.parse(dist);
                  return Object.values(parsed).join(" — ");
                }catch{ return datos?.perfil?.dias || "No especificada"; }
              }
              return dist;
            })()}
          </p>
        </div>

        {/* Desarrollo del atleta */}
        {datos?.athlete_development?.length > 0 && (
          <div style={{ background: C.card, border: `1px solid #FF6B0060`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎯 Áreas de desarrollo</p>
            {datos.athlete_development.map((d:any,i:number)=>{
              const colorEstado = d.estado==="resuelta"?"#4CAF50":d.estado==="en_progreso"?"#FFD700":"#FF6B00";
              const labelEstado = d.estado==="resuelta"?"✅ Resuelta":d.estado==="en_progreso"?"⚡ En progreso":"🎯 Activa";
              return (
                <div key={i} style={{ background: C.bg, borderRadius: 12, padding: "12px 14px", marginBottom: i<datos.athlete_development.length-1?10:0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <p style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{d.area}</p>
                      <p style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>{d.indicador}</p>
                    </div>
                    <span style={{ background: `${colorEstado}20`, color: colorEstado, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100 }}>{labelEstado}</span>
                  </div>
                  {d.evidencias?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ color: C.muted, fontSize: 10, fontWeight: 600, marginBottom: 3 }}>EVIDENCIAS</p>
                      {d.evidencias.map((e:string,j:number)=>(
                        <p key={j} style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>• {e}</p>
                      ))}
                    </div>
                  )}
                  {d.plan_accion?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ color: C.accent, fontSize: 10, fontWeight: 600, marginBottom: 3 }}>PLAN DE ACCIÓN</p>
                      {d.plan_accion.map((p:string,j:number)=>(
                        <p key={j} style={{ color: C.ink, fontSize: 12, lineHeight: 1.5 }}>→ {p}</p>
                      ))}
                    </div>
                  )}
                  <p style={{ color: C.muted, fontSize: 10, marginTop: 8 }}>Detectado hace {Math.round((new Date().getTime()-new Date(d.detectado).getTime())/(24*60*60*1000))} días · Confianza {d.confianza}%</p>
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
    </div>
  );
}