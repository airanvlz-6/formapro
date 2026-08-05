'use client';
import { useState, useEffect } from "react";

export default function Hoy() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [error, setError] = useState("");
  const [mostrarMas, setMostrarMas] = useState(false);

  const C = {
    bg: "#0D0D0D", card: "#1A1A1A", ink: "#F0EDE8", muted: "#9A9590",
    border: "#2A2A2A", accent: "#FF6B00", accentLight: "#2A1A0D",
    success: "#4CAF50", successLight: "#1A2A1A"
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
    try {
      const resUsuario = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recuperar_usuario", codigo: cod }) });
      const dataUsuario = await resUsuario.json();
      if (dataUsuario.error) { setError("Código no encontrado"); return; }
      setDatos(dataUsuario.data);
      setAutenticado(true);

      const resBriefing = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "obtener_daily_briefing", codigo: cod }) });
      const dataBriefing = await resBriefing.json();
      if (dataBriefing?.briefing) setBriefing(dataBriefing.briefing);
    } catch { setError("Error de conexión"); }
    finally { setCargando(false); setIniciado(true); }
  };

  if (cargando && !iniciado) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <img src="/logo-forge.png" alt="Forge" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: "50%" }} />
    </div>
  );

  if (!autenticado) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", padding: 24 }}>
      <div style={{ background: C.card, borderRadius: 20, padding: 32, width: "100%", maxWidth: 360, border: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/logo-forge.png" alt="Forge" style={{ width: 60, height: 60, objectFit: "contain", marginBottom: 12 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, fontFamily: "Georgia,serif" }}>Hoy</h1>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Tu briefing diario</p>
        </div>
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código FP-XXXXX"
          onKeyDown={e => e.key === "Enter" && cargarDatos(codigo)}
          style={{ width: "100%", border: `2px solid ${C.accent}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, color: C.ink, background: C.bg, letterSpacing: 2, textAlign: "center", marginBottom: 12, fontFamily: "inherit" }} />
        {error && <p style={{ color: C.accent, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</p>}
        <button onClick={() => cargarDatos(codigo)} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Ver mi briefing
        </button>
      </div>
    </div>
  );

  const primerNombre = datos?.perfil?.nombre || "";
  const horaActual = new Date().getHours();
  const saludo = horaActual < 12 ? "Buenos días" : horaActual < 20 ? "Buenas tardes" : "Buenas noches";
  const esModoSupervision = briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", paddingBottom: 90 }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo-forge.png" alt="Forge" style={{ width: 36, height: 36, objectFit: "contain" }} />
            <span style={{ fontSize: 18, fontWeight: 900, color: C.ink, letterSpacing: 1 }}>FORGE</span>
          </div>
          <a href={`/app?codigo=${codigo}`} style={{ width: 36, height: 36, borderRadius: "50%", background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 16 }}>
            💬
          </a>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, fontFamily: "Georgia, serif", marginBottom: 4 }}>{saludo}{primerNombre ? `, ${primerNombre}` : ""} 👋</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{(briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta")?"Tu resumen de hoy.":"Esto es lo más importante hoy."}</p>
        </div>

        {(briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta") && (
          <>
            {briefing?.ultimoEntreno ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>💪 Último entreno</p>
                <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{briefing.ultimoEntreno.tipo}</p>
                <p style={{ color: C.muted, fontSize: 12 }}>{new Date(briefing.ultimoEntreno.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} · Sensación: {briefing.ultimoEntreno.sensacion || "no reportada"}</p>
              </div>
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${C.card}, #1F1611)`, border: `1px solid ${C.accent}35`, borderRadius: 16, padding: "20px 18px", marginBottom: 14 }}>
                <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>👋 Empecemos</p>
                <p style={{ color: C.ink, fontSize: 15, fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>Cuéntame tu último entreno y empiezo a analizarlo.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
                  {["📸 Sube una foto de tu entreno o app de reloj","✍️ Escribe qué hiciste y cómo te sentiste","❓ Pregúntame cualquier duda técnica"].map((s,i)=>(
                    <p key={i} style={{ color: C.muted, fontSize: 13 }}>{s}</p>
                  ))}
                </div>
              </div>
            )}
            {(briefing?.recuperacion?.hrv || briefing?.recuperacion?.sueno) && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🧬 Estado de recuperación</p>
                <div style={{ display: "flex", gap: 20 }}>
                  {briefing.recuperacion.hrv && <div><p style={{ color: C.ink, fontSize: 22, fontWeight: 800 }}>{briefing.recuperacion.hrv}<span style={{ fontSize: 12 }}>ms</span></p><p style={{ color: C.muted, fontSize: 11 }}>HRV</p></div>}
                  {briefing.recuperacion.sueno && <div><p style={{ color: C.ink, fontSize: 22, fontWeight: 800 }}>{briefing.recuperacion.sueno}</p><p style={{ color: C.muted, fontSize: 11 }}>Sueño</p></div>}
                </div>
              </div>
            )}
          </>
        )}

        {!(briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta") && (
        <a href={`/atleta?codigo=${codigo}`} style={{ display: "block", textDecoration: "none", background: `linear-gradient(135deg, ${C.successLight}, #14201a)`, border: `1px solid ${C.success}40`, borderRadius: 16, padding: "18px 18px", marginBottom: 14 }}>
          <p style={{ color: C.success, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>🧠 Forge te conoce mejor</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Nivel de conocimiento</span>
            <span style={{ color: C.success, fontSize: 20, fontWeight: 900 }}>{briefing?.nivelConocimiento || 40}%</span>
          </div>
          <div style={{ height: 7, background: C.border, borderRadius: 100, marginBottom: briefing?.ultimoAprendizaje ? 12 : 0 }}>
            <div style={{ height: 7, borderRadius: 100, background: C.success, width: `${briefing?.nivelConocimiento || 40}%`, transition: "width 0.8s ease" }} />
          </div>
          {briefing?.ultimoAprendizaje && (
            <>
              <p style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Último aprendizaje</p>
              <p style={{ color: C.ink, fontSize: 13, lineHeight: 1.5 }}>{briefing.ultimoAprendizaje}</p>
            </>
          )}
        </a>
        )}

        {briefing?.descubrimiento && (
          <div style={{ background: C.card, border: `1px solid ${C.accent}50`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <p style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>✨ Nuevo descubrimiento</p>
            <p style={{ color: C.ink, fontSize: 14, lineHeight: 1.6 }}>{briefing.descubrimiento.descubrimiento}</p>
          </div>
        )}

        {briefing?.objetivo && !(briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta") && (
          <a href={`/atleta?codigo=${codigo}`} style={{ display: "block", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🎯 Objetivo principal</p>
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{briefing.objetivo}</p>
            {briefing.progresoObjetivo && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 100, marginRight: 12 }}>
                    <div style={{ height: 8, borderRadius: 100, background: `linear-gradient(90deg, ${C.accent}, #FFB07A)`, width: `${briefing.progresoObjetivo.percentage}%`, transition: "width 0.8s ease" }} />
                  </div>
                  <span style={{ color: C.accent, fontSize: 16, fontWeight: 900 }}>{briefing.progresoObjetivo.percentage}%</span>
                </div>
                <p style={{ color: C.muted, fontSize: 12 }}>Estás <span style={{ color: C.accent, fontWeight: 700 }}>{briefing.progresoObjetivo.percentage}%</span> más cerca de tu objetivo.</p>
              </>
            )}
          </a>
        )}

        {!(briefing?.modoEntrada==="supervision"||briefing?.modoEntrada==="consulta") && (
        <a href={`/plan?codigo=${codigo}`} style={{ display: "block", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
          <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🔥 Hoy toca</p>
          {briefing?.sesionHoy ? (
            <>
              <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{briefing.sesionHoy.titulo}</p>
              {briefing.sesionHoy.por_que && <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{briefing.sesionHoy.por_que}</p>}
            </>
          ) : (
            <p style={{ color: C.muted, fontSize: 13 }}>Sin sesión programada para hoy en Mi Plan.</p>
          )}
        </a>
        )}

        {briefing?.evolucionDestacada && (
          <a href={`/atleta?codigo=${codigo}`} style={{ display: "block", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>📈 Tu evolución</p>
            <p style={{ color: C.ink, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{briefing.evolucionDestacada.nombre_visible}</p>
            <div style={{ height: 6, background: C.border, borderRadius: 100 }}>
              <div style={{ height: 6, borderRadius: 100, background: C.accent, width: `${briefing.evolucionDestacada.progreso}%`, transition: "width 0.8s ease" }} />
            </div>
          </a>
        )}

        {briefing?.ultimoInsight && (
          <a href={`/historia?codigo=${codigo}`} style={{ display: "block", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>💡 Tu último Forge Insight</p>
            <p style={{ color: C.ink, fontSize: 13, lineHeight: 1.6 }}>{briefing.ultimoInsight.substring(0, 180)}{briefing.ultimoInsight.length > 180 ? "..." : ""}</p>
          </a>
        )}

        <a href={`/app?codigo=${codigo}`} style={{ display: "block", background: C.accent, color: "#fff", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center", marginTop: 8 }}>
          💬 Hablar con el Coach
        </a>

      </div>

      {mostrarMas && (
        <div onClick={() => setMostrarMas(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 74, left: 16, right: 16, maxWidth: 600, margin: "0 auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 8 }}>
            {[
              { href: `/app?codigo=${codigo}`, icon: "💬", label: "Coach" },
              { href: `/historia?codigo=${codigo}`, icon: "📖", label: "Mi Historia" },
              { href: "https://t.me/forgeapp_es", icon: "🧪", label: "Forge Labs", external: true },
              { href: `/app?codigo=${codigo}&ajustes=1`, icon: "⚙️", label: "Ajustes" },
            ].map(item => (
              <a key={item.label} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", textDecoration: "none", borderRadius: 10 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#141414", borderTop: `1px solid ${C.border}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "space-around", maxWidth: 600, margin: "0 auto", zIndex: 41 }}>
        {[
          { href: `/hoy?codigo=${codigo}`, icon: "🏠", label: "Hoy", active: true },
          { href: `/progreso?codigo=${codigo}`, icon: "📈", label: "Progreso", active: false },
          esModoSupervision
          ? { href: `/historia?codigo=${codigo}`, icon: "📖", label: "Historia", active: false }
          : { href: `/plan?codigo=${codigo}`, icon: "📅", label: "Plan", active: false },
          { href: `/atleta?codigo=${codigo}`, icon: "👤", label: "Atleta", active: false },
        ].map(item => (
          <a key={item.label} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textDecoration: "none", opacity: item.active ? 1 : 0.5 }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: item.active ? C.accent : C.muted }}>{item.label}</span>
          </a>
        ))}
        <button onClick={() => setMostrarMas(true)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
          <span style={{ fontSize: 20 }}>☰</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.muted }}>Más</span>
        </button>
      </div>
    </div>
  );
}