// FORGE BUILD 8C-A — shared helpers for the USER-RUN real-environment smoke scripts.
//
// These scripts are NOT part of test/build/deploy and are never imported by the app. They drive the real HTTP routes of a local
// `next dev` server and use the Supabase service role ONLY to create/inspect/delete the throw-away users they create themselves.
// Nothing here reimplements planning, goal/strategy resolution, equipment defaults or planningProfileStatus: it calls the real routes.
//
// Safety model (fail-closed):
//   * explicit opt-in env var, explicit confirmation of the Supabase host being targeted, optional denylist host,
//   * refuses NODE_ENV/VERCEL_ENV=production and non-local app URLs unless explicitly allowed,
//   * only operates on users it creates (email prefix guard); never on an existing account,
//   * deletes only rows keyed by the ids it recorded in the ledger.

import { randomBytes } from 'node:crypto';

export const SMOKE_ENV_FLAG = 'FORGE_ALLOW_8C_SMOKE_TEST';
export const LLM_ENV_FLAG = 'FORGE_ALLOW_8C_LLM_SMOKE_TEST';
export const EMAIL_PREFIX = 'forge-8c-smoke-';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class SmokeGuardError extends Error {
  constructor(problems) { super(problems.join('\n')); this.name = 'SmokeGuardError'; this.problems = problems; }
}

/** Pure: validates the environment. Returns the resolved config or throws SmokeGuardError listing EVERY problem. */
export function resolveSmokeConfig(env, { llm = false } = {}) {
  const problems = [];
  const need = name => { const v = env[name]; if (typeof v !== 'string' || !v.trim()) { problems.push(`Missing required env var ${name}`); return ''; } return v.trim(); };
  if (env[SMOKE_ENV_FLAG] !== 'true') problems.push(`Refusing to run: set ${SMOKE_ENV_FLAG}=true to explicitly allow this smoke test`);
  if (llm && env[LLM_ENV_FLAG] !== 'true') problems.push(`Refusing to run: set ${LLM_ENV_FLAG}=true (this script spends real LLM tokens)`);
  const supabaseUrl = need('NEXT_PUBLIC_SUPABASE_URL');
  need('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  need('SUPABASE_SERVICE_ROLE_KEY');
  const expectedHost = need('FORGE_SMOKE_SUPABASE_HOST');
  if (llm) need('ANTHROPIC_API_KEY');
  let host = '';
  try { host = new URL(supabaseUrl).host; } catch { if (supabaseUrl) problems.push('NEXT_PUBLIC_SUPABASE_URL is not a valid URL'); }
  if (host && expectedHost && host !== expectedHost)
    problems.push(`FORGE_SMOKE_SUPABASE_HOST (${expectedHost}) does not match the Supabase host in NEXT_PUBLIC_SUPABASE_URL (${host}). Type the host of the DEVELOPMENT/TEST project you intend to use`);
  const denied = (env.FORGE_SMOKE_PRODUCTION_SUPABASE_HOST ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (host && denied.includes(host)) problems.push(`Supabase host ${host} is listed in FORGE_SMOKE_PRODUCTION_SUPABASE_HOST: refusing to touch production`);
  if (env.NODE_ENV === 'production') problems.push('NODE_ENV=production: refusing to run');
  if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') problems.push(`VERCEL_ENV=${env.VERCEL_ENV}: refusing to run`);
  const baseUrl = (env.FORGE_SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  let baseHost = '';
  try { baseHost = new URL(baseUrl).hostname; } catch { problems.push('FORGE_SMOKE_BASE_URL is not a valid URL'); }
  if (baseHost && !LOCAL_HOSTS.has(baseHost) && env.FORGE_SMOKE_ALLOW_REMOTE_BASE_URL !== 'true')
    problems.push(`FORGE_SMOKE_BASE_URL host ${baseHost} is not local. Use the local dev server (or set FORGE_SMOKE_ALLOW_REMOTE_BASE_URL=true for a non-production test deployment)`);
  const domain = (env.FORGE_SMOKE_EMAIL_DOMAIN || 'example.com').trim();
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) problems.push('FORGE_SMOKE_EMAIL_DOMAIN is not a valid domain');
  if (problems.length) throw new SmokeGuardError(problems);
  return Object.freeze({ supabaseUrl, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    host, baseUrl, emailDomain: domain, secrets: [env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.ANTHROPIC_API_KEY].filter(Boolean) });
}

/** Only addresses this script generated are ever operated on. */
export function isSmokeEmail(email) { return typeof email === 'string' && new RegExp(`^${EMAIL_PREFIX}[a-z0-9-]{8,}@[a-z0-9.-]+$`, 'i').test(email); }
export function newSmokeEmail(domain, label) {
  return `${EMAIL_PREFIX}${label}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}@${domain}`.toLowerCase();
}
export const newSmokePassword = () => 'Sm0ke!' + randomBytes(18).toString('base64url');

/** Replaces known secrets, JWTs and bearer tokens. Used on EVERY line printed. */
export function createRedactor(secrets = []) {
  const known = secrets.filter(s => typeof s === 'string' && s.length >= 8);
  return text => {
    let out = String(text);
    for (const secret of known) out = out.split(secret).join('[REDACTED]');
    out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
    out = out.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[REDACTED_JWT]');
    out = out.replace(/(sb_secret_|sk-ant-)[A-Za-z0-9_-]+/g, '$1[REDACTED]');
    return out;
  };
}

/** Records ONLY what the script created; cleanup deletes exactly that, in reverse order, and never throws. */
export function createCleanupLedger() {
  const entries = [];
  return {
    record(kind, ref, extra = {}) { entries.push({ kind, ref, ...extra }); },
    entries: () => entries.map(e => ({ ...e })),
    has: (kind, ref) => entries.some(e => e.kind === kind && e.ref === ref),
    async run(handlers) {
      const report = [];
      for (const entry of [...entries].reverse()) {
        const handler = handlers[entry.kind];
        if (!handler) { report.push({ ...entry, ok: false, detail: 'no handler (nothing deleted)' }); continue; }
        try { report.push({ ...entry, ok: true, detail: (await handler(entry)) ?? 'done' }); }
        catch (error) { report.push({ ...entry, ok: false, detail: String(error?.message ?? error).slice(0, 200) }); }
      }
      return report;
    },
  };
}

export function createReporter(print) {
  const stages = [], warnings = [];
  return {
    stages, warnings,
    warn(name, message) { warnings.push({ name, message }); print(`WARN  ${name} — ${message}`); },
    async stage(name, fn) {
      try { const detail = await fn(); stages.push({ name, ok: true }); print(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); return true; }
      catch (error) { stages.push({ name, ok: false, error: String(error?.message ?? error) }); print(`FAIL  ${name} — ${String(error?.message ?? error).split('\n')[0]}`); return false; }
    },
    summary() { const failed = stages.filter(s => !s.ok); return { total: stages.length, passed: stages.length - failed.length, failed }; },
  };
}

export function check(condition, message) { if (!condition) throw new Error(message); }
export const deepEqual = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
  return value;
}
export const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj?.[k] ?? null]));

/** Minimal HTTP client with a cookie jar (the weekly preflight issues an httpOnly confirmation cookie the planner requires). */
export function createHttp(baseUrl, redact) {
  const jar = new Map();
  return {
    async request(path, { method = 'GET', token, body, headers = {}, cookies = true } = {}) {
      const h = { ...headers };
      if (token) h.Authorization = `Bearer ${token}`;
      if (body !== undefined) h['Content-Type'] = 'application/json';
      if (cookies && jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      let response;
      try { response = await fetch(baseUrl + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
      catch (error) { throw new Error(redact(`Cannot reach ${baseUrl}${path}: ${error?.cause?.code ?? error?.message}. Is "npm run dev" running with your .env.local?`)); }
      for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(';'); const i = pair.indexOf('='); if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1)); }
      let json = null; const text = await response.text();
      try { json = text ? JSON.parse(text) : null; } catch { json = { _nonJson: text.slice(0, 200) }; }
      return { status: response.status, json };
    },
  };
}

export async function createSupabaseClients(config) {
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return { admin: createClient(config.supabaseUrl, config.serviceKey, options), anon: () => createClient(config.supabaseUrl, config.anonKey, options) };
}

/**
 * Creates a confirmed throw-away auth user, signs in, and bootstraps the Free athlete through the REAL identity route.
 * The auth user and athlete are recorded in the ledger the moment they exist (so cleanup also runs after a partial failure).
 */
export async function createSmokeUser({ config, clients, http, ledger, label }) {
  const email = newSmokeEmail(config.emailDomain, label), password = newSmokePassword();
  check(isSmokeEmail(email), 'generated smoke email failed the allow-list guard');
  const created = await clients.admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data?.user?.id) throw new Error(`createUser failed: ${created.error?.message ?? 'no user'}`);
  const authUserId = created.data.user.id;
  ledger.record('auth_user', authUserId, { email });
  const signedIn = await clients.anon().auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data?.session?.access_token) throw new Error(`signIn failed: ${signedIn.error?.message ?? 'no session'}`);
  const token = signedIn.data.session.access_token;
  const boot = await http.request('/api/auth/athlete', { method: 'POST', token, body: { intent: 'create_new_account' } });
  check(boot.status === 200 && boot.json?.ok === true && typeof boot.json.athlete?.legacyCodigo === 'string', `athlete bootstrap failed (${boot.status} ${boot.json?.code ?? ''})`);
  const { legacyCodigo, athleteId } = boot.json.athlete;
  ledger.record('athlete', legacyCodigo, { athleteId, authUserId });
  return { label, email, token, authUserId, codigo: legacyCodigo, athleteId };
}

/** Tables keyed by the athlete codigo that the app may write during these flows. Unknown tables/columns are skipped and reported. */
export const CODIGO_TABLES = [
  ['athlete_coaching_notes', 'user_codigo'], ['athlete_state_events', 'user_codigo'], ['athlete_training_sources', 'user_codigo'],
  ['weekly_plan', 'user_codigo'], ['weekly_plan_generation_log', 'user_codigo'], ['weekly_plan_events', 'user_codigo'],
  ['week_closure_log', 'user_codigo'], ['block_outcomes', 'user_codigo'], ['block_week_summary', 'user_codigo'],
  ['session_modification_events', 'user_codigo'], ['readiness_checkins', 'user_codigo'], ['pending_actions', 'user_codigo'],
  ['forge_events', 'user_codigo'], ['event_log', 'user_codigo'], ['onboarding_state', 'user_codigo'],
  ['external_training_records', 'user_codigo'], ['athlete_events', 'user_codigo'], ['active_events', 'user_codigo'],
  ['weakness_exposure', 'user_codigo'], ['forge_discoveries', 'user_codigo'], ['athlete_knowledge_points', 'user_codigo'],
  ['athlete_response_patterns', 'user_codigo'], ['physiology_records', 'user_codigo'],
];

/** Cleanup handlers for the ledger kinds. Rows are deleted by the recorded codigo/auth id only. */
export function cleanupHandlers(admin) {
  return {
    athlete: async entry => {
      const skipped = [];
      let removed = 0;
      for (const [table, column] of CODIGO_TABLES) {
        const result = await admin.from(table).delete({ count: 'exact' }).eq(column, entry.ref);
        if (result.error) skipped.push(table); else removed += result.count ?? 0;
      }
      const user = await admin.from('usuarios').delete({ count: 'exact' }).eq('codigo', entry.ref).eq('auth_user_id', entry.authUserId);
      if (user.error) throw new Error(`usuarios delete failed: ${user.error.message} (child rows may remain for codigo ${entry.ref})`);
      return `usuarios rows=${user.count ?? 0}, child rows removed=${removed}${skipped.length ? `, tables skipped (absent/other key): ${skipped.join(',')}` : ''}`;
    },
    auth_user: async entry => {
      const result = await admin.auth.admin.deleteUser(entry.ref);
      if (result.error && !/not.?found/i.test(result.error.message)) throw new Error(`deleteUser failed: ${result.error.message}`);
      return 'auth user deleted';
    },
  };
}

/** Post-cleanup verification: nothing keyed by what we created may remain. */
export async function verifyCleanup(admin, ledger) {
  const leftovers = [];
  for (const entry of ledger.entries()) {
    if (entry.kind === 'athlete') {
      const user = await admin.from('usuarios').select('codigo').eq('codigo', entry.ref);
      if (!user.error && user.data?.length) leftovers.push(`usuarios:${entry.ref}`);
      for (const [table, column] of CODIGO_TABLES) {
        const rows = await admin.from(table).select(column, { count: 'exact', head: true }).eq(column, entry.ref);
        if (!rows.error && (rows.count ?? 0) > 0) leftovers.push(`${table}:${entry.ref}(${rows.count})`);
      }
    }
    if (entry.kind === 'auth_user') {
      const found = await admin.auth.admin.getUserById(entry.ref);
      if (found.data?.user) leftovers.push(`auth.users:${entry.ref}`);
    }
  }
  return leftovers;
}

/** Explicit-column read of the athlete row (never select('*')). */
export const SNAPSHOT_COLUMNS = ['codigo', 'auth_user_id', 'email', 'admin', 'premium', 'modo_entrada', 'categoria', 'especialidad', 'objetivo_principal',
  'distribucion_semanal', 'perfil', 'marcas', 'historial', 'marcas_especificas', 'datos_entrenamiento', 'historial_marcas', 'test_atleta'];
export async function snapshotAthlete(admin, codigo) {
  const row = await admin.from('usuarios').select(SNAPSHOT_COLUMNS.join(',')).eq('codigo', codigo).maybeSingle();
  if (row.error || !row.data) throw new Error(`snapshot read failed for ${codigo}: ${row.error?.message ?? 'no row'}`);
  const sources = await admin.from('athlete_training_sources').select('disciplina,owner,activo,dias').eq('user_codigo', codigo);
  const notes = await admin.from('athlete_coaching_notes').select('id,movement,issue,constraint_level,status,source').eq('user_codigo', codigo);
  const events = await admin.from('athlete_state_events').select('id,estado,body_area,activo').eq('user_codigo', codigo);
  return { row: row.data, sources: sources.data ?? [], notes: notes.data ?? [], events: events.data ?? [] };
}
