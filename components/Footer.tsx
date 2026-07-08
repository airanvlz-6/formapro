export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-black py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <img src="/logo-forge.png" alt="Forge" className="h-10 w-10 object-contain" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Producto</h4>
            <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400">
              <a href="/plan" className="hover:text-orange-400">Mi Plan</a>
              <a href="/historia" className="hover:text-orange-400">Mi Historia</a>
              <a href="/atleta" className="hover:text-orange-400">Mi Atleta</a>
              <a href="#equipos" className="hover:text-orange-400">Equipos</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Empresa</h4>
            <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#precios" className="hover:text-orange-400">Precios</a>
              <a href="mailto:coachforgeapp@gmail.com" className="hover:text-orange-400">Contacto</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Legal</h4>
            <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#" className="hover:text-orange-400">Privacidad</a>
              <a href="#" className="hover:text-orange-400">Cookies</a>
              <a href="#" className="hover:text-orange-400">Términos</a>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-zinc-900 pt-8 text-center text-xs text-zinc-600">
          Construido en España 🇪🇸
          <br />
          Pensado para atletas que quieren entrenar con criterio.
        </div>
      </div>
    </footer>
  );
}