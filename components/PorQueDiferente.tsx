"use client";

import { motion } from "framer-motion";

interface TarjetaProps {
  emoji: string;
  etiqueta: string;
  titulo: string;
  texto: string;
  checklist: string[];
  pie: string;
  delay: number;
}

function Tarjeta({ emoji, etiqueta, titulo, texto, checklist, pie, delay }: TarjetaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -6 }}
      className="group relative rounded-3xl border border-orange-500/20 bg-white/[0.03] p-8 backdrop-blur-xl transition-all duration-300 hover:border-orange-400/50 hover:shadow-[0_0_60px_rgba(255,122,0,0.15)]"
    >
      <span className="absolute right-6 top-6 rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {etiqueta}
      </span>

      <span className="inline-block text-4xl transition-transform duration-300 group-hover:rotate-6">{emoji}</span>
      <h3 className="mt-4 text-xl font-bold text-white">{titulo}</h3>
      <p className="mt-3 text-base leading-7 text-zinc-400">{texto}</p>

      <div className="mt-5 space-y-1.5">
        {checklist.map((item, i) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: delay + i * 0.08, duration: 0.3 }}
            className="flex items-center gap-2 text-sm text-zinc-300"
          >
            <span className="text-orange-500">✓</span>
            {item}
          </motion.div>
        ))}
      </div>

      <p className="mt-5 text-sm font-semibold text-orange-400">{pie}</p>
    </motion.div>
  );
}

export default function PorQueDiferente() {
  return (
    <section className="relative bg-black py-32">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold text-white md:text-5xl">
            ¿Por qué Forge es diferente?
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            No hemos construido otra IA que te diga qué entrenar.
            <br />
            Hemos construido una herramienta que entiende cómo estás y te ayuda a decidir qué hacer hoy.
          </p>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Tarjeta
            emoji="🧠"
            etiqueta="1"
            titulo="Conoce al atleta"
            texto="Forge recuerda tus objetivos, historial, disponibilidad, marcas y cómo respondes al entrenamiento."
            checklist={["Objetivos", "Lesiones", "Disponibilidad", "Marcas", "Historial"]}
            pie="Nunca tienes que volver a explicarlo todo."
            delay={0}
          />
          <Tarjeta
            emoji="❤️"
            etiqueta="2"
            titulo="Entiende cómo llegas hoy"
            texto="Sueño, HRV, FC en reposo, fatiga y tendencias se interpretan dentro de tu contexto."
            checklist={["HRV", "Sueño", "FC reposo", "Fatiga", "Tendencias"]}
            pie="Entrenar más no siempre es entrenar mejor."
            delay={0.1}
          />
          <Tarjeta
            emoji="🎯"
            etiqueta="3"
            titulo="Detecta patrones"
            texto="No analiza solo el día de hoy. Busca patrones y limitaciones que aparecen repetidamente en tu entrenamiento."
            checklist={["Evidencias", "Patrones repetidos", "Aviso cuando algo cambia"]}
            pie="No solo registra. También interpreta."
            delay={0.2}
          />
          <Tarjeta
            emoji="💬"
            etiqueta="4"
            titulo="Te explica por qué"
            texto="No recibes una orden. Entiendes qué ha detectado Forge, por qué importa y qué puedes hacer."
            checklist={["Qué ves hoy", "Por qué importa", "Qué hacer"]}
            pie="Entiendes la decisión, no solo la recibes."
            delay={0.3}
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 text-center"
        >
          <div className="mx-auto max-w-md space-y-3 text-zinc-400">
            <p>Reportas cómo estás</p>
            <p className="text-orange-500">↓</p>
            <p>Forge lo interpreta en contexto</p>
            <p className="text-orange-500">↓</p>
            <p>Recibes una decisión clara</p>
            <p className="text-orange-500">↓</p>
            <p>Entrenas con criterio</p>
            <p className="text-orange-500">↓</p>
            <p>Forge aprende de tu respuesta</p>
            <p className="text-orange-500">↓</p>
            <p className="font-semibold text-white">Mejor criterio la próxima vez</p>
          </div>

          <p className="mx-auto mt-16 max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Cuanto más te conoce, mejor es su criterio.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Probar Forge
          </a>
        </motion.div>

      </div>
    </section>
  );
}