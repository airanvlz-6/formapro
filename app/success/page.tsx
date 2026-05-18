'use client';
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function Success() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo");
  const [segundos, setSegundos] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { clearInterval(interval); window.location.href = "/"; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4F0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px,6vw,48px)", color: "#1A1A1A", marginBottom: 16 }}>
        ¡Bienvenido a Forge Premium!
      </h1>
      <p style={{ color: "#6B6560", fontSize: 17, lineHeight: 1.65, maxWidth: 480, marginBottom: 12 }}>
        Tu suscripción está activa. Ahora tienes consultas ilimitadas y seguimiento continuo con tu coach.
      </p>
      {codigo && (
        <p style={{ color: "#1E5C3A", fontSize: 15, marginBottom: 32 }}>
          Tu código de acceso: <strong style={{ letterSpacing: 2 }}>{codigo}</strong>
        </p>
      )}
      <p style={{ color: "#6B6560", fontSize: 14 }}>
        Volviendo a la app en {segundos} segundos...
      </p>
      <button onClick={() => window.location.href = "/"} style={{ marginTop: 24, background: "#1E5C3A", color: "#fff", border: "none", borderRadius: 100, padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        Ir a Forge ahora
      </button>
    </div>
  );
}