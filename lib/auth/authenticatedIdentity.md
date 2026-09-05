# AUTH-1B2B — authenticated athlete identity

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
