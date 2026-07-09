"use client";

import { motion } from "framer-motion";

const gratisIncluye = [
  "Evaluación inicial del atleta",
  "Mi Atleta",
  "Mi Plan",
  "Mi Historia",
  "Progreso",
  "Registro de entrenamientos",
  "Estado fisiológico",
  "Equipos (Forge Duo)",
];

const premiumIncluye = [
  "Memoria persistente completa",
  "Aprendizaje continuo entre bloques",
  "Coaching correctivo",
  "Dashboard avanzado",
  "Análisis fisiológico inteligente",
  "Planificación dinámica completa",
  "Historial y evolución de marcas",
  "Prioridad en nuevas funciones",
];

const comparativa = [
  { funcion: "Mi Atleta", free: true, premium: true },
  { funcion: "Mi Plan", free: true, premium: true },
  { funcion: "Mi Historia", free: true, premium: true },
  { funcion: "Registro de entrenamientos", free: true, premium: true },
  { funcion: "Equipos", free: true, premium: true },
  { funcion: "Estado fisiológico", free: "Básico", premium: "Avanzado" },
  { funcion: "Coaching correctivo", free: false, premium: true },
  { funcion: "Aprendizaje continuo", free: false, premium: true },
  { funcion: "Predicción de riesgo", free: false, premium: true },
  { funcion: "Dashboard avanzado", free: false, premium: true },
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
            Un entrenador personal no debería estar al alcance de unos pocos.
          </h2>
          <p className="mt-8 text-xl leading-9 text-zinc-400">
            Forge reúne planificación científica, seguimiento continuo y un entrenador que aprende contigo en una única plataforma.
          </p>
        </div>

        <div className="mt-20 grid gap-8 md:grid-cols-2">

          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-zinc-800 bg-white/[0.02] p-8"
          >
            <span className="text-2xl">⭐</span>
            <h3 className="mt-3 text-2xl font-bold text-white">Forge Free</h3>
            <p className="mt-1 text-sm text-zinc-400">Ideal para descubrir Forge</p>
            <p className="mt-6 text-4xl font-bold text-white">0€</p>
            <div className="mt-8 space-y-3">
              {gratisIncluye.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-orange-500">✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/app" className="mt-8 block rounded-full border border-zinc-700 py-4 text-center font-semibold text-white transition hover:border-orange-400">
              Empieza gratis
            </a>
            <p className="mt-4 text-center text-xs text-zinc-500">Sin tarjeta · Configuración en menos de 3 minutos</p>
          </motion.div>

          {/* Premium */}
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
            <h3 className="mt-3 text-2xl font-bold text-white">Forge Premium</h3>
            <p className="mt-1 text-sm text-zinc-400">Para atletas que quieren progresar durante todo el año</p>
            <p className="mt-6 text-4xl font-bold text-white">9,99€<span className="text-lg font-normal text-zinc-400">/mes</span></p>
            <p className="mt-2 text-sm text-orange-300">Los primeros usuarios disfrutarán de Premium gratuito durante 3 meses por ayudarnos a construir Forge.</p>
            <div className="mt-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Todo lo de Free, y además:</p>
              {premiumIncluye.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-orange-500">✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/app" className="mt-8 block rounded-full bg-orange-500 py-4 text-center font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
              Hazte Premium
            </a>
          </motion.div>
        </div>

        {/* Comparativa */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-20 overflow-x-auto rounded-3xl border border-zinc-800"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="p-4 font-normal">Función</th>
                <th className="p-4 text-center font-normal">Free</th>
                <th className="p-4 text-center font-normal">Premium</th>
              </tr>
            </thead>
            <tbody>
              {comparativa.map((row, i) => (
                <tr key={row.funcion} className={i < comparativa.length - 1 ? "border-b border-zinc-900" : ""}>
                  <td className="p-4 text-zinc-300">{row.funcion}</td>
                  <td className="p-4 text-center">
                    {typeof row.free === "boolean" ? (row.free ? <span className="text-orange-500">✓</span> : <span className="text-zinc-700">—</span>) : <span className="text-zinc-400">{row.free}</span>}
                  </td>
                  <td className="p-4 text-center">
                    {typeof row.premium === "boolean" ? (row.premium ? <span className="text-orange-500">✓</span> : <span className="text-zinc-700">—</span>) : <span className="text-zinc-400">{row.premium}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

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
            Inviertes en entrenar mejor cada semana.
          </p>

          <a href="/app" className="mt-10 inline-block rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
            Empieza gratis
          </a>
          <p className="mt-4 text-sm text-zinc-500">Únete a los primeros atletas que están ayudando a construir el futuro de Forge.</p>
        </motion.div>

      </div>
    </section>
  );
}