'use client';
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Progreso() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [iniciado, setIniciado] = useState(false);
  const [metricaGrafico, setMetricaGrafico] = useState<"hrv"|"sueno">("hrv");
  const C = {
    bg: "#0D0D0D", card: "#1A1A1A", ink: "#F0EDE8", muted: "#9A9590",
    border: "#2A2A2A", accent: "#FF6B00"
  };

useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigoUrl = params.get("codigo");
    if (codigoUrl) {
      setCodigo(codigoUrl.toUpperCase());
      cargarDatos(codigoUrl.toUpperCase());
    } else {
      setCargando(false);
      setIniciado(true);
    }
  }, []);

  const cargarDatos = async (cod: string) => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recuperar_usuario", codigo: cod })
      });
      const data = await res.json();
      if (data.error) { setError("Código no encontrado"); return; }
      setDatos(data.data);
      setAutenticado(true);
    } catch { setError("Error de conexión"); }
    finally { setCargando(false); }
  };

  const totalSesiones = datos?.workout_history?.length || 0;
  const diasActivo = datos?.total_visitas || 0;
  const ciclo = datos?.ciclo_actual || {};
  const datosEntreno = datos?.datos_entrenamiento || {};
  const [adherencia, setAdherencia] = useState<{adherencia7?:number;adherencia28?:number;adherenciaBloque?:number;diasSemana?:number}>({});
  const histFisio = datos?.historial_fisiologico || [];

  useEffect(()=>{
    if(autenticado && codigo){
      fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"calcular_adherencia",codigo})})
        .then(r=>r.json()).then(d=>setAdherencia(d)).catch(()=>{});
    }
  },[autenticado,codigo]);

  if (cargando && !iniciado) return (
    <div style={{minHeight:"100vh",background:"#0D0D0D",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src="/logo-forge.png" alt="Forge" style={{width:100,height:100,objectFit:"contain",borderRadius:"50%"}}/>
      <div style={{display:"flex",gap:6}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#FF6B00",animation:"pulse 1s infinite",animationDelay:`${i*0.2}s`}}/>)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );

  if (!autenticado) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
      <div style={{ background: C.card, borderRadius: 20, padding: 32, width: "100%", maxWidth: 360, border: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/logo-forge.png" alt="Forge" style={{ width: 60, height: 60, objectFit: "contain", marginBottom: 12 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, fontFamily: "Georgia, serif" }}>Mi Progreso</h1>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Introduce tu código para ver tu evolución</p>
        </div>
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e => e.key === "Enter" && cargarDatos(codigo)}
          style={{ width: "100%", border: `2px solid ${C.accent}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, color: C.ink, background: C.bg, letterSpacing: 2, textAlign: "center", marginBottom: 12, fontFamily: "inherit" }} />
        {error && <p style={{ color: C.accent, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</p>}
        <button onClick={() => cargarDatos(codigo)} disabled={cargando}
          style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {cargando ? "Cargando..." : "Ver mi progreso"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <img src="/logo-forge.png" alt="Forge" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: "Georgia, serif" }}>Mi Progreso</h1>
            <p style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>••••••</p>
          </div>
          <a href={`/plan?codigo=${codigo}`} style={{ background: C.card, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, textDecoration: "none" }}>📅</a>
          <a href={`/historia?codigo=${codigo}`} style={{ background: C.card, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, textDecoration: "none" }}>📖</a>
          <a href={`/app?codigo=${codigo}`} style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            💬 Coach
          </a>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Sesiones", value: totalSesiones, emoji: "🏋️" },
            { label: "Visitas", value: diasActivo, emoji: "📅" },
            { label: "Semana", value: ciclo.semana ? `${ciclo.semana}/${ciclo.totalSemanas||"?"}` : "-", emoji: "🔄" },
          ].map(item => (
            <div key={item.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{item.emoji}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: "Georgia, serif" }}>{item.value}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* 1. Estado fisiologico */}
        {datos?.estado_fisiologico && Object.keys(datos.estado_fisiologico).some(k => datos.estado_fisiologico[k]) && (()=>{
          const ef = datos.estado_fisiologico;
          const hrv = ef.hrv;
          const sueno = ef.sueno;
          const fatiga = ef.fatiga_aguda;
          const rhr = ef.rhr;

          let recuperacion = "Sin datos";
          let recomendacion = "Reporta tu HRV y sueño al coach para obtener recomendaciones";
          let colorRec = C.muted;

          if(hrv && sueno){
            if(hrv >= 60 && sueno >= 75){ recuperacion = "Excelente"; recomendacion = "Apto para entrenamiento intenso"; colorRec = "#4CAF50"; }
            else if(hrv >= 50 && sueno >= 60){ recuperacion = "Buena"; recomendacion = "Apto para entrenamiento normal"; colorRec = "#4CAF50"; }
            else if(hrv >= 40 && sueno >= 50){ recuperacion = "Moderada"; recomendacion = "Reduce intensidad, prioriza técnica"; colorRec = C.accent; }
            else { recuperacion = "Baja"; recomendacion = "Sesión de recuperación activa recomendada"; colorRec = "#ff4444"; }
          }

          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>⚡ Estado fisiológico actual</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {hrv && <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>HRV</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{hrv} ms</span>
                </div>}
                {sueno && <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>Calidad sueño</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{sueno}/100</span>
                </div>}
                {rhr && <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>FC reposo</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{rhr} bpm</span>
                </div>}
                {fatiga && <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>Fatiga acumulada</span>
                  <span style={{ color: fatiga>70?"#ff4444":fatiga>50?C.accent:"#4CAF50", fontSize: 13, fontWeight: 600 }}>
                    {fatiga>70?"Alta":fatiga>50?"Moderada":"Baja"}
                  </span>
                </div>}
              </div>
              <div style={{ background: C.bg, borderRadius: 12, padding: "12px 14px", borderLeft: `3px solid ${colorRec}` }}>
                <p style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Recuperación</p>
                <p style={{ color: colorRec, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{recuperacion}</p>
                <p style={{ color: C.muted, fontSize: 12 }}>→ {recomendacion}</p>
              </div>
            </div>
          );
        })()}

        {/* 2. Tendencias fisiologicas */}
        {histFisio.length >= 3 && (()=>{
          const ultimos = histFisio.slice(-7);
          const hrvValues = ultimos.filter((e:any) => e.hrv).map((e:any) => ({fecha: new Date(e.fecha).toLocaleDateString("es-ES",{day:"numeric",month:"short"}), valor: e.hrv}));
          const suenoValues = ultimos.filter((e:any) => e.sueno).map((e:any) => ({fecha: new Date(e.fecha).toLocaleDateString("es-ES",{day:"numeric",month:"short"}), valor: e.sueno}));
          const datosActivos = metricaGrafico==="hrv" ? hrvValues : suenoValues;
          const valoresSolo = datosActivos.map((d:{fecha:string;valor:number})=>d.valor);
          const media = valoresSolo.length>0 ? Math.round(valoresSolo.reduce((a:number,b:number)=>a+b,0)/valoresSolo.length) : 0;
          const ultimosN = valoresSolo.slice(-3);
          const umbral = metricaGrafico==="hrv" ? Math.max(10, media*0.15) : 12;
          const tendencia = ultimosN.length>=3?(ultimosN[2]-ultimosN[0]>umbral?"↑ Mejorando":ultimosN[2]-ultimosN[0]<-umbral?"↓ Fluctuando":"→ Estable"):"Sin datos suficientes";
          const colorTendencia = tendencia.includes("Mejorando")?"#4CAF50":tendencia.includes("Fluctuando")?"#FF6B00":C.muted;

          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <p style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>📈 Tendencias (7 días)</p>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setMetricaGrafico("hrv")} style={{background:metricaGrafico==="hrv"?C.accent:C.bg,color:metricaGrafico==="hrv"?"#fff":C.muted,border:`1px solid ${metricaGrafico==="hrv"?C.accent:C.border}`,borderRadius:100,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>HRV</button>
                  <button onClick={()=>setMetricaGrafico("sueno")} style={{background:metricaGrafico==="sueno"?C.accent:C.bg,color:metricaGrafico==="sueno"?"#fff":C.muted,border:`1px solid ${metricaGrafico==="sueno"?C.accent:C.border}`,borderRadius:100,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Sueño</button>
                </div>
              </div>

              {datosActivos.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={datosActivos}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="fecha" stroke={C.muted} fontSize={10}/>
                      <YAxis stroke={C.muted} fontSize={10}/>
                      <Tooltip contentStyle={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}} labelStyle={{color:C.ink}}/>
                      <Line type="monotone" dataKey="valor" stroke={C.accent} strokeWidth={2} dot={{fill:C.accent,r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <span style={{color:C.muted,fontSize:12}}>Media: {media}{metricaGrafico==="hrv"?"ms":"/100"}</span>
                    <span style={{color:colorTendencia,fontSize:12,fontWeight:600}}>{tendencia}</span>
                  </div>
                </>
              ) : (
                <p style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>Necesitas más registros de {metricaGrafico==="hrv"?"HRV":"sueño"} para ver la tendencia.</p>
              )}
            </div>
          );
        })()}

        {/* 3. Alertas inteligentes */}
        {(()=>{
          const alertas: {mensaje: string; tipo: 'precaucion' | 'warning' | 'danger'}[] = [];
          const ahora = new Date();

          if(datos?.estado_fisiologico?.sueno && datos.estado_fisiologico.sueno < 50){
            alertas.push({mensaje: `Tu calidad de sueño está por debajo de 50/100. La recuperación puede verse afectada de forma significativa.`, tipo: 'warning'});
          }

          if(datos?.estado_fisiologico?.hrv && histFisio.length >= 3){
            const mediaHrv = histFisio.slice(-7).filter((e:any)=>e.hrv).reduce((a:number,b:any)=>a+b.hrv,0) / histFisio.slice(-7).filter((e:any)=>e.hrv).length;
            const ratioHrv = datos.estado_fisiologico.hrv / mediaHrv;
            if(ratioHrv < 0.70){
              alertas.push({mensaje: `Tu HRV actual (${datos.estado_fisiologico.hrv}ms) está un 30% o más por debajo de tu media reciente. Reduce intensidad hoy.`, tipo: 'danger'});
            } else if(ratioHrv < 0.85){
              alertas.push({mensaje: `Tu HRV actual (${datos.estado_fisiologico.hrv}ms) está algo por debajo de tu media reciente. Vigila cómo te sientes.`, tipo: 'precaucion'});
            }
          }

          const hace14 = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
          const sesiones14 = (datos?.workout_history||[]).filter((w:any) => new Date(w.fecha) >= hace14).length;
          const diasSemana = parseInt(datos?.perfil?.dias||"3");
          const esperadas14 = diasSemana * 2;
          if(sesiones14 < esperadas14 * 0.5){
            alertas.push({mensaje: `Has completado ${sesiones14} de ${esperadas14} sesiones esperadas en los últimos 14 días. La adherencia está cayendo.`, tipo: 'danger'});
          }

          if(histFisio.length >= 4){
            const ultimos4 = histFisio.slice(-4);
            const hrvUltimos = ultimos4.filter((e:any)=>e.hrv).map((e:any)=>e.hrv);
            // Detectar descenso CONSECUTIVO real, no solo diferencia entre extremos
            if(hrvUltimos.length >= 4){
              const esDescensoConsecutivo = hrvUltimos[1]<hrvUltimos[0] && hrvUltimos[2]<hrvUltimos[1] && hrvUltimos[3]<hrvUltimos[2];
              const caidaTotal = hrvUltimos[0] - hrvUltimos[hrvUltimos.length-1];
              if(esDescensoConsecutivo && caidaTotal > 15){
                alertas.push({mensaje: `Tu HRV lleva ${hrvUltimos.length} días consecutivos descendiendo (${hrvUltimos[0]}ms → ${hrvUltimos[hrvUltimos.length-1]}ms). Forge ha notificado al coach para ajustar la carga.`, tipo: 'danger'});
              }
            }
          }

          if(alertas.length === 0) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              {alertas.map((a, i) => {
                const colorAlerta = a.tipo==='danger'?"#ff4444":a.tipo==='warning'?"#FF6B00":"#FFD700";
                const emojiAlerta = a.tipo==='danger'?"🔴":a.tipo==='warning'?"🟡":"🟢";
                return (
                  <div key={i} style={{ background: `${colorAlerta}15`, border: `1px solid ${colorAlerta}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display:"flex", gap: 10, alignItems:"flex-start" }}>
                    <span style={{ fontSize: 16 }}>{emojiAlerta}</span>
                    <p style={{ color: C.ink, fontSize: 13, lineHeight: 1.5 }}>{a.mensaje}</p>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Deteccion estancamiento */}
        {(()=>{
          const histMarcas = datos?.historial_marcas || [];
          if(histMarcas.length < 3) return null;

          const porEjercicio: Record<string, {fecha:string;valor:string}[]> = {};
          histMarcas.forEach((m:any) => {
            if(!porEjercicio[m.ejercicio]) porEjercicio[m.ejercicio] = [];
            porEjercicio[m.ejercicio].push({fecha:m.fecha, valor:m.valor});
          });

          const estancados: string[] = [];
          Object.entries(porEjercicio).forEach(([ejercicio, registros]) => {
            if(registros.length < 2) return;
            const primero = new Date(registros[0].fecha);
            const ultimo = new Date(registros[registros.length-1].fecha);
            const semanas = Math.round((ultimo.getTime()-primero.getTime())/(7*24*60*60*1000));
            if(semanas >= 6 && registros[0].valor === registros[registros.length-1].valor){
              estancados.push(ejercicio);
            }
          });

          if(estancados.length === 0) return null;
          return (
            <div style={{ background: C.card, border: `1px solid #FF6B00`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>⚠️ Posible estancamiento detectado</p>
              {estancados.map((e:string) => (
                <div key={e} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12 }}>📊</span>
                  <p style={{ color:C.muted, fontSize:13 }}>Sin mejora en <span style={{color:C.ink,fontWeight:600}}>{e}</span> durante 6+ semanas. Forge ajustará el estímulo.</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* 4. Prediccion de riesgo */}
        {(()=>{
          const ef = datos?.estado_fisiologico || {};
          const wh = datos?.workout_history || [];
          const ahora = new Date();
          const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
          const hace14 = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
          const sesiones7 = wh.filter((w:any) => new Date(w.fecha) >= hace7).length;
          const sesiones14 = wh.filter((w:any) => new Date(w.fecha) >= hace14).length;
          const diasSemana = parseInt(datos?.perfil?.dias||"3");

          let riesgoLesion = 0;
          if(ef.fatiga_aguda && ef.fatiga_aguda > 70) riesgoLesion += 35;
          if(ef.hrv && ef.hrv < 45) riesgoLesion += 25;
          if(sesiones7 > diasSemana) riesgoLesion += 25;
          if(ef.sueno && ef.sueno < 55) riesgoLesion += 15;

          let riesgoAbandono = 0;
          const esperadas14 = diasSemana * 2;
          if(sesiones14 < esperadas14 * 0.4) riesgoAbandono += 50;
          else if(sesiones14 < esperadas14 * 0.6) riesgoAbandono += 25;
          if(histFisio.length >= 3){
            const hrvValues = histFisio.slice(-5).filter((e:any)=>e.hrv).map((e:any)=>e.hrv);
            if(hrvValues.length >= 3 && hrvValues[hrvValues.length-1] < hrvValues[0] - 8) riesgoAbandono += 25;
          }
          if(adherencia.adherencia7 && adherencia.adherencia7 < 50) riesgoAbandono += 25;

          let riesgoSobrecarga = 0;
          if(ef.fatiga_aguda && ef.fatiga_aguda > 60) riesgoSobrecarga += 30;
          if(ef.sueno && ef.sueno < 65) riesgoSobrecarga += 25;
          if(ef.hrv && ef.hrv < 50) riesgoSobrecarga += 25;
          if(sesiones7 >= diasSemana) riesgoSobrecarga += 20;

          const getColor = (v:number) => v >= 70 ? "#ff4444" : v >= 40 ? "#FF6B00" : "#4CAF50";
          const getLabel = (v:number) => v >= 70 ? "Alto" : v >= 40 ? "Moderado" : "Bajo";
          const getEmoji = (v:number) => v >= 70 ? "🔴" : v >= 40 ? "🟡" : "🟢";

          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🎯 Predicción de riesgo</p>
              {[
                { label: "Riesgo de lesión", value: riesgoLesion },
                { label: "Riesgo de abandono", value: riesgoAbandono },
                { label: "Riesgo de sobrecarga", value: riesgoSobrecarga },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: C.muted }}>{item.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: getColor(item.value) }}>
                      {getEmoji(item.value)} {getLabel(item.value)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: C.border, borderRadius: 100 }}>
                    <div style={{ height: 6, borderRadius: 100, background: getColor(item.value), width:`${Math.min(item.value,100)}%`, transition:"width 0.8s ease" }}/>
                  </div>
                </div>
              ))}
              <p style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Basado en HRV, sueño, fatiga y adherencia reciente</p>
            </div>
          );
        })()}

        {/* Estado respecto al objetivo */}
        {datos?.objetivo_principal?.descripcion && adherencia.adherencia28 !== undefined && (()=>{
          const adh = adherencia.adherencia28 || 0;
          let estado = "🟡 Según lo previsto";
          let color = C.accent;
          if (adh >= 85) { estado = "🟢 Adelantado"; color = "#4CAF50"; }
          else if (adh < 60) { estado = "🔴 Riesgo de no llegar"; color = "#ff4444"; }
          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Estado respecto al objetivo</p>
              <p style={{ color, fontSize: 16, fontWeight: 700 }}>{estado}</p>
            </div>
          );
        })()}

        {/* 5. Adherencia */}
        {(adherencia.adherencia7!==undefined) && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📊 Adherencia al entrenamiento</p>
            {[
              { label: "Esta semana", value: adherencia.adherencia7||0 },
              { label: "Bloque actual", value: adherencia.adherenciaBloque||0 },
              { label: "Últimos 28 días", value: adherencia.adherencia28||0 },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: item.value>=80?"#4CAF50":item.value>=60?C.accent:"#ff4444" }}>{item.value}%</span>
                </div>
                <div style={{ height: 8, background: C.border, borderRadius: 100 }}>
                  <div style={{ height: 8, borderRadius: 100, background: item.value>=80?"#4CAF50":item.value>=60?C.accent:"#ff4444", width:`${item.value}%`, transition:"width 0.8s ease" }}/>
                </div>
              </div>
            ))}
            <p style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Basado en {adherencia.diasSemana} días/semana planificados</p>
          </div>
        )}

        

        {/* 7. Ciclo actual */}
        {ciclo.bloque && (
          <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Ciclo actual</p>
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{ciclo.bloque}</p>
            <p style={{ color: C.muted, fontSize: 13 }}>{ciclo.objetivo}</p>
          </div>
        )}

        

        {totalSesiones === 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🏋️</p>
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Sin sesiones registradas aún</p>
            <p style={{ color: C.muted, fontSize: 13 }}>Reporta tus entrenamientos al coach y aparecerán aquí automáticamente</p>
          </div>
        )}

      </div>
    </div>
  );
}
