export default function Navbar() {
  return (
    <nav className="absolute top-8 left-0 right-0 z-20 flex items-center justify-between px-6">
      <img src="/logo-forge.png" alt="Forge" className="h-9 w-9 object-contain" />

      <div className="hidden gap-10 text-sm text-zinc-300 lg:flex">
        <a href="#caracteristicas" className="hover:text-orange-400 transition">Características</a>
        <a href="#como-funciona" className="hover:text-orange-400 transition">Cómo funciona</a>
        <a href="#forge-duo" className="hover:text-orange-400 transition">Forge Duo</a>
        <a href="#precios" className="hover:text-orange-400 transition">Precios</a>
      </div>

      <div className="flex items-center gap-3">
        <a href="/app" className="rounded-full border border-orange-500 px-5 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500/10 sm:border-transparent sm:px-0 sm:py-0 sm:text-zinc-300 sm:hover:text-white sm:hover:bg-transparent">Entrar</a>
        <a href="/app" className="hidden sm:block rounded-full border border-orange-500/30 bg-orange-500 px-6 py-3 text-sm font-semibold transition hover:bg-orange-400">
          Empieza gratis
        </a>
      </div>
    </nav>
  );
}