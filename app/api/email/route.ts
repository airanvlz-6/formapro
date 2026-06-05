import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { to, subject, html } = await req.json();

  try {
    const data = await resend.emails.send({
      from: "Forge Coach <coach@forgeapp.es>",
      to,
      subject,
      html,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json({ error: "Error enviando email" }, { status: 500 });
  }
}