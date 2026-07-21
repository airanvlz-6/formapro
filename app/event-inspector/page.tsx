'use client';
import { useState } from "react";

export default function EventInspector() {
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [eventoActivo, setEventoActivo] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [buscado, setBuscado] = useState(false);

  const C = {
    bg: "#0D0D0D", card: "#1A1A1A", ink: "#F0EDE8", muted: "#9A9590",
    border: "#2A2A2A", accent: "#FF6B00"
  };

  const buscar = async () => {
    if (!codigo.trim()) return;
    setCargando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "obtener_event_log", codigo: codigo.trim().toUpperCase() })
      });
      const data = await res.json();
      setEventoActivo(data.eventoActivo);
      setHistorial(data.historial || []);
      setBuscado(true);
    } catch {
      setEventoActivo(null);
      setHistorial([]);
    }
    setCargando(false);
  };

  const colorTipo: Record<string, string> = {
    TRAINING_REPORT: "#FF6B00",
    SLEEP_REPORT: "#64B5F6",
    OTHER: "#9A9590"
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: C.ink, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🔍 Forge Event Inspector</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>Panel interno de depuración — no visible para usuarios</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código del usuario (FP-XXXXX)"
            onKeyDown={e => e.key === "Enter" && buscar()}
            style={{ flex: 1, border: `2px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: C.ink, background: C.card, letterSpacing: 1 }}
          />
          <button onClick={buscar} disabled={cargando} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {cargando ? "..." : "Buscar"}
          </button>
        </div>

        {buscado && (
          <>
            {/* Evento activo */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ color: C.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Evento activo ahora</p>
              {eventoActivo ? (
                <div style={{ background: C.card, border: `1px solid ${colorTipo[eventoActivo.event_type] || C.border}60`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: colorTipo[eventoActivo.event_type] || C.ink, fontSize: 14, fontWeight: 700 }}>{eventoActivo.event_type}</span>
                    <span style={{ background: eventoActivo.status === "collecting" ? "#FF6B0020" : "#4CAF5020", color: eventoActivo.status === "collecting" ? "#FF6B00" : "#4CAF50", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 100 }}>
                      {eventoActivo.status === "collecting" ? "🟠 Recolectando" : "🟢 Extraído"}
                    </span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{(eventoActivo.messages || []).length} mensaje(s) · Actualizado {new Date(eventoActivo.updated_at).toLocaleString("es-ES")}</p>
                  {(eventoActivo.messages || []).map((m: string, i: number) => (
                    <p key={i} style={{ color: C.ink, fontSize: 12, lineHeight: 1.6, marginTop: 6, paddingTop: 6, borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>{m.substring(0, 200)}{m.length > 200 ? "..." : ""}</p>
                  ))}
                </div>
              ) : (
                <p style={{ color: C.muted, fontSize: 13 }}>Sin evento activo en este momento.</p>
              )}
            </div>

            {/* Historial */}
            <div>
              <p style={{ color: C.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Últimos eventos cerrados</p>
              {historial.length === 0 ? (
                <p style={{ color: C.muted, fontSize: 13 }}>Sin historial de eventos aún.</p>
              ) : (
                historial.map((ev: any, i: number) => (
                  <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: colorTipo[ev.event_type] || C.ink, fontSize: 13, fontWeight: 700 }}>
                        {ev.extraccion_exitosa ? "🟢" : "🔴"} {ev.event_type}
                      </span>
                      {ev.fue_correccion && <span style={{ background: "#FFD70020", color: "#FFD700", fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 100, marginLeft: 8 }}>Corrección</span>}
                      <p style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{ev.mensajes_count} mensaje(s)</p>
                    </div>
                    <span style={{ color: C.muted, fontSize: 11 }}>{new Date(ev.closed_at).toLocaleString("es-ES")}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}