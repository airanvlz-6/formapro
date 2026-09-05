'use client';
import { useEffect, useState } from 'react';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';
import { authenticatedIdentityRequest, completeAuthCallback, signupForNewAccount } from '@/lib/auth/webAuthFlow';

export default function AuthPanel({ callback = false }: { callback?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [athlete, setAthlete] = useState<{ legacyCodigo: string } | null>(null);
  const [unlinked, setUnlinked] = useState(false);
  const [consentNew, setConsentNew] = useState(false);
  const [categoria, setCategoria] = useState('fuerza');
  const [nivel, setNivel] = useState('Principiante');
  const [objetivo, setObjetivo] = useState('');

  async function resolve() {
    const result = await authenticatedIdentityRequest(getBrowserAuth());
    setAthlete(result.ok ? result.athlete : null);
    setUnlinked(result.code === 'ATHLETE_NOT_LINKED');
    setMessage(result.ok ? 'Acceso verificado.' : result.code === 'ATHLETE_NOT_LINKED'
      ? 'Tu acceso no tiene un perfil Forge vinculado. Si ya tenías un perfil, su recuperación estará disponible en una fase posterior.'
      : result.code === 'AUTH_REQUIRED' ? '' : 'No se ha podido verificar el acceso. Inténtalo de nuevo más tarde.');
  }

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const auth = getBrowserAuth();
        if (callback) {
          const url = window.location.href;
          window.history.replaceState(null, '', '/auth/callback');
          const result = await completeAuthCallback(auth, url);
          if (!result.ok) { if (active) setMessage('No se pudo completar el enlace. Ábrelo en el navegador donde te registraste o inicia sesión si ya confirmaste el email.'); return; }
        }
        if (active) await resolve();
      } catch { if (active) setMessage('El acceso con email no está disponible en este entorno.'); }
    }
    void start();
    return () => { active = false; };
  }, [callback]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setAthlete(null); setUnlinked(false);
    try {
      const auth = getBrowserAuth();
      if (signup) {
        const result = await signupForNewAccount(auth, email.trim(), password, window.location.origin);
        if (result.state === 'error') setMessage('No se pudo completar el registro. Revisa los datos o inicia sesión.');
        else if (result.state === 'confirmation_required') setMessage('Si el registro puede completarse, recibirás un email. Confírmalo en este mismo navegador; después podrás crear tu nuevo perfil.');
        else await resolve();
      } else {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMessage('No se pudo iniciar sesión. Revisa tus datos y la confirmación del email.');
        else await resolve();
      }
    } catch { setMessage('No se ha podido conectar con el servicio de acceso.'); }
    finally { setPassword(''); setBusy(false); }
  }

  async function createProfile(event: React.FormEvent) {
    event.preventDefault(); if (!consentNew) return; setBusy(true);
    try {
      const result = await authenticatedIdentityRequest(getBrowserAuth(), {
        intent: 'create_new_account', profile: { categoria, nivel, objetivo },
      });
      if (result.ok) { setAthlete(result.athlete); setUnlinked(false); setMessage('Perfil creado. Puedes continuar con Forge en modo supervisión.'); }
      else setMessage('No se ha podido crear el perfil. No se ha vinculado ningún perfil anterior.');
    } catch { setMessage('No se pudo confirmar la creación. Puedes volver a comprobar tu acceso iniciando sesión.'); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
    <h1>Acceso a Forge</h1>
    <p>Entra con email o registra una cuenta nueva.</p>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <label>Email <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Contraseña <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={busy}>{busy ? 'Procesando…' : signup ? 'Registrarme' : 'Entrar'}</button>
      <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setMessage(''); }}>{signup ? 'Ya tengo acceso con email' : 'Registrar cuenta nueva'}</button>
    </form>
    <p role="status" aria-live="polite">{message}</p>
    {unlinked && <form onSubmit={createProfile} style={{ display: 'grid', gap: 12 }}>
      <h2>Crear un perfil nuevo</h2>
      <p>Este paso inicia un perfil vacío. No recupera ni vincula datos de un perfil anterior.</p>
      <label>Disciplina <select value={categoria} onChange={e => setCategoria(e.target.value)}>
        <option value="fuerza">Fuerza</option><option value="carrera">Carrera</option>
        <option value="funcional">Funcional</option><option value="hibrido">Híbrido</option>
      </select></label>
      <label>Nivel <select value={nivel} onChange={e => setNivel(e.target.value)}>
        <option>Principiante</option><option>Intermedio</option><option>Avanzado</option>
      </select></label>
      <label>Objetivo <input required maxLength={500} value={objetivo} onChange={e => setObjetivo(e.target.value)} /></label>
      <p>Comenzarás en modo supervisión, para registrar entrenamientos y consultar al Coach.</p>
      <label><input type="checkbox" checked={consentNew} onChange={e => setConsentNew(e.target.checked)} /> Quiero crear un perfil nuevo, no recuperar uno anterior.</label>
      <button disabled={busy || !consentNew}>Crear mi nuevo perfil</button>
    </form>}
    {athlete && <p><a href={`/app?codigo=${encodeURIComponent(athlete.legacyCodigo)}`}>Continuar en Forge</a></p>}
    {(athlete || unlinked) && <button disabled={busy} onClick={async () => {
      try { const { error } = await getBrowserAuth().signOut(); if (error) throw error;
        setAthlete(null); setUnlinked(false); setConsentNew(false); setMessage('Sesión cerrada.');
      } catch { setMessage('No se pudo cerrar la sesión. Inténtalo de nuevo.'); }
    }}>Cerrar sesión</button>}
    <p><a href="/app">Acceso legacy con código</a></p>
  </main>;
}
