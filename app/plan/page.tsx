'use client';
import { useState, useEffect } from "react";

const DIAS = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];
const TIPO_CONFIG: Record<string, {emoji:string;color:string}> = {
  carrera: { emoji:"🏃", color:"#4CAF50" },
  box: { emoji:"🏋️", color:"#FF6B00" },
  crossfit: { emoji:"🏋️", color:"#FF6B00" },
  descanso: { emoji:"😴", color:"#9A9590" },
  hyrox: { emoji:"🔥", color:"#FF6B00" },
  trail: { emoji:"🏔️", color:"#4CAF50" },
  fuerza: { emoji:"💪", color:"#FF6B00" },
  natacion: { emoji:"🏊", color:"#64B5F6" },
  ciclismo: { emoji:"🚴", color:"#64B5F6" },
  otro: { emoji:"⚡", color:"#FF6B00" },
};

export default function Plan() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [objetivoPrincipal, setObjetivoPrincipal] = useState<any>(null);
  const [weekStart, setWeekStart] = useState("");
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");
  const [sesionDetalle, setSesionDetalle] = useState<any>(null);

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
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"obtener_plan_semana",codigo:cod})});
      const data = await res.json();
      if(data.error){ setError("Código no encontrado"); return; }
      setPlan(data.plan);
      setWeekStart(data.weekStart);
      setAutenticado(true);
      fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"recuperar_usuario",codigo:cod})})
        .then(r=>r.json()).then(d=>setObjetivoPrincipal(d?.data?.objetivo_principal||null)).catch(()=>{});
    }catch{ setError("Error de conexión"); }
    finally{ setCargando(false); setIniciado(true); }
  };

  const getTipoConfig = (tipo:string) => {
    const key = Object.keys(TIPO_CONFIG).find(k => tipo?.toLowerCase().includes(k));
    return key ? TIPO_CONFIG[key] : TIPO_CONFIG.otro;
  };

  const getConfianzaColor = (conf:number) => conf>=80?"#4CAF50":conf>=60?C.accent:"#ff4444";

  if(cargando && !iniciado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src="/logo-forge.png" alt="Forge" style={{width:80,height:80,objectFit:"contain",borderRadius:"50%"}}/>
      <div style={{display:"flex",gap:6}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.accent,animation:"pulse 1s infinite",animationDelay:`${i*0.2}s`}}/>)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );

  if(!autenticado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:24}}>
      <div style={{background:C.card,borderRadius:20,padding:32,width:"100%",maxWidth:360,border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src="/logo-forge.png" alt="Forge" style={{width:60,height:60,objectFit:"contain",marginBottom:12}}/>
          <h1 style={{fontSize:24,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Plan</h1>
          <p style={{color:C.muted,fontSize:13,marginTop:4}}>Tu semana de entrenamiento</p>
        </div>
        <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e=>e.key==="Enter"&&cargarDatos(codigo)}
          style={{width:"100%",border:`2px solid ${C.accent}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.bg,letterSpacing:2,textAlign:"center",marginBottom:12,fontFamily:"inherit"}}/>
        {error&&<p style={{color:C.accent,fontSize:12,marginBottom:12,textAlign:"center"}}>{error}</p>}
        <button onClick={()=>cargarDatos(codigo)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Ver mi plan
        </button>
      </div>
    </div>
  );

  const sesiones = plan?.sessions || [];
  const sesionesCompletadas = sesiones.filter((s:any) => s.completada).length;
  const totalSesiones = sesiones.filter((s:any) => s.tipo !== "descanso").length;
  const confianza = plan?.confidence || 100;

  // Calcular día actual
  const hoy = new Date();
  const diaHoy = DIAS[hoy.getDay() === 0 ? 6 : hoy.getDay() - 1];

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif",padding:"24px 16px"}}>
      <div style={{maxWidth:600,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <img src="/logo-forge.png" alt="Forge" style={{width:40,height:40,objectFit:"contain"}}/>
          <div>
            <h1 style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Plan</h1>
            <p style={{color:C.accent,fontSize:12,fontWeight:600}}>{codigo}</p>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <a href={`/progreso?codigo=${codigo}`} style={{background:C.card,color:C.ink,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:13,textDecoration:"none"}}>📊</a>
            <a href={`/historia?codigo=${codigo}`} style={{background:C.card,color:C.ink,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:13,textDecoration:"none"}}>📖</a>
            <a href={`/app?codigo=${codigo}`} style={{background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:"8px 12px",fontSize:13,textDecoration:"none",fontWeight:600}}>💬 Coach</a>
          </div>
        </div>

        {!plan ? (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"40px",textAlign:"center"}}>
            <p style={{fontSize:40,marginBottom:12}}>📅</p>
            <p style={{color:C.ink,fontSize:16,fontWeight:600,marginBottom:8}}>Sin plan esta semana</p>
            <p style={{color:C.muted,fontSize:13,marginBottom:20}}>Pídele al coach que genere tu planificación semanal y aparecerá aquí automáticamente.</p>
            <a href={`/app?codigo=${codigo}`} style={{background:C.accent,color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,textDecoration:"none"}}>
              💬 Ir al coach
            </a>
          </div>
        ) : (
          <>
            {/* Objetivo principal */}
            {objetivoPrincipal?.descripcion && (()=>{
              const fechaObj = objetivoPrincipal.fecha ? new Date(objetivoPrincipal.fecha) : null;
              const diasRestantes = fechaObj ? Math.max(0, Math.round((fechaObj.getTime() - new Date().getTime()) / (24*60*60*1000))) : null;
              return (
                <div style={{background:C.card,border:`2px solid ${C.accent}`,borderRadius:16,padding:"14px 18px",marginBottom:16}}>
                  <p style={{color:C.accent,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>🏆 Objetivo principal</p>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <p style={{color:C.ink,fontSize:15,fontWeight:700}}>{objetivoPrincipal.descripcion}</p>
                    {diasRestantes !== null && <span style={{color:C.muted,fontSize:12}}>{diasRestantes} días</span>}
                  </div>
                </div>
              );
            })()}

            {/* Info semana */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:16}}>
              <p style={{color:C.ink,fontSize:15,fontWeight:700,marginBottom:2,textTransform:"capitalize"}}>{plan.block_name}</p>
              <p style={{color:C.muted,fontSize:12,marginBottom:10}}>
                Semana {plan.week_number}{plan.total_weeks_block?` de ${plan.total_weeks_block}`:""} · {new Date(weekStart).toLocaleDateString("es-ES",{day:"numeric",month:"long"})} — {new Date(new Date(weekStart).getTime()+6*24*60*60*1000).toLocaleDateString("es-ES",{day:"numeric",month:"long"})}
              </p>
              {plan.total_weeks_block && (
                <div style={{height:6,background:C.border,borderRadius:100,marginBottom:14,display:"flex",gap:2,overflow:"hidden"}}>
                  {Array.from({length:plan.total_weeks_block}).map((_,i)=>(
                    <div key={i} style={{flex:1,background:i<plan.week_number?C.accent:C.border,borderRadius:2}}/>
                  ))}
                </div>
              )}
              {plan.week_objective && (
                <div style={{background:C.bg,borderRadius:10,padding:"10px 12px",marginBottom:14}}>
                  <p style={{color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Objetivo de la semana</p>
                  <p style={{color:C.ink,fontSize:13}}>{plan.week_objective}</p>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:C.muted,fontSize:12}}>Sesiones completadas</span>
                <span style={{color:C.ink,fontSize:13,fontWeight:700}}>{sesionesCompletadas}/{totalSesiones}</span>
              </div>
              <div style={{height:6,background:C.border,borderRadius:100,marginBottom:14}}>
                <div style={{height:6,borderRadius:100,background:"#4CAF50",width:`${totalSesiones>0?(sesionesCompletadas/totalSesiones)*100:0}%`,transition:"width 0.8s ease"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <span style={{color:C.muted,fontSize:12}}>Confianza del plan</span>
                  <p style={{color:getConfianzaColor(confianza),fontSize:11,marginTop:2}}>
                    {confianza>=90?"Plan estable, sin cambios previstos":confianza>=70?"Esperando nuevos datos":"Es probable que la planificación cambie"}
                  </p>
                </div>
                <span style={{color:getConfianzaColor(confianza),fontSize:18,fontWeight:700}}>{confianza}%</span>
              </div>
            </div>

            {/* Sesiones */}
            {DIAS.map(dia => {
              const sesion = sesiones.find((s:any) => s.dia === dia);
              const esHoy = dia === diaHoy;
              const config = sesion ? getTipoConfig(sesion.tipo) : {emoji:"—",color:C.muted};
              const esDescanso = sesion?.tipo === "descanso" || !sesion;

              return (
                <div key={dia} onClick={()=>sesion&&!esDescanso&&setSesionDetalle(sesion)}
                  style={{
                    background: esHoy ? `${C.accent}15` : C.card,
                    border: `1px solid ${esHoy ? C.accent : sesion?.modificado ? "#FFD700" : C.border}`,
                    borderRadius:12,
                    padding:"12px 16px",
                    marginBottom:8,
                    cursor: sesion && !esDescanso ? "pointer" : "default",
                    transition:"all 0.2s"
                  }}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:`${config.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                      {sesion?.completada ? "✅" : config.emoji}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:esHoy?C.accent:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{dia}</span>
                        {esHoy&&<span style={{background:C.accent,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:100}}>HOY</span>}
                        {sesion?.modificado&&<span style={{background:"#FFD70020",color:"#FFD700",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:100}}>⚠️ Modificado</span>}
                      </div>
                      <span style={{color:esDescanso?C.muted:C.ink,fontSize:13,fontWeight:esDescanso?400:600}}>
                        {sesion?.titulo || (esDescanso?"Descanso":"Sin sesión")}
                      </span>
                      {sesion?.completada && sesion?.descripcion_real && (
                        <p style={{color:"#4CAF50",fontSize:10,marginTop:2}}>✅ Completada</p>
                      )}
                    </div>
                    {sesion&&!esDescanso&&<span style={{color:C.muted,fontSize:16}}>›</span>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Modal detalle sesión */}
        {sesionDetalle&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"24px"}} onClick={()=>setSesionDetalle(null)}>
            <div style={{background:"#1C1C1C",borderRadius:"20px",padding:"24px",width:"100%",maxWidth:600,maxHeight:"80vh",overflowY:"auto",border:"1px solid #2A2A2A"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{color:C.ink,fontSize:16,fontWeight:700}}>{sesionDetalle.titulo}</h3>
                <button onClick={()=>setSesionDetalle(null)} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
              </div>
{sesionDetalle.descripcion_real && (
                <div style={{background:"#4CAF5015",border:"1px solid #4CAF5040",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                  <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:6}}>✅ Lo que realmente hiciste:</p>
                  <p style={{color:"#D4D0CB",fontSize:13,lineHeight:1.6}}>{sesionDetalle.titulo_real}</p>
                  <p style={{color:C.muted,fontSize:12,lineHeight:1.6,marginTop:4}}>{sesionDetalle.descripcion_real}</p>
                </div>
              )}
              <p style={{color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Planificado:</p>
              {sesionDetalle.descripcion&&(
                <div style={{marginBottom:12}}>
                  {(()=>{
                    // Normalizar: dividir por saltos de línea Y por patrones de bloque conocidos
                    let texto = sesionDetalle.descripcion;
                    const patronesBloque = /(Calentamiento|Bloque principal|Bloque fuerza|Bloque técnica|Metcon|Vuelta a la calma|Notas técnicas|Objetivo)(\s*\([^)]*\))?:/gi;
                    texto = texto.replace(patronesBloque, (match:string) => `\n\n${match}`);
                    const lineas = texto.split(/\n+/).filter((l:string)=>l.trim());
                    return lineas.map((linea:string,i:number)=>{
                      const t=linea.trim();
                      const esEncabezado = /^(Calentamiento|Bloque principal|Bloque fuerza|Bloque técnica|Metcon|Vuelta a la calma|Notas técnicas|Objetivo)\s*(\([^)]*\))?:/i.test(t);
                      const esItem = /^[-.•]/.test(t) || /^[A-Z]\)/.test(t);
                      const limpio = t.replace(/^[-.•]\s*/,'').replace(/\*\*/g,'').replace(/^#+\s*/,'');
                      if(esEncabezado){
                        const partes = limpio.split(":");
                        return (
                          <div key={i} style={{marginTop:i>0?14:0,marginBottom:6}}>
                            <p style={{color:C.accent,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{partes[0]}</p>
                            {partes[1] && <p style={{color:"#D4D0CB",fontSize:13,lineHeight:1.7}}>{partes.slice(1).join(":").trim()}</p>}
                          </div>
                        );
                      }
                      if(esItem){
                        return <p key={i} style={{color:"#D4D0CB",fontSize:13,lineHeight:1.7,marginBottom:4,paddingLeft:12,position:"relative"}}><span style={{position:"absolute",left:0,color:C.muted}}>•</span>{limpio}</p>;
                      }
                      return <p key={i} style={{color:"#D4D0CB",fontSize:13,lineHeight:1.7,marginBottom:6}}>{limpio}</p>;
                    });
                  })()}
                </div>
              )}
              {sesionDetalle.modificado&&(
                <div style={{background:"#FFD70015",border:"1px solid #FFD70040",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
                  <p style={{color:"#FFD700",fontSize:12,fontWeight:700,marginBottom:4}}>⚠️ Sesión modificada</p>
                  <p style={{color:C.muted,fontSize:12}}>{sesionDetalle.motivo_modificacion}</p>
                </div>
              )}
              <a href={`/app?codigo=${codigo}`} style={{display:"block",background:C.accent,color:"#fff",borderRadius:10,padding:"12px",fontSize:14,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
                💬 Hablar con el coach
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}