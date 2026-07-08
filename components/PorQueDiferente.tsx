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
            No hemos construido una IA que genera entrenamientos.
            <br />
            Hemos construido un entrenador que aprende de cada atleta.
          </p>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Tarjeta
            emoji="🧠"
            etiqueta="Siempre activo"
            titulo="Memoria persistente"
            texto="No recuerda conversaciones. Recuerda al atleta."
            checklist={["Objetivos", "Lesiones", "Disponibilidad", "Bloques", "Marcas", "Historial"]}
            pie="Nunca tienes que empezar de cero."
            delay={0}
          />
          <Tarjeta
            emoji="🎯"
            etiqueta="Contextual"
            titulo="Coaching correctivo"
            texto="Forge detecta automáticamente limitaciones que frenan tu rendimiento y crea un plan específico para corregirlas."
            checklist={["Evidencias", "Diagnóstico", "Plan de acción", "Seguimiento", "Resolución automática"]}
            pie="No solo adapta. También desarrolla."
            delay={0.1}
          />
          <Tarjeta
            emoji="❤️"
            etiqueta="Tiempo real"
            titulo="Estado fisiológico"
            texto="Cada decisión tiene en cuenta cómo llegas al entrenamiento."
            checklist={["HRV", "Sueño", "Fatiga", "FC reposo", "Tendencias", "Alertas inteligentes"]}
            pie="Entrenar más no siempre es entrenar mejor."
            delay={0.2}
          />
          <Tarjeta
            emoji="💬"
            etiqueta="Explicable"
            titulo="Un entrenador que explica sus decisiones"
            texto="Cada sesión incluye el motivo por el que Forge la recomienda. No es una caja negra."
            checklist={["Objetivo del día", "Relación con el bloque", "Adaptaciones", "Cambios justificados"]}
            pie="Aprendes mientras entrenas."
            delay={0.3}
          />
          <Tarjeta
            emoji="👥"
            etiqueta="Colaborativo"
            titulo="Entrena en equipo"
            texto="Comparte sesiones con otra persona sin perder la personalización individual."
            checklist={["Escalados distintos", "Memoria conjunta", "Aprendizaje compartido", "Adaptación individual"]}
            pie="Entrenar juntos ya no implica entrenar igual."
            delay={0.4}
          />
          <Tarjeta
            emoji="📈"
            etiqueta="Aprendizaje continuo"
            titulo="Mejora continua"
            texto="Forge analiza el resultado de cada bloque para descubrir qué estrategias funcionan mejor contigo."
            checklist={["Adherencia", "Fatiga", "Rendimiento", "Progreso", "Respuesta del atleta", "Optimización futura"]}
            pie="Cada bloque mejora el siguiente."
            delay={0.5}
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
            <p>Objetivos</p>
            <p className="text-orange-500">↓</p>
            <p>Planificación</p>
            <p className="text-orange-500">↓</p>
            <p>Entrenamientos</p>
            <p className="text-orange-500">↓</p>
            <p>Resultados</p>
            <p className="text-orange-500">↓</p>
            <p>Nuevas decisiones</p>
            <p className="text-orange-500">↓</p>
            <p>Más resultados</p>
            <p className="text-orange-500">↓</p>
            <p className="font-semibold text-white">Mejor entrenador</p>
          </div>

          <p className="mx-auto mt-16 max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Cuanto más entrenas, más preciso se vuelve Forge.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Empieza gratis
          </a>
        </motion.div>

      </div>
    </section>
  );
}