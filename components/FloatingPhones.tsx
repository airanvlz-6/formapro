"use client";

import PhoneMockup from "./PhoneMockup";

export default function FloatingPhones() {
  return (
    <div className="relative mt-24 flex flex-col items-center justify-center gap-8 lg:flex-row lg:gap-0">

      <PhoneMockup
        image="/landing/historia.png"
        title="📖 Aprende contigo"
        rotate={-8}
        delay={0}
        y={0}
      />

      <div className="-mx-8 z-20">
        <PhoneMockup
          image="/landing/plan.png"
          title="📅 Planifica tu semana"
          delay={0.2}
          size="large"
        />
      </div>

      <PhoneMockup
        image="/landing/progreso.png"
        title="📈 Visualiza tu evolución"
        rotate={8}
        delay={0.4}
      />

    </div>
  );
}