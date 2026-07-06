"use client";

import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import FloatingPhones from "./FloatingPhones";

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute left-1/2 top-[-280px] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-orange-500/15 blur-[180px]" />
        <div className="absolute bottom-[-350px] right-[-150px] h-[600px] w-[600px] rounded-full bg-orange-600/10 blur-[180px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6">

        {/* NAVBAR */}
        <nav className="absolute top-8 left-0 right-0 flex items-center justify-between px-6">
          git add .
git commit -m "usar logo real de Forge en landing V2"
git push

          <div className="hidden gap-10 text-sm text-zinc-300 lg:flex">
            <a href="#caracteristicas">Características</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#especialidades">Especialidades</a>
          </div>

          <a href="/app" className="rounded-full border border-orange-500/30 bg-orange-500 px-6 py-3 font-semibold transition hover:bg-orange-400">
            Empieza gratis
          </a>
        </nav>

        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .8 }}
          className="mx-auto mt-32 max-w-5xl text-center"
        >
          <div className="mb-8 inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-5 py-2 text-sm text-orange-300">
            El entrenador que aprende contigo
          </div>

          <h1 className="text-5xl font-bold leading-tight md:text-7xl">
            Tu entrenamiento
            <br />
            debería
            <span className="text-orange-500"> evolucionar contigo.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-xl leading-9 text-zinc-400">
            Forge recuerda cada entrenamiento, analiza tu recuperación y adapta tu planificación para ayudarte a progresar continuamente.
          </p>

          {/* CTA */}
          <div className="mt-12 flex flex-col justify-center gap-5 sm:flex-row">
            <a href="/app" className="group flex items-center justify-center gap-3 rounded-full bg-orange-500 px-8 py-4 text-lg font-semibold transition hover:scale-105 hover:bg-orange-400">
              Empieza gratis
              <ArrowRight className="transition group-hover:translate-x-1" />
            </a>
            <a href="#como-funciona" className="flex items-center justify-center gap-3 rounded-full border border-zinc-700 px-8 py-4 text-lg hover:border-orange-400">
              <Play size={18} />
              Ver cómo funciona
            </a>
          </div>
        </motion.div>

        <FloatingPhones />

      </div>
    </section>
  );
}