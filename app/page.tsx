import Hero from "@/components/Hero";
import ComoFunciona from "@/components/ComoFunciona";
import ForgeDuo from "@/components/ForgeDuo";
import PorQueDiferente from "@/components/PorQueDiferente";
import Precios from "@/components/Precios";
import CTAFinal from "@/components/CTAFinal";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <main>
      <Hero />
      <ComoFunciona />
      <ForgeDuo />
      <PorQueDiferente />
      <Precios />
      <CTAFinal />
      <Footer />
    </main>
  );
}