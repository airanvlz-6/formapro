"use client";

import { motion } from "framer-motion";

interface PasoProps {
  numero: string;
  icono: string;
  titulo: string;
  texto: string;
  frase: string;
  imagen: string;
  invertido?: boolean;
}

function Paso({ icono, titulo, texto, frase, imagen, invertido }: PasoProps) {
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
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-2xl">
          {icono}
        </span>
        <h3 className="mt-4 text-3xl font-bold text-white">{titulo}</h3>
        <div className="mt-4 text-lg leading-8 text-zinc-400 whitespace-pre-line">{texto}</div>
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
            Forge convierte tus datos en decisiones de entrenamiento
          </h2>
        </div>

        <div className="mt-24 grid gap-10 md:grid-cols-3">
          {[
            { numero: "01", titulo: "Tus datos reales", items: ["Sueño", "HRV", "Entrenos", "Fatiga", "Sensaciones"], destacado: "DATOS" },
            { numero: "02", titulo: "Forge los interpreta", items: ["Contexto", "Historial", "Carga", "Objetivo"], destacado: "CONTEXTO" },
            { numero: "03", titulo: "Una decisión para hoy", items: ["Mantener", "Adaptar", "Recuperar"], destacado: "ACCIÓN" },
          ].map((col, i) => (
            <motion.div
              key={col.numero}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="rounded-3xl border border-white/10 bg-zinc-900/50 p-8 text-center"
            >
              <span className="text-sm font-semibold text-orange-400">{col.numero}</span>
              <h3 className="mt-3 text-2xl font-bold text-white">{col.titulo}</h3>
              <ul className="mt-6 space-y-2 text-zinc-400">
                {col.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="mt-8 inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-orange-300">
                {col.destacado}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mt-24 max-w-3xl rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent p-10"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-400">Ejemplo real</p>
          <p className="mt-4 text-lg leading-8 text-zinc-300">
            Hoy tenías una sesión intensa. Dormiste peor de lo habitual, tu recuperación está por debajo de tu tendencia y vienes acumulando carga.
          </p>
          <div className="mt-6 rounded-2xl bg-black/40 p-6">
            <p className="text-white">
              <span className="font-semibold text-orange-400">Forge recomienda:</span> mantener el entrenamiento pero reducir la intensidad.
            </p>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              <span className="font-semibold text-zinc-300">Por qué:</span> la combinación de recuperación + carga reciente hace que hoy el coste de ejecutar la sesión completa sea mayor.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 text-center"
        >
          <p className="text-2xl font-bold text-white md:text-3xl">¿Ya tienes entrenador o plan?</p>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-400">
            Perfecto. Forge no compite con él. Tu entrenador establece la dirección. Forge te ayuda a interpretar qué está pasando entre sesión y sesión, y a tomar mejores decisiones en el día a día.
          </p>
          <p className="mx-auto mt-16 max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Y cuando quieras más, Forge también puede diseñar y gestionar tu planificación completa.
          </p>
          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Probar Forge
          </a>
        </motion.div>

      </div>
    </section>
  );
}