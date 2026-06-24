'use client';
import { useState, useEffect } from "react";

export default function Progreso() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [iniciado, setIniciado] = useState(false);
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
  const marcas = datos?.marcas_especificas || {};
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
            <p style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>{codigo}</p>
          </div>
          <a href={`/app?codigo=${codigo}`} style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            💬 Ir al coach
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

        {/* Deteccion estancamiento */}
        {(()=>{
          const histMarcas = datos?.historial_marcas || [];
          if(histMarcas.length < 3) return null;

          // Agrupar por ejercicio
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

        {/* Prediccion de riesgo */}
        {(()=>{
          const ef = datos?.estado_fisiologico || {};
          const wh = datos?.workout_history || [];
          const ahora = new Date();
          const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
          const hace14 = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
          const sesiones7 = wh.filter((w:any) => new Date(w.fecha) >= hace7).length;
          const sesiones14 = wh.filter((w:any) => new Date(w.fecha) >= hace14).length;
          const diasSemana = parseInt(datos?.perfil?.dias||"3");

          // Riesgo lesion
          let riesgoLesion = 0;
          if(ef.fatiga_aguda && ef.fatiga_aguda > 70) riesgoLesion += 35;
          if(ef.hrv && ef.hrv < 45) riesgoLesion += 25;
          if(sesiones7 > diasSemana) riesgoLesion += 25;
          if(ef.sueno && ef.sueno < 55) riesgoLesion += 15;

          // Riesgo abandono
          let riesgoAbandono = 0;
          const esperadas14 = diasSemana * 2;
          if(sesiones14 < esperadas14 * 0.4) riesgoAbandono += 50;
          else if(sesiones14 < esperadas14 * 0.6) riesgoAbandono += 25;
          if(histFisio.length >= 3){
            const hrvValues = histFisio.slice(-5).filter((e:any)=>e.hrv).map((e:any)=>e.hrv);
            if(hrvValues.length >= 3 && hrvValues[hrvValues.length-1] < hrvValues[0] - 8) riesgoAbandono += 25;
          }
          if(adherencia.adherencia7 && adherencia.adherencia7 < 50) riesgoAbandono += 25;

          // Riesgo sobrecarga
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

        {/* Alertas inteligentes */}
        {(()=>{
          const alertas: {mensaje: string; tipo: 'warning' | 'danger'}[] = [];
          const ahora = new Date();

          // Alerta sueño bajo
          if(datos?.estado_fisiologico?.sueno && datos.estado_fisiologico.sueno < 60){
            alertas.push({mensaje: `Tu calidad de sueño está por debajo de 60/100. La recuperación puede verse afectada.`, tipo: 'warning'});
          }

          // Alerta HRV bajo
          if(datos?.estado_fisiologico?.hrv && histFisio.length >= 3){
            const mediaHrv = histFisio.slice(-7).filter((e:any)=>e.hrv).reduce((a:number,b:any)=>a+b.hrv,0) / histFisio.slice(-7).filter((e:any)=>e.hrv).length;
            if(datos.estado_fisiologico.hrv < mediaHrv * 0.85){
              alertas.push({mensaje: `Tu HRV actual (${datos.estado_fisiologico.hrv}ms) está un 15% por debajo de tu media reciente. Considera reducir intensidad.`, tipo: 'warning'});
            }
          }

          // Alerta sesiones incumplidas
          const hace14 = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
          const sesiones14 = (datos?.workout_history||[]).filter((w:any) => new Date(w.fecha) >= hace14).length;
          const diasSemana = parseInt(datos?.perfil?.dias||"3");
          const esperadas14 = diasSemana * 2;
          if(sesiones14 < esperadas14 * 0.5){
            alertas.push({mensaje: `Has completado ${sesiones14} de ${esperadas14} sesiones esperadas en los últimos 14 días. La adherencia está cayendo.`, tipo: 'danger'});
          }

          // Alerta tendencia negativa sostenida
          if(histFisio.length >= 5){
            const ultimos5 = histFisio.slice(-5);
            const hrvUltimos = ultimos5.filter((e:any)=>e.hrv).map((e:any)=>e.hrv);
            if(hrvUltimos.length >= 4 && hrvUltimos[hrvUltimos.length-1] < hrvUltimos[0] - 8){
              alertas.push({mensaje: `Tu HRV lleva ${hrvUltimos.length} días descendiendo. Forge ha notificado al coach para ajustar la carga.`, tipo: 'danger'});
            }
          }

          if(alertas.length === 0) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ background: a.tipo==='danger'?"#ff444415":"#FF6B0015", border: `1px solid ${a.tipo==='danger'?"#ff4444":"#FF6B00"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display:"flex", gap: 10, alignItems:"flex-start" }}>
                  <span style={{ fontSize: 16 }}>{a.tipo==='danger'?"🔴":"🟡"}</span>
                  <p style={{ color: C.ink, fontSize: 13, lineHeight: 1.5 }}>{a.mensaje}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Tendencias fisiologicas */}
        {histFisio.length >= 3 && (()=>{
          const ultimos = histFisio.slice(-7);
          const hrvValues = ultimos.filter((e:any) => e.hrv).map((e:any) => e.hrv);
          const suenoValues = ultimos.filter((e:any) => e.sueno).map((e:any) => e.sueno);
          const tendenciaHrv = hrvValues.length>=3?(hrvValues[hrvValues.length-1]-hrvValues[0]>5?"↑ Mejorando":hrvValues[hrvValues.length-1]-hrvValues[0]<-5?"↓ Empeorando":"→ Estable"):"Sin datos";
          const tendenciaSueno = suenoValues.length>=3?(suenoValues[suenoValues.length-1]-suenoValues[0]>5?"↑ Mejorando":suenoValues[suenoValues.length-1]-suenoValues[0]<-5?"↓ Empeorando":"→ Estable"):"Sin datos";
          const colorHrv = tendenciaHrv.includes("Mejorando")?"#4CAF50":tendenciaHrv.includes("Empeorando")?"#ff4444":C.muted;
          const colorSueno = tendenciaSueno.includes("Mejorando")?"#4CAF50":tendenciaSueno.includes("Empeorando")?"#ff4444":C.muted;
          const alerta = tendenciaHrv.includes("Empeorando") && tendenciaSueno.includes("Empeorando");
          return (
            <div style={{ background: C.card, border: `1px solid ${alerta?"#ff4444":C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📈 Tendencias ({ultimos.length} días)</p>
              {hrvValues.length>=2 && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ color:C.muted, fontSize:13 }}>HRV media</span>
                <span style={{ color:colorHrv, fontSize:13, fontWeight:600 }}>{Math.round(hrvValues.reduce((a:number,b:number)=>a+b,0)/hrvValues.length)}ms — {tendenciaHrv}</span>
              </div>}
              {suenoValues.length>=2 && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ color:C.muted, fontSize:13 }}>Sueño medio</span>
                <span style={{ color:colorSueno, fontSize:13, fontWeight:600 }}>{Math.round(suenoValues.reduce((a:number,b:number)=>a+b,0)/suenoValues.length)}/100 — {tendenciaSueno}</span>
              </div>}
              {alerta && <div style={{ background:"#ff444420", borderRadius:10, padding:"10px 12px", marginTop:8 }}>
                <p style={{ color:"#ff4444", fontSize:12, fontWeight:600 }}>⚠️ Tendencia negativa detectada</p>
                <p style={{ color:C.muted, fontSize:12, marginTop:4 }}>Forge ha notificado al coach para ajustar tu carga de entrenamiento</p>
              </div>}
            </div>
          );
        })()}

        {/* Estado fisiologico */}
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

        {/* Adherencia */}
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

        {/* Objetivo principal */}
        {datos?.objetivo_principal?.descripcion && (()=>{
          const obj = datos.objetivo_principal;
          const fechaObj = obj.fecha ? new Date(obj.fecha) : null;
          const semanasRestantes = fechaObj ? Math.max(0, Math.round((fechaObj.getTime() - new Date().getTime()) / (7*24*60*60*1000))) : null;
          const diasRestantes = fechaObj ? Math.max(0, Math.round((fechaObj.getTime() - new Date().getTime()) / (24*60*60*1000))) : null;
          const urgente = semanasRestantes !== null && semanasRestantes <= 4;
          return (
            <div style={{ background: C.card, border: `2px solid ${urgente?"#FF6B00":C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.accent, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🎯 Objetivo principal</p>
              <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{obj.descripcion}</p>
              {fechaObj && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>📅 {fechaObj.toLocaleDateString("es-ES", {day:"numeric", month:"long", year:"numeric"})}</span>
                  {semanasRestantes !== null && <span style={{ color: urgente?"#FF6B00":"#4CAF50", fontSize: 13, fontWeight: 600 }}>
                    {diasRestantes === 0 ? "¡Hoy!" : diasRestantes === 1 ? "Mañana" : `${semanasRestantes} semanas restantes`}
                  </span>}
                </div>
              )}
            </div>
          );
        })()}

        {/* Ciclo actual */}
        {ciclo.bloque && (
          <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Ciclo actual</p>
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{ciclo.bloque}</p>
            <p style={{ color: C.muted, fontSize: 13 }}>{ciclo.objetivo}</p>
          </div>
        )}

        {/* Marcas específicas */}
        {Object.keys(marcas).length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🏆 Marcas</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(marcas).filter(([,v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted, fontSize: 13, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Métricas del atleta */}
        {Object.keys(datosEntreno).length > 0 && (()=>{
          const METRICAS_CLAVE = ['fc_maxima','fc_reposo','umbral','potencia','z1','z2','z3','z4','z5','ftp','vo2','ritmo','peso','altura','frecuencia'];
          const metricasFiltradas = Object.entries(datosEntreno).filter(([k,v]) => v && METRICAS_CLAVE.some(m => k.toLowerCase().includes(m)));
          if(metricasFiltradas.length===0) return null;
          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚡ Métricas del atleta</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {metricasFiltradas.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.muted, fontSize: 13, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                    <span style={{ color: C.accent, fontSize: 13, fontWeight: 600 }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Historial sesiones */}
        {totalSesiones > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📋 Últimas sesiones</p>
            {[...datos.workout_history].sort((a:any,b:any)=>new Date(b.fecha).getTime()-new Date(a.fecha).getTime()).slice(0, 10).map((s: any, i: number) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{s.tipo?.replace(/_/g, " ") || "Sesión"}</span>
                  <span style={{ color: C.muted, fontSize: 11 }}>{new Date(s.fecha).toLocaleDateString("es-ES")}</span>
                </div>
                {s.duracion && <span style={{ color: C.muted, fontSize: 12 }}>⏱ {s.duracion} min</span>}
                {s.sensacion && <span style={{ color: C.accent, fontSize: 12, marginLeft: 12 }}>● {s.sensacion}</span>}
                {s.notas && <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{s.notas}</p>}
              </div>
            ))}
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