export default function Navbar() {
  return (
    <nav className="absolute top-8 left-0 right-0 z-20 flex items-center justify-between px-6">
      <img src="/logo-forge.png" alt="Forge" className="h-9 w-9 object-contain" />

      <div className="hidden gap-10 text-sm text-zinc-300 lg:flex">
        <a href="#como-funciona" className="hover:text-orange-400 transition">Cómo funciona</a>
      </div>

      <div className="flex items-center gap-4">
        <a href="/app" className="hidden sm:block text-sm text-zinc-300 hover:text-white transition">Entrar</a>
        <a href="/app" className="rounded-full border border-orange-500/30 bg-orange-500 px-6 py-3 text-sm font-semibold transition hover:bg-orange-400">
          Empieza gratis
        </a>
      </div>
    </nav>
  );
}