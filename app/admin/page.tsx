'use client';
import { useState, useEffect } from "react";

const ADMIN_CODE = "060385";

export default function AdminPanel() {
  const [codigo, setCodigo] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const login = () => {
    if (codigo.trim().toUpperCase() === ADMIN_CODE) {
      setAutenticado(true);
      cargarDatos();
    } else {
      setError("Código incorrecto");
    }
  };

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_stats", codigo: ADMIN_CODE })
      });
      const data = await res.json();
      setDatos(data);
    } catch { setError("Error al cargar datos"); }
    finally { setCargando(false); }
  };

  const C = {
    bg: "#F6F4F0", card: "#FFFFFF", ink: "#1A1A1A", muted: "#6B6560",
    border: "#E5E0D8", green: "#1E5C3A", greenLight: "#D8F3DC",
    warm: "#D4622A", warmLight: "#FDF0EB"
  };

  if (!autenticado) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
      <div style={{ background: C.card, borderRadius: 20, padding: 32, width: "100%", maxWidth: 360, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 32, marginBottom: 16, textAlign: "center" }}>⚡</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: C.ink, marginBottom: 8, textAlign: "center" }}>Forge Admin</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 24, textAlign: "center" }}>Introduce tu código de administrador</p>
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
          placeholder="Tu código admin"
          onKeyDown={e => e.key === "Enter" && login()}
          style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, color: C.ink, background: C.bg, fontFamily: "inherit", marginBottom: 12, textAlign: "center", letterSpacing: 2 }} />
        {error && <p style={{ color: C.warm, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</p>}
        <button onClick={login} style={{ width: "100%", background: C.green, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Entrar
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, color: C.ink }}>⚡ Forge Admin</h1>
          <button onClick={cargarDatos} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", color: C.muted }}>
            🔄 Actualizar
          </button>
        </div>

        {cargando && <p style={{ color: C.muted, textAlign: "center" }}>Cargando datos...</p>}

        {datos && !cargando && (
          <>
            {/* Resumen */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Total usuarios", value: datos.total, emoji: "👥", color: C.green },
                { label: "Premium", value: datos.premium, emoji: "⭐", color: "#B5300B" },
                { label: "Activos 7 días", value: datos.activos, emoji: "🔥", color: C.green },
                { label: "Inactivos", value: datos.inactivos, emoji: "💤", color: C.muted },
                { label: "Nuevos hoy", value: datos.nuevosHoy, emoji: "🆕", color: "#1A3C5E" },
                { label: "Ingresos est.", value: `${datos.premium * 14}€`, emoji: "💰", color: "#2D6A4F" },
              ].map(item => (
                <div key={item.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 14px" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{item.emoji}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: item.color, fontFamily: "Georgia, serif" }}>{item.value ?? 0}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Nuevos esta semana */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>📅 Nuevos esta semana</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: C.green, fontFamily: "Georgia, serif" }}>{datos.nuevosSemana ?? 0}</p>
            </div>

            {/* Últimos usuarios */}
            {datos.ultimos && datos.ultimos.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 12 }}>👤 Últimos registrados</p>
                {datos.ultimos.map((u: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < datos.ultimos.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{u.codigo}</span>
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{u.categoria} · {u.especialidad || ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {u.premium && <span style={{ fontSize: 10, background: "#FFF3CD", color: "#856404", borderRadius: 100, padding: "2px 8px" }}>⭐</span>}
                      {u.admin && <span style={{ fontSize: 10, background: C.greenLight, color: C.green, borderRadius: 100, padding: "2px 8px" }}>👑</span>}
                      <span style={{ fontSize: 11, color: C.muted }}>{u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}