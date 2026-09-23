'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './AuthPanel.module.css';
import { getBrowserAuth } from '@/lib/auth/supabaseBrowser';
import { authenticatedIdentityRequest, completeAuthCallback, signupForNewAccount, requestPasswordRecovery, saveRecoveredPassword } from '@/lib/auth/webAuthFlow';

export default function AuthPanel({ callback = false, recovery = false }: { callback?: boolean; recovery?: boolean }) {
  const submitLock = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [forgot, setForgot] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryDone, setRecoveryDone] = useState(false);
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
    if (result.ok) { window.location.replace('/hoy'); return; }
    setMessage(result.code === 'ATHLETE_NOT_LINKED'
      ? 'Tu acceso no tiene un perfil Forge vinculado. Si ya tenías un perfil, contacta con Forge para vincularlo.'
      : result.code === 'AUTH_REQUIRED' ? '' : 'No se ha podido verificar el acceso. Inténtalo de nuevo más tarde.');
  }

  useEffect(() => {
    let active = true;
    const panel = panelRef.current;
    if (panel) {
      panel.dataset.authMounted = 'true';
      const style = getComputedStyle(panel), bounds = panel.getBoundingClientRect();
      console.info('[FORGE_AUTH_DIAGNOSTIC]', { stage: 'mounted',
        hasArea: bounds.width > 0 && bounds.height > 0,
        hidden: style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0',
        color: style.color, backgroundColor: style.backgroundColor,
        darkTheme: window.matchMedia('(prefers-color-scheme: dark)').matches });
    }
    async function start() {
      let stage = 'auth_client';
      try {
        const auth = getBrowserAuth();
        if (callback || recovery) {
          stage = 'callback';
          const url = window.location.href;
          window.history.replaceState(null, '', recovery ? '/auth/reset' : '/auth/callback');
          const result = await completeAuthCallback(auth, url);
          if (!result.ok) { if (active) setMessage('No se pudo completar el enlace. Ábrelo en el navegador donde te registraste o inicia sesión si ya confirmaste el email.'); return; }
          if (recovery) { if (active) setRecoveryReady(true); return; }
        }
        stage = 'resolve_session';
        if (active) await resolve();
        if (active) console.info('[FORGE_AUTH_DIAGNOSTIC]', { stage: 'initialized' });
      } catch {
        console.error('[FORGE_AUTH_DIAGNOSTIC]', { stage, status: 'failed' });
        if (active) setMessage('El acceso con email no está disponible en este entorno.');
      }
    }
    void start();
    return () => { active = false; };
  }, [callback, recovery]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (submitLock.current) return; submitLock.current = true; setBusy(true); setMessage(''); setAthlete(null); setUnlinked(false);
    try {
      if (signup && password !== confirmation) { setMessage('Las contraseñas no coinciden.'); return; }
      const auth = getBrowserAuth();
      if (forgot) {
        const result = await requestPasswordRecovery(auth, email.trim(), window.location.origin);
        setMessage(result.ok ? 'Si existe una cuenta para ese email, recibirás un enlace. Ábrelo en este mismo navegador para elegir una nueva contraseña.' : 'No se pudo solicitar la recuperación. Inténtalo más tarde.');
      } else if (signup) {
        const result = await signupForNewAccount(auth, email.trim(), password, window.location.origin, confirmation);
        if (result.state === 'password_mismatch') setMessage('Las contraseñas no coinciden.');
        else if (result.state === 'error') setMessage('No se pudo completar el registro. Revisa los datos o inicia sesión.');
        else if (result.state === 'confirmation_required') setMessage('Si el registro puede completarse, recibirás un email. Confírmalo en este mismo navegador; después podrás crear tu nuevo perfil.');
        else await resolve();
      } else {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMessage('No se pudo iniciar sesión. Revisa tus datos y la confirmación del email.');
        else await resolve();
      }
    } catch { setMessage('No se ha podido conectar con el servicio de acceso.'); }
    finally { setPassword(''); setConfirmation(''); setBusy(false); submitLock.current = false; }
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault(); if (!recoveryReady || submitLock.current) return; submitLock.current = true;
    setBusy(true); setMessage('');
    try {
      const result = await saveRecoveredPassword(getBrowserAuth(), password, confirmation);
      if (!result.ok) { setMessage(result.code === 'PASSWORD_MISMATCH' ? 'Las contraseñas no coinciden.' : 'No se pudo cambiar la contraseña. Solicita un nuevo enlace o revisa los requisitos de contraseña.'); return; }
      setRecoveryDone(true); setRecoveryReady(false);
      const { error } = await getBrowserAuth().signOut();
      if (error) throw error;
      setMessage('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
    } catch { setMessage('No se pudo confirmar el cambio. Intenta iniciar sesión con la nueva contraseña antes de solicitar otro enlace.'); }
    finally { setPassword(''); setConfirmation(''); setBusy(false); submitLock.current = false; }
  }

  async function createProfile(event: React.FormEvent) {
    event.preventDefault(); if (!consentNew || submitLock.current) return; submitLock.current = true; setBusy(true);
    try {
      const result = await authenticatedIdentityRequest(getBrowserAuth(), {
        intent: 'create_new_account', profile: { categoria, nivel, objetivo },
      });
      if (result.ok) { window.location.replace('/app/chat'); }
      else setMessage('No se ha podido crear el perfil. No se ha vinculado ningún perfil anterior.');
    } catch { setMessage('No se pudo confirmar la creación. Puedes volver a comprobar tu acceso iniciando sesión.'); }
    finally { setBusy(false); submitLock.current = false; }
  }

  return <main ref={panelRef} data-auth-panel="true" className={styles.panel}>
    <img src="/logo-forge.png" alt="Forge" width={72} height={72} className={styles.logo} />
    <h1>FORGE</h1>
    <p>{recovery ? 'Elige tu nueva contraseña.' : forgot ? 'Recupera tu contraseña por email.' : signup ? 'Crear cuenta' : ''}</p>
    {!recovery && !unlinked && <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <label>Email <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      {!forgot && <label>Contraseña <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {signup && <label>Repetir contraseña <input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
      <button disabled={busy}>{busy ? 'Procesando…' : forgot ? 'Enviar enlace de recuperación' : signup ? 'Registrarme' : 'Entrar'}</button>
      {!signup && <button type="button" disabled={busy} onClick={() => { setForgot(!forgot); setPassword(''); setConfirmation(''); setMessage(''); }}>{forgot ? 'Volver al login' : '¿Olvidaste tu contraseña?'}</button>}
      {!forgot && <p>{signup ? '' : '¿Nuevo en Forge?'}</p>}
      {!forgot && <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setPassword(''); setConfirmation(''); setMessage(''); }}>{signup ? 'Ya tengo acceso con email' : 'Crear cuenta'}</button>}
    </form>}
    {recovery && recoveryReady && <form onSubmit={updatePassword} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <label>Nueva contraseña <input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Repetir contraseña <input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <button disabled={busy}>Guardar contraseña</button>
    </form>}
    {recovery && <p><a href="/">{recoveryDone ? 'Volver al acceso' : 'Volver al login o solicitar otro enlace'}</a></p>}
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
    {(athlete || unlinked) && <button disabled={busy} onClick={async () => {
      try { const { error } = await getBrowserAuth().signOut(); if (error) throw error;
        window.location.replace('/');
      } catch { setMessage('No se pudo cerrar la sesión. Inténtalo de nuevo.'); }
    }}>Cerrar sesión</button>}
  </main>;
}
