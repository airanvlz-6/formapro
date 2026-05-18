import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-04-22.dahlia" as any,
});

export async function POST(req: NextRequest) {
  const { action, email, codigo } = await req.json();

  if (action === "crear_sesion") {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      metadata: { codigo },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?codigo=${codigo}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}`,
    });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Accion no reconocida" }, { status: 400 });
}