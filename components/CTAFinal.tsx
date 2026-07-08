"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";

const disciplinas = ["CrossFit", "Hyrox", "Trail Running", "Carrera", "Fitness", "Fuerza", "Triatlón", "OCR"];

export default function CTAFinal() {
  return (
    <section className="relative overflow-hidden bg-black py-32">
      <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/10 blur-[180px]" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">

        {/* Para quién es Forge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-20 rounded-3xl border border-orange-500/20 bg-white/[0.03] p-8 backdrop-blur-xl"
        >
          <h3 className="text-lg font-semibold text-white">¿Para quién es Forge?</h3>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {disciplinas.map((d) => (
              <span key={d} className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                ✅ {d}
              </span>
            ))}
          </div>
          <p className="mt-5 text-zinc-400">Si entrenas para mejorar, Forge está diseñado para ti.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold leading-tight text-white md:text-6xl">
            Tu próximo entrenador
            <br />
            no debería olvidarse nunca de ti.
          </h2>

          <p className="mx-auto mt-8 max-w-2xl text-xl leading-9 text-zinc-400">
            Forge recuerda quién eres, cómo entrenas, cómo respondes al esfuerzo y qué necesitas para seguir mejorando.
            <br />
            Cada sesión hace mejor al atleta. Y también al entrenador.
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-5">
            <a href="/app" className="rounded-full bg-orange-500 px-8 py-4 text-lg font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
              Únete a la Beta de Forge
            </a>
            <a href="#como-funciona" className="flex items-center gap-3 rounded-full border border-zinc-700 px-8 py-4 text-lg text-white transition hover:border-orange-400">
              <Play size={18} />
              Ver una planificación real
            </a>
          </div>

          <p className="mt-6 text-sm text-zinc-500">
            Los primeros atletas tendrán acceso Premium gratuito durante 3 meses y ayudarán a construir el futuro de Forge.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-zinc-400">
            <span>✓ Sin tarjeta</span>
            <span>✓ Configuración en menos de 3 minutos</span>
            <span>✓ Plan gratuito disponible</span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mx-auto mt-32 max-w-3xl text-2xl font-semibold leading-relaxed text-white md:text-3xl"
        >
          Entrenar mejor no consiste en hacer más.
          <br />
          Consiste en tomar mejores decisiones, una sesión detrás de otra.
        </motion.p>

        <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
          Empieza gratis
        </a>

      </div>
    </section>
  );
}