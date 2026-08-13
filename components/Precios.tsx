"use client";

import { motion } from "framer-motion";

const advisorIncluye = [
  "Mi Atleta",
  "Mi Historia y Progreso",
  "Registro de entrenamientos",
  "Estado fisiológico y HRV",
  "Consulta diaria sobre tu plan actual",
  "Recomendaciones explicadas",
  "Equipos (Forge Duo)",
];

const coachIncluye = [
  "Todo lo de Advisor",
  "Diseño de planificación completa",
  "Gestión y adaptación automática del plan",
  "Memoria persistente completa entre bloques",
  "Coaching correctivo de debilidades",
  "Aprendizaje continuo entre bloques",
  "Prioridad en nuevas funciones",
];

export default function Precios() {
  return (
    <section id="precios" className="relative bg-zinc-950 py-32">
      <div className="mx-auto max-w-6xl px-6">

        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
            Precios
          </span>
          <h2 className="mt-8 text-4xl font-bold text-white md:text-5xl">
            Empieza con supervisión. Crece hacia planificación completa cuando quieras.
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            ¿No sabes cuál necesitas? Empieza con Advisor. Si más adelante quieres que Forge también diseñe tu planificación, puedes pasar a Coach desde tu propia conversación.
          </p>
        </div>

        <div className="mt-20 grid gap-8 md:grid-cols-2">

          {/* Advisor */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-zinc-800 bg-white/[0.02] p-8"
          >
            <span className="text-2xl">🧠</span>
            <h3 className="mt-3 text-2xl font-bold text-white">Advisor</h3>
            <p className="mt-1 text-sm text-zinc-400">Supervisión inteligente — ya tienes plan o entrenador, Forge te ayuda a decidir cómo ejecutarlo hoy.</p>
            <p className="mt-6 text-2xl font-semibold text-zinc-500">Precio de lanzamiento próximamente</p>
            <div className="mt-8 space-y-3">
              {advisorIncluye.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-orange-500">✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/app" className="mt-8 block rounded-full border border-zinc-700 py-4 text-center font-semibold text-white transition hover:border-orange-400">
              Probar Forge gratis
            </a>
            <p className="mt-4 text-center text-xs text-zinc-500">Sin tarjeta · Configuración en menos de 3 minutos</p>
          </motion.div>

          {/* Coach */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative rounded-3xl border border-orange-500/40 bg-orange-500/5 p-8 shadow-[0_0_60px_rgba(255,122,0,0.1)]"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1 text-xs font-bold text-white">
              🚀 Oferta de lanzamiento
            </div>
            <span className="text-2xl">🔥</span>
            <h3 className="mt-3 text-2xl font-bold text-white">Coach</h3>
            <p className="mt-1 text-sm text-zinc-400">Planificación completa — Forge crea, adapta y gestiona tu entrenamiento entero.</p>
            <p className="mt-6 text-4xl font-bold text-white">9,99€<span className="text-lg font-normal text-zinc-400">/mes</span></p>
            <p className="mt-2 text-sm text-orange-300">Acceso Premium gratuito durante 3 meses para los primeros atletas de la beta.</p>
            <div className="mt-8 space-y-3">
              {coachIncluye.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-orange-500">✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/app" className="mt-8 block rounded-full bg-orange-500 py-4 text-center font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
              Activar Coach
            </a>
          </motion.div>
        </div>

        {/* Forge para entrenadores */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 rounded-3xl border border-dashed border-zinc-700 bg-white/[0.02] p-8 text-center"
        >
          <span className="text-2xl">👨‍🏫</span>
          <h3 className="mt-3 text-xl font-bold text-white">Forge para Entrenadores</h3>
          <p className="mt-1 text-sm text-orange-400">Próximamente</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">Gestiona múltiples atletas desde un único panel con la inteligencia de Forge.</p>
          <a href="mailto:coachforgeapp@gmail.com?subject=Lista de espera Forge para Entrenadores" className="mt-5 inline-block rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition hover:border-orange-400">
            Únete a la lista de espera
          </a>
        </motion.div>

        {/* Confianza */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-20 text-center"
        >
          <p className="text-lg text-zinc-400">
            ¿No estás seguro? Prueba Forge gratis.
            <br />
            Si te convence, continúa. Si no, puedes dejar de usarlo cuando quieras.
            <br />
            Sin permanencia. Sin complicaciones.
          </p>

          <p className="mx-auto mt-16 max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            No pagas por entrenamientos.
            <br />
            Inviertes en tomar mejores decisiones cada semana.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Probar Forge gratis
          </a>
          <p className="mt-4 text-sm text-zinc-500">Únete a los primeros atletas que están ayudando a construir el futuro de Forge.</p>
        </motion.div>

      </div>
    </section>
  );
}