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
            No hemos construido una app que registra datos.
            <br />
            Hemos construido algo que te conoce y te ayuda a decidir.
          </p>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Tarjeta
            emoji="🧠"
            etiqueta="Siempre activo"
            titulo="Memoria persistente"
            texto="No recuerda conversaciones sueltas. Recuerda al atleta."
            checklist={["Objetivos", "Lesiones", "Disponibilidad", "Marcas", "Historial", "Cómo respondes a la fatiga"]}
            pie="Nunca tienes que volver a explicarlo todo."
            delay={0}
          />
          <Tarjeta
            emoji="🎯"
            etiqueta="Contextual"
            titulo="Detecta lo que frena tu progreso"
            texto="Forge identifica patrones y limitaciones recurrentes a partir de tu historial real, no de una suposición."
            checklist={["Evidencias", "Patrones repetidos", "Seguimiento", "Aviso cuando algo cambia"]}
            pie="No solo registra. También interpreta."
            delay={0.1}
          />
          <Tarjeta
            emoji="❤️"
            etiqueta="Tiempo real"
            titulo="Estado fisiológico"
            texto="Cada recomendación tiene en cuenta cómo llegas realmente al entrenamiento de hoy."
            checklist={["HRV", "Sueño", "Fatiga", "FC reposo", "Tendencias", "Alertas inteligentes"]}
            pie="Entrenar más no siempre es entrenar mejor."
            delay={0.2}
          />
          <Tarjeta
            emoji="💬"
            etiqueta="Explicable"
            titulo="Explica cada recomendación"
            texto="Cada sugerencia incluye el motivo por el que Forge la hace. Nunca es una caja negra."
            checklist={["Qué ves hoy", "Por qué importa", "Qué hacer", "Nunca una orden ciega"]}
            pie="Entiendes la decisión, no solo la recibes."
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
            titulo="Cada vez te conoce mejor"
            texto="Forge analiza cómo respondes con el tiempo para afinar sus recomendaciones futuras."
            checklist={["Adherencia", "Fatiga", "Respuesta real", "Tendencias", "Precisión creciente"]}
            pie="Cuantos más datos, mejor el criterio."
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