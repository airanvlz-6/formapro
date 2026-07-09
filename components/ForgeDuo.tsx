"use client";

import { motion } from "framer-motion";

interface PasoProps {
  icono: string;
  titulo: string;
  texto: string;
  imagen: string;
  invertido?: boolean;
}

function Paso({ icono, titulo, texto, imagen, invertido }: PasoProps) {
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
      </div>
    </motion.div>
  );
}

const idealPara = [
  { emoji: "🏋️", titulo: "Parejas de CrossFit", texto: "Entrenad juntos sin que uno tenga que copiar el entrenamiento del otro." },
  { emoji: "🏃", titulo: "Parejas de running", texto: "Mismo recorrido. Distintos ritmos. Mismo objetivo." },
  { emoji: "👫", titulo: "Amigos", texto: "Cada uno con su nivel. Una única sesión." },
  { emoji: "❤️", titulo: "Parejas", texto: "Entrenar juntos mejora la adherencia. Forge adapta el entrenamiento para ambos." },
];

export default function ForgeDuo() {
  return (
    <section id="forge-duo" className="relative bg-black py-32">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
            Forge Duo
          </span>
          <h2 className="mt-8 text-4xl font-bold text-white md:text-5xl">
            Entrena con quien quieras.
            <br />
            Sin dejar de seguir tu propio plan.
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            Forge es capaz de generar una misma sesión para dos atletas diferentes respetando el nivel, las marcas, las limitaciones y la planificación individual de cada uno.
          </p>
        </div>

        <div className="mt-24 space-y-24">
          <Paso
            icono="👥"
            titulo="Cada atleta mantiene su propia evolución"
            texto={"Mientras entrenáis juntos, Forge analiza por separado fuerza, resistencia, técnica, recuperación, adherencia y progreso.\n\nLa sesión compartida se adapta automáticamente para ambos."}
            imagen="/landing/entrenar.png"
          />

          <Paso
            icono="⚙️"
            titulo="No entrenáis igual. Entrenáis juntos."
            texto={"Cada atleta recibe pesos distintos, escalados distintos, ritmos distintos, objetivos distintos y feedback individual.\n\nTodo dentro de la misma sesión."}
            imagen="/landing/analizando.png"
            invertido
          />

          <Paso
            icono="📈"
            titulo="Forge aprende también cuando entrenáis juntos"
            texto={"Después de cada sesión compartida, ambos reportáis, Forge analiza qué escalados funcionaron, detecta diferencias de nivel y ajusta futuras sesiones conjuntas.\n\nNo es una sesión aislada. Forma parte del aprendizaje del sistema."}
            imagen="/landing/entreno_duo.png"
          />
        </div>

        <div className="mt-32">
          <h3 className="text-center text-2xl font-bold text-white">Ideal para...</h3>
          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {idealPara.map((item, i) => (
              <motion.div
                key={item.titulo}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="rounded-2xl border border-orange-500/20 bg-white/[0.03] p-6 text-center"
              >
                <span className="text-3xl">{item.emoji}</span>
                <h4 className="mt-3 font-bold text-white">{item.titulo}</h4>
                <p className="mt-2 text-sm text-zinc-400">{item.texto}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 text-center"
        >
          <p className="mx-auto max-w-2xl text-2xl font-semibold leading-relaxed text-white md:text-3xl">
            Entrenar acompañado ya no significa renunciar a una planificación personalizada.
          </p>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Forge consigue que dos atletas compartan una misma sesión sin dejar de evolucionar de forma individual.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Entrena con un compañero
          </a>
          <p className="mt-4 text-sm text-zinc-500">Crea un equipo en menos de un minuto.</p>
        </motion.div>

      </div>
    </section>
  );
}