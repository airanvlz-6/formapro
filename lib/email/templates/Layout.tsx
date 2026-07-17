import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Section,
  Text,
  Link,
  Preview,
} from "@react-email/components";
import * as React from "react";

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

const C = {
  bg: "#0D0D0D",
  card: "#1A1A1A",
  ink: "#F0EDE8",
  muted: "#9A9590",
  border: "#2A2A2A",
  accent: "#FF6B00",
  green: "#1E5C3A",
};

export default function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: C.bg, fontFamily: "'DM Sans', Arial, sans-serif" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>

          {/* Logo */}
          <Section style={{ textAlign: "center", paddingBottom: 24 }}>
            <Img src="https://forgeapp.es/logo-forge.png" alt="Forge" width="56" height="56" style={{ display: "block", margin: "0 auto", borderRadius: "50%" }} />
            <Text style={{ color: C.ink, fontSize: 22, fontWeight: 900, letterSpacing: -0.5, margin: "10px 0 0" }}>FORGE</Text>
          </Section>

          {/* Contenido de cada plantilla */}
          {children}

          {/* Footer comun */}
          <Section style={{ textAlign: "center", paddingTop: 20, borderTop: `1px solid ${C.border}`, marginTop: 20 }}>
            <Text style={{ color: "#5A5550", fontSize: 11, margin: 0 }}>
              Forge — <Link href="https://forgeapp.es" style={{ color: "#5A5550" }}>forgeapp.es</Link>
            </Text>
            <Text style={{ color: "#5A5550", fontSize: 11, margin: "6px 0 0" }}>
              <Link href="https://t.me/forgeapp_es" style={{ color: C.accent }}>🧪 Forge Labs</Link>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export { C };
