import { resend, EMAIL_FROM } from "./resend";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SendEmailParams {
  template: string;
  to: string;
  subject: string;
  html: string;
  usuarioCodigo?: string;
}

export async function sendEmail({ template, to, subject, html, usuarioCodigo }: SendEmailParams) {
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    await supabase.from("email_log").insert({
      usuario_codigo: usuarioCodigo || null,
      email_destino: to,
      template,
      estado: result.error ? "error" : "enviado",
      provider: "resend",
      message_id: result.data?.id || null,
      error_detalle: result.error ? JSON.stringify(result.error) : null,
    });

    if (result.error) {
      console.error(`Error enviando email (${template}) a ${to}:`, result.error);
      return { ok: false, error: result.error };
    }

    return { ok: true, messageId: result.data?.id };
  } catch (err: any) {
    console.error(`Excepción enviando email (${template}) a ${to}:`, err);
    await supabase.from("email_log").insert({
      usuario_codigo: usuarioCodigo || null,
      email_destino: to,
      template,
      estado: "error",
      provider: "resend",
      error_detalle: err?.message || String(err),
    });
    return { ok: false, error: err };
  }
}