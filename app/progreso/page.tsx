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

        {/* Datos de entrenamiento */}
        {Object.keys(datosEntreno).length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚡ Datos de entrenamiento</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(datosEntreno).filter(([,v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted, fontSize: 13, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial sesiones */}
        {totalSesiones > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📋 Últimas sesiones</p>
            {[...datos.workout_history].reverse().slice(0, 10).map((s: any, i: number) => (
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