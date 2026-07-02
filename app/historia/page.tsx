'use client';
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const TIPO_CONFIG: Record<string, {emoji:string;label:string;color:string}> = {
  workout: { emoji:"🏋️", label:"Entrenamiento", color:"#FF6B00" },
  race: { emoji:"🏆", label:"Competición", color:"#FFD700" },
  pr: { emoji:"⚡", label:"Nuevo récord", color:"#4CAF50" },
  injury: { emoji:"🩹", label:"Lesión", color:"#ff4444" },
  illness: { emoji:"🤒", label:"Enfermedad", color:"#ff8844" },
  rest: { emoji:"😴", label:"Descanso", color:"#9A9590" },
  travel: { emoji:"✈️", label:"Viaje", color:"#64B5F6" },
  objective_change: { emoji:"🎯", label:"Cambio de objetivo", color:"#CE93D8" },
  block_start: { emoji:"🚀", label:"Inicio de bloque", color:"#FF6B00" },
  block_end: { emoji:"✅", label:"Fin de bloque", color:"#4CAF50" },
};

export default function Historia() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [eventos, setEventos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoEvento, setNuevoEvento] = useState({date:"",type:"workout",title:"",notas:""});

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

  const [bloques, setBloques] = useState<any[]>([]);
  const [historialMarcas, setHistorialMarcas] = useState<{fecha:string;ejercicio:string;valor:string}[]>([]);
  const [ejercicioSeleccionado, setEjercicioSeleccionado] = useState<string>("");
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<any>(null);

  const cargarDatos = async(cod:string)=>{
    setCargando(true);
    try{
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"obtener_historia",codigo:cod})});
      const data = await res.json();
      if(data.error){ setError("Código no encontrado"); return; }
      setEventos(data.eventos||[]);
      const resUser = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"recuperar_usuario",codigo:cod})});
      const dataUser = await resUser.json();
      setBloques(dataUser?.data?.analisis_bloques||[]);
      setHistorialMarcas(dataUser?.data?.historial_marcas||[]);
      setWorkoutHistory(dataUser?.data?.workout_history||[]);
      setAutenticado(true);
    }catch{ setError("Error de conexión"); }
    finally{ setCargando(false); setIniciado(true); }
  };

  const registrarEvento = async()=>{
    if(!nuevoEvento.date||!nuevoEvento.title) return;
    await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      action:"registrar_evento",
      codigo,
      datos:{ evento:{ date:nuevoEvento.date, type:nuevoEvento.type, title:nuevoEvento.title, data:{notas:nuevoEvento.notas} } }
    })});
    setMostrarFormulario(false);
    setNuevoEvento({date:"",type:"workout",title:"",notas:""});
    cargarDatos(codigo);
  };

  // Agrupar eventos por año y mes
  const eventosPorMes: Record<string, any[]> = {};
  eventos.forEach(e => {
    const key = e.date.substring(0,7);
    if(!eventosPorMes[key]) eventosPorMes[key] = [];
    eventosPorMes[key].push(e);
  });

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
          <h1 style={{fontSize:24,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Historia</h1>
          <p style={{color:C.muted,fontSize:13,marginTop:4}}>Tu evolución como atleta</p>
        </div>
        <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e=>e.key==="Enter"&&cargarDatos(codigo)}
          style={{width:"100%",border:`2px solid ${C.accent}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.bg,letterSpacing:2,textAlign:"center",marginBottom:12,fontFamily:"inherit"}}/>
        {error&&<p style={{color:C.accent,fontSize:12,marginBottom:12,textAlign:"center"}}>{error}</p>}
        <button onClick={()=>cargarDatos(codigo)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Ver mi historia
        </button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif",padding:"24px 16px"}}>
      <div style={{maxWidth:600,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <img src="/logo-forge.png" alt="Forge" style={{width:40,height:40,objectFit:"contain"}}/>
          <div>
            <h1 style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:"Georgia,serif"}}>Mi Historia</h1>
            <p style={{color:C.accent,fontSize:12,fontWeight:600}}>{codigo}</p>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={()=>setMostrarFormulario(!mostrarFormulario)}
              style={{background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              + Añadir
            </button>
            <a href={`/progreso?codigo=${codigo}`}
              style={{background:C.card,color:C.ink,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 14px",fontSize:13,textDecoration:"none"}}>
              📊 Progreso
            </a>
            <a href={`/app?codigo=${codigo}`}
              style={{background:C.card,color:C.ink,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 14px",fontSize:13,textDecoration:"none"}}>
              💬 Coach
            </a>
          </div>
        </div>

        {/* Formulario añadir evento */}
        {mostrarFormulario&&(
          <div style={{background:C.card,border:`1px solid ${C.accent}`,borderRadius:16,padding:"16px 18px",marginBottom:16}}>
            <p style={{color:C.ink,fontSize:14,fontWeight:700,marginBottom:12}}>Registrar evento pasado</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input type="date" value={nuevoEvento.date} onChange={e=>setNuevoEvento(p=>({...p,date:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}/>
              <select value={nuevoEvento.type} onChange={e=>setNuevoEvento(p=>({...p,type:e.target.value}))}
                style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}>
                {Object.entries(TIPO_CONFIG).map(([k,v])=>(
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
              <input value={nuevoEvento.title} onChange={e=>setNuevoEvento(p=>({...p,title:e.target.value}))}
                placeholder="Título del evento (ej: Trail 18km, PR sentadilla 150kg...)"
                style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}/>
              <input value={nuevoEvento.notas} onChange={e=>setNuevoEvento(p=>({...p,notas:e.target.value}))}
                placeholder="Notas adicionales (opcional)"
                style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={registrarEvento}
                  style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Registrar
                </button>
                <button onClick={()=>setMostrarFormulario(false)}
                  style={{background:"none",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calendario visual */}
        {(()=>{
          const anio = mesActual.getFullYear();
          const mes = mesActual.getMonth();
          const primerDia = new Date(anio, mes, 1);
          const ultimoDia = new Date(anio, mes+1, 0);
          const diasEnMes = ultimoDia.getDate();
          const diaSemanaInicio = (primerDia.getDay()+6)%7; // lunes=0

          const eventosPorDia: Record<string, any[]> = {};
          workoutHistory.forEach((w:any) => {
            const key = new Date(w.fecha).toISOString().split('T')[0];
            if(!eventosPorDia[key]) eventosPorDia[key]=[];
            eventosPorDia[key].push({...w, esWorkout:true});
          });
          eventos.forEach((e:any) => {
            const key = e.date;
            if(!eventosPorDia[key]) eventosPorDia[key]=[];
            eventosPorDia[key].push({...e, esEvento:true});
          });

          const getIconoDia = (items:any[]) => {
            if(!items||items.length===0) return null;
            const primero = items[0];
            if(primero.esEvento){
              const map:Record<string,string> = {race:"🏆",pr:"⚡",injury:"🩹",illness:"🤒",travel:"✈️",rest:"😴",objective_change:"🎯",block_start:"🚀",block_end:"✅"};
              return map[primero.type]||"📌";
            }
            const tipo = (primero.tipo||"").toLowerCase();
            if(tipo.includes("carrera")) return "🏃";
            if(tipo.includes("box")||tipo.includes("crossfit")||tipo.includes("fuerza")) return "🏋️";
            if(tipo.includes("descanso")) return "😴";
            return "💪";
          };

          const celdas = [];
          for(let i=0;i<diaSemanaInicio;i++) celdas.push(null);
          for(let d=1;d<=diasEnMes;d++) celdas.push(d);

          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <button onClick={()=>setMesActual(new Date(anio,mes-1,1))} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}}>‹</button>
                <p style={{color:C.ink,fontSize:14,fontWeight:700,textTransform:"capitalize"}}>{mesActual.toLocaleDateString("es-ES",{month:"long",year:"numeric"})}</p>
                <button onClick={()=>setMesActual(new Date(anio,mes+1,1))} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
                {["L","M","X","J","V","S","D"].map(d=>(
                  <div key={d} style={{textAlign:"center",fontSize:10,color:C.muted,fontWeight:600}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                {celdas.map((d,i)=>{
                  if(d===null) return <div key={i}/>;
                  const fechaKey = `${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const items = eventosPorDia[fechaKey];
                  const icono = getIconoDia(items);
                  const esHoy = new Date().toISOString().split('T')[0]===fechaKey;
                  return (
                    <div key={i} onClick={()=>items&&setDiaSeleccionado({fecha:fechaKey,items})}
                      style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:8,background:esHoy?`${C.accent}20`:items?C.bg:"transparent",border:esHoy?`1px solid ${C.accent}`:"1px solid transparent",cursor:items?"pointer":"default",fontSize:9}}>
                      <span style={{color:esHoy?C.accent:C.muted,fontSize:10,fontWeight:esHoy?700:400}}>{d}</span>
                      {icono && <span style={{fontSize:13,marginTop:1}}>{icono}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Modal dia seleccionado */}
        {diaSeleccionado && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"24px"}} onClick={()=>setDiaSeleccionado(null)}>
            <div style={{background:"#1C1C1C",borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"70vh",overflowY:"auto",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <p style={{color:C.ink,fontSize:15,fontWeight:700}}>{new Date(diaSeleccionado.fecha).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</p>
                <button onClick={()=>setDiaSeleccionado(null)} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
              </div>
              {diaSeleccionado.items.map((item:any,i:number)=>(
                <div key={i} style={{background:C.bg,borderRadius:12,padding:14,marginBottom:10}}>
                  {item.esEvento ? (
                    <>
                      <p style={{color:C.accent,fontSize:12,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{item.type}</p>
                      <p style={{color:C.ink,fontSize:14,fontWeight:600}}>{item.title}</p>
                    </>
                  ) : (
                    <>
                      <p style={{color:C.ink,fontSize:14,fontWeight:600,marginBottom:6,textTransform:"capitalize"}}>{item.tipo?.replace(/_/g,' ')}</p>
                      <p style={{color:C.muted,fontSize:12,lineHeight:1.6}}>{item.notas}</p>
                      {item.sensacion && <span style={{color:C.accent,fontSize:11,marginTop:4,display:"inline-block"}}>● {item.sensacion}</span>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evolución */}
        {historialMarcas.length > 0 && (()=>{
          const ejercicios = Array.from(new Set(historialMarcas.map((m:any)=>m.ejercicio)));
          const ejercicioActivo = ejercicioSeleccionado || ejercicios[0];
          const datosEjercicio = historialMarcas
            .filter((m:any)=>m.ejercicio===ejercicioActivo)
            .map((m:any)=>({
              fecha: new Date(m.fecha).toLocaleDateString("es-ES",{day:"numeric",month:"short"}),
              valor: parseFloat(String(m.valor).replace(/[^\d.,]/g,'').replace(',','.'))||0,
              valorOriginal: m.valor
            }))
            .filter((d:any)=>!isNaN(d.valor) && d.valor>0)
            .sort((a:any,b:any)=>new Date(a.fecha).getTime()-new Date(b.fecha).getTime());

          const ultimoValor = datosEjercicio[datosEjercicio.length-1];
          const primerValor = datosEjercicio[0];
          const mejora = ultimoValor && primerValor ? ((ultimoValor.valor-primerValor.valor)/primerValor.valor*100).toFixed(1) : null;

          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📈 Evolución</p>
              <select value={ejercicioActivo} onChange={e=>setEjercicioSeleccionado(e.target.value)}
                style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, color:C.ink, background:C.bg, marginBottom:16, fontFamily:"inherit" }}>
                {ejercicios.map((ej:string)=>(
                  <option key={ej} value={ej}>{ej.replace(/_/g,' ')}</option>
                ))}
              </select>

              {datosEjercicio.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={datosEjercicio}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="fecha" stroke={C.muted} fontSize={11}/>
                      <YAxis stroke={C.muted} fontSize={11}/>
                      <Tooltip contentStyle={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}} labelStyle={{color:C.ink}}/>
                      <Line type="monotone" dataKey="valor" stroke={C.accent} strokeWidth={2} dot={{fill:C.accent,r:4}}/>
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                    <div>
                      <p style={{ color:C.muted, fontSize:11 }}>Último registro</p>
                      <p style={{ color:C.ink, fontSize:16, fontWeight:700 }}>{ultimoValor?.valorOriginal}</p>
                    </div>
                    {mejora && (
                      <div style={{ textAlign:"right" }}>
                        <p style={{ color:C.muted, fontSize:11 }}>Evolución</p>
                        <p style={{ color: parseFloat(mejora)>=0?"#4CAF50":"#ff4444", fontSize:16, fontWeight:700 }}>
                          {parseFloat(mejora)>=0?"+":""}{mejora}%
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ color:C.muted, fontSize:13, textAlign:"center", padding:"20px 0" }}>
                  Necesitas al menos 2 registros de {ejercicioActivo?.replace(/_/g,' ')} para ver la evolución.
                </p>
              )}
            </div>
          );
        })()}

        {/* Historial de bloques */}
        {bloques.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📋 Historial de bloques</p>
            {[...bloques].reverse().map((b:any, i:number) => (
              <div key={i} style={{ padding: "12px 0", borderBottom: i < bloques.length-1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ color:C.ink, fontSize:13, fontWeight:700, textTransform:"capitalize" }}>{b.bloque_completado}</span>
                  <span style={{ color:C.muted, fontSize:11 }}>{b.fecha}</span>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                  <span style={{ background: b.resultado==="cumplido"?"#4CAF5020":b.resultado==="parcial"?"#FF6B0020":"#ff444420", color: b.resultado==="cumplido"?"#4CAF50":b.resultado==="parcial"?"#FF6B00":"#ff4444", fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:100 }}>
                    {b.resultado==="cumplido"?"✅ Cumplido":b.resultado==="parcial"?"⚡ Parcial":"❌ No cumplido"}
                  </span>
                  {b.adherencia_estimada && <span style={{ background:C.border, color:C.muted, fontSize:11, padding:"2px 8px", borderRadius:100 }}>📊 {b.adherencia_estimada}</span>}
                </div>
                {b.siguiente_bloque && <p style={{ color:C.muted, fontSize:12 }}>→ Siguiente: <span style={{color:C.ink}}>{b.siguiente_bloque}</span></p>}
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {eventos.length === 0 ? (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"40px",textAlign:"center"}}>
            <p style={{fontSize:40,marginBottom:12}}>📖</p>
            <p style={{color:C.ink,fontSize:16,fontWeight:600,marginBottom:8}}>Tu historia empieza aquí</p>
            <p style={{color:C.muted,fontSize:13}}>Reporta entrenamientos, competiciones y logros al coach. Forge construirá tu historia deportiva automáticamente.</p>
          </div>
        ) : (
          Object.entries(eventosPorMes).map(([mes, evs]) => (
            <div key={mes} style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:C.muted,marginBottom:12}}>
                {new Date(mes+"-01").toLocaleDateString("es-ES",{month:"long",year:"numeric"})}
              </div>
              {evs.map((ev:any,i:number)=>{
                const config = TIPO_CONFIG[ev.type] || {emoji:"📌",label:ev.type,color:C.accent};
                return (
                  <div key={i} style={{display:"flex",gap:14,marginBottom:12,position:"relative"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:`${config.color}20`,border:`1px solid ${config.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                        {config.emoji}
                      </div>
                      {i<evs.length-1&&<div style={{width:1,flex:1,background:C.border,marginTop:4}}/>}
                    </div>
                    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",flex:1,marginBottom:i<evs.length-1?8:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <span style={{color:C.ink,fontSize:14,fontWeight:600}}>{ev.title}</span>
                        <span style={{color:C.muted,fontSize:11,flexShrink:0,marginLeft:8}}>
                          {new Date(ev.date).toLocaleDateString("es-ES",{day:"numeric",month:"short"})}
                        </span>
                      </div>
                      <span style={{background:`${config.color}20`,color:config.color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:100}}>
                        {config.label}
                      </span>
                      {ev.data?.notas&&<p style={{color:C.muted,fontSize:12,marginTop:6}}>{ev.data.notas}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

      </div>
    </div>
  );
}