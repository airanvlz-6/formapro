import { Section, Text, Button, Hr } from "@react-email/components";
import * as React from "react";
import Layout, { C } from "./Layout";

interface FounderEmailProps {
  numero: number;
  maxSlots: number;
  meses: number;
  codigoUsuario: string;
}

export default function FounderEmail({ numero, maxSlots, meses, codigoUsuario }: FounderEmailProps) {
  return (
    <Layout preview={`¡Enhorabuena! Ya eres el Atleta Fundador #${numero} de Forge`}>

      <Section style={{ textAlign: "center", paddingBottom: 8 }}>
        <Text style={{ fontSize: 48, margin: "0 0 12px" }}>🎉</Text>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>¡Enhorabuena!</Text>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 6px" }}>
          Ya formas parte de los {maxSlots} Atletas Fundadores de Forge.
        </Text>
        <Text style={{ color: C.accent, fontSize: 20, fontWeight: 800, margin: "0 0 20px" }}>
          Tu plaza es la #{numero}
        </Text>
      </Section>

      <Section style={{ backgroundColor: `${C.accent}15`, border: `1px solid ${C.accent}60`, borderRadius: 16, padding: "20px 18px", marginBottom: 20 }}>
        <Text style={{ color: C.ink, fontSize: 14, lineHeight: 1.7, margin: "0 0 14px" }}>
          Como agradecimiento por confiar en Forge desde sus inicios, disfrutarás de <strong>Premium gratuito durante {meses} meses</strong>.
        </Text>
        <Text style={{ color: C.accent, fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>🏅 Tu condición de Atleta Fundador</Text>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "0 0 10px" }}>
          Tu insignia de <strong style={{ color: C.ink }}>Atleta Fundador</strong> será tuya para siempre. Cada mes revisamos tu actividad (como referencia, unas 6 sesiones o uso regular del coach) para mantener el Premium activo.
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          Si completas los 3 meses con actividad, desbloqueas un <strong style={{ color: C.accent }}>precio especial de por vida: 9,99€/mes</strong> (frente a los 14€/mes estándar).
        </Text>
      </Section>

      <Section style={{ textAlign: "center", paddingBottom: 20 }}>
        <Button
          href={`https://forgeapp.es/app?codigo=${codigoUsuario}`}
          style={{ backgroundColor: C.accent, color: "#ffffff", fontSize: 16, fontWeight: 700, padding: "16px 40px", borderRadius: 100, textDecoration: "none" }}
        >
          Empezar mi entrenamiento
        </Button>
      </Section>

      <Hr style={{ borderColor: C.border, margin: "20px 0" }} />

      <Section style={{ backgroundColor: `${C.green}20`, border: `1px solid ${C.green}60`, borderRadius: 16, padding: "20px 18px", textAlign: "center" }}>
        <Text style={{ fontSize: 24, margin: "0 0 10px" }}>🧪</Text>
        <Text style={{ color: C.ink, fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Únete a Forge Labs</Text>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "0 0 16px" }}>
          El club privado donde los Atletas Fundadores hablan directamente conmigo, proponen mejoras y ven las novedades antes que nadie.
        </Text>
        <Button
          href="https://t.me/forgeapp_es"
          style={{ backgroundColor: C.green, color: "#ffffff", fontSize: 13, fontWeight: 600, padding: "10px 24px", borderRadius: 100, textDecoration: "none" }}
        >
          Unirme a Forge Labs
        </Button>
      </Section>

    </Layout>
  );
}
