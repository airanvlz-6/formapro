// SDK session is only a transport credential; the API independently verifies it.
export async function authenticatedIdentityRequest(auth: any, body?: unknown, transport: typeof fetch = fetch) {
  const { data, error } = await auth.getSession();
  if (error || !data.session?.access_token) return { ok: false, code: 'AUTH_REQUIRED' };
  const response = await transport('/api/auth/athlete', {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.json(); // No automatic replay or retry of bootstrap.
}

export async function signupForNewAccount(auth: any, email: string, password: string, origin: string) {
  const { data, error } = await auth.signUp({ email, password,
    options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { state: 'error' as const };
  return { state: data.session ? 'authenticated' as const : 'confirmation_required' as const };
}

let callbackRun: Promise<any> | undefined;
export function completeAuthCallback(auth: any, callbackUrl: string) {
  // One exchange per page load, including React StrictMode effect re-entry.
  callbackRun ??= (async () => {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code) return { ok: false, code: 'AUTH_CALLBACK_INVALID' };
    const result = await auth.exchangeCodeForSession(code);
    if (result.error || !result.data.session) return { ok: false, code: 'AUTH_CALLBACK_INVALID' };
    return { ok: true };
  })();
  return callbackRun;
}
