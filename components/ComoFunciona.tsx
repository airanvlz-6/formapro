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
            Así evoluciona tu entrenamiento
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            Forge no genera entrenamientos al azar. Construye un plan, aprende de cada sesión y adapta tu programación para ayudarte a progresar semana tras semana.
          </p>
        </div>

        <div className="mt-24 space-y-4">
          <Paso
            numero="01"
            icono="👤"
            titulo="Crea tu perfil"
            texto="Indica tu disciplina, nivel, objetivos, disponibilidad, material, marcas y posibles limitaciones.

Forge crea un punto de partida totalmente personalizado."
            frase="Todo empieza conociéndote."
            imagen="/landing/atleta.png"
          />

          <Flecha />

          <Paso
            numero="02"
            icono="🧠"
            titulo="Diseña un plan completo"
            texto="No recibirás un entrenamiento. Recibirás una planificación estructurada en ciclos, bloques, semanas y sesiones.

Cada entrenamiento tiene un propósito dentro de tu objetivo."
            frase="Nunca es al azar."
            imagen="/landing/plan.png"
            invertido
          />

          <Flecha />

          <Paso
            numero="03"
            icono="💬"
            titulo="Entrena y reporta"
            texto={'Después de entrenar simplemente hablas con Forge como hablarías con un entrenador.\n\n"Dormí 6 horas." · "Hoy me noté muy cansado." · "El snatch salió mejor de lo esperado."\n\nForge interpreta toda esa información automáticamente.'}
            frase="Sin formularios. Solo conversación."
            imagen="/landing/chat.png"
          />

          <Flecha />

          <Paso
            numero="04"
            icono="📈"
            titulo="Forge aprende de ti"
            texto="Forge recuerda entrenamientos, sueño, HRV, fatiga, lesiones, marcas, adherencia, debilidades, progresión y bloques anteriores.

No vuelves a empezar desde cero cada conversación."
            frase="Memoria real, no solo historial."
            imagen="/landing/progreso.png"
            invertido
          />

          <Flecha />

          <Paso
            numero="05"
            icono="⚙️"
            titulo="Ajusta tu planificación"
            texto="Si tu recuperación empeora, Forge reduce la carga. Si progresas más rápido, aumenta el estímulo. Si aparece una limitación, la planificación cambia automáticamente.

No necesitas modificar nada manualmente."
            frase="La planificación reacciona por ti."
            imagen="/landing/plan-modificado.png"
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 text-center"
        >
          <p className="text-2xl font-bold text-white md:text-3xl">
            Cada semana eres un atleta diferente.
            <br />
            Y Forge también.
          </p>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-400">
            Tu planificación evoluciona contigo. No repite entrenamientos. No olvida lo que ocurrió. Aprende continuamente para ayudarte a progresar.
          </p>

          <div className="mx-auto mt-14 max-w-xs space-y-2 text-zinc-400">
            {["Perfil", "Planificación", "Entrenamiento", "Reporte", "Aprendizaje", "Nuevo plan mejor"].map((p, i, arr) => (
              <div key={p}>
                <p className={i === arr.length - 1 ? "font-semibold text-white" : ""}>{p}</p>
                {i < arr.length - 1 && <p className="text-orange-500">↓</p>}
              </div>
            ))}
          </div>

          <p className="mx-auto mt-16 max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Entrena. Aprende. Evoluciona. Repite.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Empieza gratis
          </a>
        </motion.div>

      </div>
    </section>
  );
}