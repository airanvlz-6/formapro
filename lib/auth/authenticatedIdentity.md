# AUTH-1B2B — authenticated athlete identity

## Auth base sprint — web login, signup and password recovery

`/auth` retains email/password login and explicit new-profile bootstrap. Signup now
requires matching password fields before calling Auth. Login only resolves the linked
athlete; it never creates or claims a profile. The legacy code entry is unchanged.

Forgot password calls Supabase `resetPasswordForEmail` with `/auth/reset` as the fixed
redirect. That page exchanges the PKCE code, then allows the user to choose and repeat
a password via `updateUser`. Missing/invalid links cannot open the update form. No
password, email token or session is written by Forge; session persistence remains in
the Supabase SDK. Open confirmation/recovery links in the browser that requested them
(PKCE verifier required). A lost verifier requires a new recovery request from that
browser. Do not substitute hand-written recovery tokens or an admin password setter.

### Manual production configuration (not applied by this sprint)

1. In the existing Resend account, verify that `forgeapp.es` is a verified sending
   domain with the DNS records Resend requires. Use an authorized Resend sending API
   key; never paste it into source, logs or public environment variables.
2. Supabase project → Authentication → Email (Notifications) → SMTP Settings:
   enable custom SMTP; sender email `noreply@forgeapp.es`; sender name `Forge`;
   host `smtp.resend.com`; port `465` (TLS); username `resend`; password is the
   Resend API key, entered only in the private dashboard field. Reuse the existing
   Resend account/domain. `Forge_Production` is used by the current application email
   helper, but Supabase does not automatically read that application environment variable.
3. Keep email/password Auth and email confirmation enabled. Configure the required
   password policy in Supabase; its validation is authoritative.
4. Auth URL Configuration: Site URL `https://forgeapp.es`; allow exact redirects
   `https://forgeapp.es/auth/callback` and `https://forgeapp.es/auth/reset`.
   For local development only, allow `http://localhost:3000/auth/callback` and
   `http://localhost:3000/auth/reset`. Avoid broad redirect wildcards in production.
5. Confirm-signup and reset-password email templates must retain Supabase's
   `{{ .ConfirmationURL }}` link so Auth verifies the token before redirecting to
   the app. Do not send a raw token to these pages, which expect a PKCE `code`.
   Disable email click tracking if enabled for these Auth links.
6. Deployment build must receive `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the same project. The server additionally
   needs `SUPABASE_SERVICE_ROLE_KEY`; it must never be public. Rebuild if public
   build-time configuration changes. No production configuration was changed here.

SMTP uses Supabase's own confirmation/recovery tokens. The existing founder email
helper and `email_log` are not involved; do not pass Auth links to their logging.
No real email is sent by automated tests. End-to-end delivery and the deployed
browser remain unverified until the manual configuration and authorized smoke check.

Official references:
- https://resend.com/docs/send-with-supabase-smtp
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail

### Black-screen diagnosis

The production root cause remains UNKNOWN. Static render emits the form independently
of Auth availability. `data-auth-panel` identifies its DOM; `data-auth-mounted=true`
indicates the mount effect ran. `[FORGE_AUTH_DIAGNOSTIC]` reports mount dimensions,
computed colors, CSS hidden state and initialization stage without credentials or
exception content. `render_boundary` identifies an error handled by the local Next
error boundary, which presents a retry control. A missing mount marker requires
checking script loading/hydration; a mounted hidden panel requires computed-style
inspection. These markers do not prove that a production CSS/runtime issue is fixed.

User-certified AUTH-1B2A evidence: usuarios.id is UUID PK NOT NULL with
gen_random_uuid(); codigo is unique NOT NULL text; auth_user_id is nullable
unique UUID FK to auth.users.id (ON DELETE NO ACTION). There are 74 profiles,
3 linked Auth users and 71 unlinked profiles. Existing link provenance remains
unknown; this implementation does not certify or change it.

## Transport and boundaries

`/auth` uses the existing supabase-js SDK (PKCE, persisted SDK session and refresh).
`GET /api/auth/athlete` verifies Bearer with Auth getUser(token), then resolves only
by returned user.id. `POST` additionally requires explicit create_new_account intent.
No token is decoded locally as proof. Service-role is server-only, with no shared
mutable Auth session. Responses are no-store and contain neutral non-retryable errors.
An unconfirmed email is rejected. A forged JSON principal cannot reach the resolver.

## Setup required before live use

Browser: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
Server additionally: SUPABASE_SERVICE_ROLE_KEY. No secret goes in client variables.
These variables were absent locally in the preceding audit; live operation is not
certified by unit tests. Public env values must be available at Next build time.

Add these exact Auth redirect allowlist entries manually before live signup:

- https://forgeapp.es/auth/callback
- http://localhost:3000/auth/callback

Site URL remains https://forgeapp.es. Email confirmation must remain enabled.
The SDK signup sends emailRedirectTo pointing to this callback. Verify the deployed
email template honors the confirmation URL/redirect. This phase changes no Dashboard
settings and sends no real emails. PKCE confirmation needs the original browser's
verifier. If opened elsewhere, confirm then sign in with email/password in /auth;
no insecure token/code fallback is implemented. The callback exchanges once and
removes URL parameters; it never accepts a return URL/open redirect.

## Bootstrap and onboarding

Only an explicit new-profile form performs bootstrap. Login and confirmation alone
only resolve; they never insert. Existing links return unchanged. Unlinked principals
may explicitly create a NEW profile, but cannot claim any legacy row. No email/code
lookup, update, upsert or relink occurs. This is not certification that an unlinked
Auth user never had a legacy profile; the UI explicitly separates those choices.

Server creates a cryptographically random FP- alias and leaves id to DB default.
Client whitelist is profile.categoria, profile.objetivo and profile.nivel (validated).
Auth email comes from verified Auth, not JSON. Server fixes supervision mode and
false admin/premium defaults. UNIQUE(auth_user_id) arbitrates concurrent inserts;
23505 re-resolves, never automatically inserts again. Unknown outcomes do not replay.

Minimal onboarding collects discipline, level and goal without generating a sports
prescription. Continue opens the existing Forge app with server-resolved legacyCodigo.
That existing app still uses legacy code access; no claim of general authentication
or sports authorization is made. AUTH-1B3 must migrate those private/sports calls and
their restriction/scope inputs to the verified boundary. Tab locks remain independent.

## Deferred

All AUTH-1B1 disabled operations remain disabled. No Admin, Team, recovery, legacy
claiming, identity migration, DB changes or 2E.2 admission changes are included.
Legacy provenance and duplicate/missing emails need a separate verified claiming
process. Existing SDK session persistence has browser/XSS exposure; do not log tokens.
