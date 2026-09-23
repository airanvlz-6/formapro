'use client';
import { getBrowserAuth } from './supabaseBrowser';

/** Transport only: the server independently verifies and resolves the identity. */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data, error } = await getBrowserAuth().getSession();
  if (error || !data.session?.access_token) {
    return Response.json({ ok: false, retryable: false, code: 'AUTH_REQUIRED', error: 'Inicia sesión para continuar.' }, { status: 401 });
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
