"use client";

import { motion } from "framer-motion";

interface BloqueProps {
  numero: string;
  titulo: string;
  texto: string;
  checklist: string[];
  frase: string;
  imagen: string;
  invertido?: boolean;
}

function Bloque({ numero, titulo, texto, checklist, frase, imagen, invertido }: BloqueProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
      className={`flex flex-col items-center gap-12 md:flex-row ${invertido ? "md:flex-row-reverse" : ""}`}
    >
      <div className="flex-1">
        <motion.img
          src={imagen}
          alt={titulo}
          whileHover={{ y: -8 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-full max-w-[280px] rounded-3xl border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,.5)]"
        />
      </div>
      <div className="flex-1">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 text-sm font-bold text-orange-400">
          {numero}
        </span>
        <h3 className="mt-4 text-3xl font-bold text-white">{titulo}</h3>
        <p className="mt-4 text-lg leading-8 text-zinc-400">{texto}</p>
        <div className="mt-6 space-y-2">
          {checklist.map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="flex items-center gap-2 text-zinc-300"
            >
              <span className="text-orange-500">✓</span>
              {item}
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-orange-400">{frase}</p>
      </div>
    </motion.div>
  );
}

function Flecha() {
  return (
    <motion.div
      initial={{ opacity: 0.2 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="flex justify-center py-8 text-3xl text-orange-500"
    >
      ↓
    </motion.div>
  );
}

export default function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative bg-zinc-950 py-32">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
            Cómo funciona
          </span>
          <h2 className="mt-8 text-4xl font-bold text-white md:text-5xl">
            Un entrenador no toma decisiones al azar.
            <br />
            Forge tampoco.
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            Antes de recomendar un entrenamiento, Forge entiende quién eres, planifica con criterio, aprende de cada sesión y utiliza ese conocimiento para seguir mejorando.
          </p>
        </div>

        <div className="mt-24 space-y-4">
          <Bloque
            numero="01"
            titulo="Forge empieza por entender al atleta."
            texto="No genera una rutina. Primero construye un perfil vivo con todo aquello que influye en tus entrenamientos."
            checklist={["Objetivos deportivos", "Nivel actual", "Fortalezas", "Áreas de desarrollo", "Lesiones", "Material disponible", "Disponibilidad semanal"]}
            frase="Nunca empieza desde cero."
            imagen="/landing/atleta.png"
          />

          <Flecha />

          <Bloque
            numero="02"
            titulo="Después decide qué debes entrenar."
            texto="Cada sesión forma parte de un bloque. Cada bloque tiene un objetivo. Cada cambio tiene una explicación."
            checklist={["Planificación científica", "Adaptación diaria", "Cambios automáticos", "Explicación del entrenador", "Periodización inteligente"]}
            frase="No improvisa. Planifica."
            imagen="/landing/plan.png"
            invertido
          />

          <Flecha />

          <Bloque
            numero="03"
            titulo="Cada entrenamiento añade conocimiento."
            texto="Tus entrenamientos no desaparecen en un historial. Se convierten en información útil para tomar mejores decisiones."
            checklist={["Sueño", "HRV", "Sensaciones", "Cargas", "PR", "Eventos", "Adherencia"]}
            frase="Todo queda conectado."
            imagen="/landing/historia.png"
          />

          <Flecha />

          <Bloque
            numero="04"
            titulo="Forge evalúa el resultado de sus decisiones."
            texto="Cuando termina un bloque, Forge analiza qué funcionó, qué no, y utiliza ese conocimiento para construir el siguiente."
            checklist={["Rendimiento", "Fatiga", "Recuperación", "Bloques", "Estrategias", "Resultados", "Aprendizaje continuo"]}
            frase="Cada bloque hace mejor al atleta... y también al entrenador."
            imagen="/landing/progreso.png"
            invertido
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 text-center"
        >
          <p className="mx-auto max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Cada entrenamiento deja de ser un dato.
            <br />
            Se convierte en una mejor decisión para el siguiente.
          </p>
          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Empieza gratis
          </a>
        </motion.div>

      </div>
    </section>
  );
}