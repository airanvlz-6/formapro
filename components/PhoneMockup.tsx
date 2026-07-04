"use client";

import { motion } from "framer-motion";

interface PhoneMockupProps {
  image: string;
  title?: string;
  delay?: number;
  rotate?: number;
  y?: number;
  size?: "normal" | "large";
}

export default function PhoneMockup({
  image,
  title,
  delay = 0,
  rotate = 0,
  y = 0,
  size = "normal",
}: PhoneMockupProps) {
  const width = size === "large" ? "w-[320px]" : "w-[260px]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{
        opacity: 1,
        y: [y, y - 10, y],
      }}
      transition={{
        opacity: { duration: 0.8, delay },
        y: {
          repeat: Infinity,
          duration: 5,
          ease: "easeInOut",
          delay,
        },
      }}
      style={{ rotate }}
      className="relative"
    >
      {title && (
        <div className="mb-4 text-center text-orange-400 font-semibold text-sm">
          {title}
        </div>
      )}

      <div className={`relative ${width} rounded-[40px] border border-white/10 bg-zinc-900 p-3 shadow-[0_40px_120px_rgba(0,0,0,.5)]`}>
        <div className="absolute -inset-6 -z-10 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="overflow-hidden rounded-[30px]">
          <img src={image} alt={title} className="w-full" />
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-[40px] bg-gradient-to-br from-white/10 via-transparent to-transparent" />
      </div>
    </motion.div>
  );
}