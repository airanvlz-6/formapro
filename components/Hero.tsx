"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import Navbar from "./Navbar";
import FloatingPhones from "./FloatingPhones";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-black text-white">

      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute left-1/2 top-[-350px] h-[850px] w-[850px] -translate-x-1/2 rounded-full bg-orange-500/15 blur-[170px]" />
        <div className="absolute bottom-[-250px] right-[-150px] h-[650px] w-[650px] rounded-full bg-orange-600/10 blur-[180px]" />
      </div>

      <div className="relative z-10">
        <Navbar />

        <div className="mx-auto max-w-7xl px-6">
          <div className="pt-40 text-center">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .7 }}
            >
              <div className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-5 py-2 text-sm text-orange-300">
                IA + Ciencia + Memoria Persistente
              </div>

              <h1 className="mt-10 text-5xl font-bold leading-tight text-white md:text-7xl">
                El entrenador
                <br />
                que nunca deja
                <span className="text-orange-500"> de conocerte</span>
              </h1>

              <p className="mx-auto mt-8 max-w-3xl text-xl leading-9 text-zinc-400">
                Forge construye un modelo vivo de ti como atleta. Aprende de cada entrenamiento, identifica tus áreas de desarrollo y adapta la planificación para ayudarte a mejorar donde realmente importa.
              </p>

              <div className="mt-12 flex flex-wrap justify-center gap-5">
                <a href="/app" className="rounded-full bg-orange-500 px-8 py-4 font-semibold text-white transition hover:scale-105 hover:bg-orange-400">
                  Empieza gratis
                </a>
                <a href="#como-funciona" className="flex items-center gap-3 rounded-full border border-zinc-700 px-8 py-4 text-white transition hover:border-orange-400">
                  <Play size={18} />
                  Ver demostración
                </a>
              </div>
            </motion.div>

            <FloatingPhones />
          </div>
        </div>
      </div>
    </section>
  );
}