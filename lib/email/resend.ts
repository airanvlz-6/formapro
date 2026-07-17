import { Resend } from "resend";

if (!process.env.Forge_Production) {
  console.warn("Forge_Production no está configurada — los emails no se enviarán.");
}

export const resend = new Resend(process.env.Forge_Production);

export const EMAIL_FROM = "Forge <noreply@forgeapp.es>";