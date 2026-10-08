# 8C-A real-environment validation harness (user-run)

Two scripts that verify the **real** 8C-A code against **your** Supabase development project and LLM key. They call the real
routes of a local `next dev` server; the service role is used only to create, inspect and delete the throw-away users the scripts
create themselves. They never run from tests, build or deploy, and nothing here reimplements planning, goal/strategy resolution,
equipment defaults or `planningProfileStatus`.

| Script | Purpose | Cost |
|---|---|---|
| `scripts/smoke8c/smoke-8c-profile.mjs` | A — profile GET/PATCH, storage, restrictions, equipment, activation, isolation, preservation | none (no LLM) |
| `scripts/smoke8c/smoke-8c-goal-driven.mjs` | B — real weekly pipeline (Block Analyzer + Weekly Coach) for the Policía Nacional objective | 2 LLM calls |

Helpers and their unit tests: `scripts/smoke8c/common.mjs`, `scripts/smoke8c/common.test.mjs` (guards, redaction, cleanup ledger; pure).

## Prerequisites

* Node ≥ 20.9 (Next 16) — `--env-file` is built in.
* A **development/test** Supabase project (not production). `.env.local` in the repo root with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and (script B) `ANTHROPIC_API_KEY`. The server must run **without**
  `NEXT_PUBLIC_FORGE_COACH_FIRST=1` (script B drives the legacy weekly actions the web client uses; with the flag on it reports
  `COACH_FIRST_ROUTE_REQUIRED`).
* The migration `docs/sql/allow-null-category-for-free-users.sql` applied on that project (Free users have no category), and
  `docs/sql/drop-legacy-auth-user-trigger.sql` if you have not applied it yet.
* The migration `docs/sql/profile-field-cas.sql` (field-scoped profile CAS RPC `forge_profile_apply`). Without it every profile PATCH that writes returns `503 PROFILE_CAS_UNAVAILABLE`.
* The migration `docs/sql/chat-history-append.sql` (legacy Coach history append `forge_chat_history_append`), applied AFTER `profile-field-cas.sql`.
* Auth settings that allow `signInWithPassword` for admin-created, email-confirmed users (the default).

## Environment variables (names only)

Required by both: `FORGE_ALLOW_8C_SMOKE_TEST` (must be `true`), `FORGE_SMOKE_SUPABASE_HOST` (the host of the project you intend to use,
e.g. `abcd1234.supabase.co`; it must equal the host in `NEXT_PUBLIC_SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Script B also: `FORGE_ALLOW_8C_LLM_SMOKE_TEST` (must be `true`), `ANTHROPIC_API_KEY`.
Optional: `FORGE_SMOKE_PRODUCTION_SUPABASE_HOST` (comma-separated denylist), `FORGE_SMOKE_BASE_URL` (default `http://localhost:3000`),
`FORGE_SMOKE_ALLOW_REMOTE_BASE_URL`, `FORGE_SMOKE_EMAIL_DOMAIN` (default `example.com`), and for B `FORGE_SMOKE_OBJECTIVE`,
`FORGE_SMOKE_SPECIALTY` (default `funcional_fitness`; use `hibrido_general` to exercise the universal `general_goal_driven` path),
`FORGE_SMOKE_SESSION_DURATION` (default `Hasta 1 hora`), `FORGE_SMOKE_ENVIRONMENT` (default `box`), `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1`
on the **dev server** to log `WEEKLY_COACHING_INPUT` / `WEEKLY_COACH_RATIONALE`.

## Production safety (fail-closed)

* Aborts (exit 2, nothing touched) unless the opt-in flag is `true`, every required variable exists and the typed Supabase host matches.
* Aborts on `NODE_ENV=production`, `VERCEL_ENV=production|preview`, a host in the denylist, or a non-local app URL (unless explicitly allowed).
* Operates **only** on users it creates (`forge-8c-smoke-<label>-<id>@<domain>`, random password, never printed). There is no mode that
  edits an existing account. Every id is recorded in a ledger; cleanup deletes only ledger entries (reverse order), also after errors
  (`try/finally`), then **re-reads** to verify nothing remains and prints what to remove manually otherwise.
* Tokens, keys and JWTs are redacted from every printed line.
* Because the dev server uses the service role, the target project is whatever `.env.local` says: type the host deliberately.

## What A asserts (PASS/FAIL per stage)

S0 users/seed/snapshot · S1 GET whitelist, no private keys · S2 incomplete activation = `NOT_READY`, mode unchanged · S3 category alone
rejected, zero writes · S4 category/specialty in `usuarios.categoria`/`especialidad` · S5 objective in `usuarios.objetivo_principal.descripcion`
(no `perfil.objetivo_*` copies) · S6 age/level/duration/availability/trainingSources · S7 restrictions → `athlete_coaching_notes` (hard) +
`athlete_state_events` (one active), idempotent · S8 `restrictions=[]` closes the set, history kept · S9 equipment →
`perfil.prescription_signals["equipment.<id>"]`, other signals untouched · S10 `equipment=[]` clears only explicit declarations ·
S11 14 invalid/forbidden payloads → 4xx and the full row identical afterwards · S12 activation with `equipment=[]`/`restrictions=[]` →
`ACTIVATED`, `planningProfileStatus.ready`, second call `ALREADY_ACTIVE` · S13 auth isolation (no/garbage token, body can't pick the
athlete, user B's row untouched) · S14 marks, HR refs, history, premium/admin, identity and unrelated `perfil` unchanged · S15 no
`select("*")` in the profile path · S16 storage confirmation.

## What B asserts

Pipeline: `preparar_generacion_semana` → `preflight_generacion_semana` → `analizar_bloque_semana` → `planificar_semana` for the **next**
week (so "today" never changes the slots). It stops after the Weekly Coach (no session Builder, nothing saved to `weekly_plan`).
A1 objective unchanged · A2 no `STRATEGY_UNSUPPORTED`/`GOAL_*` · A3 `mode = GOAL_DRIVEN` (+ universal path consistency) · A4 box and carrera
managed **and used** · A5 `BOX/STANDARD_BOX` from the declared environment, no equipment question · A6 no invented inventory ·
A7 availability respected per discipline · A8 declared duration preserved (see limitations) · A9 restrictions unchanged · A10 profile
truths unchanged (API + raw stores) · A11 not merely generic CrossFit · A12 no "Policía" wording in production source · A13 `usuarios`
untouched by planning. It prints a MANUAL INSPECTION block: GOAL, STRATEGY RESOLUTION, GOAL REQUIREMENTS DERIVED, TRAINING MEANS,
PROGRAMMING BASE, DAYS, SESSION SUMMARIES, EQUIPMENT ASSUMPTIONS, WARNINGS.

## Known limitations

* The scripts were written and unit-tested for their guards/helpers in an environment without network or credentials; they have **not**
  been run end to end against Supabase. Expect to adjust a stage if your schema differs (a seed column that does not exist is skipped and
  reported; a table that does not exist is skipped during cleanup and reported).
* `perfil.lugar_entreno` is single-valued: "box + outdoor/track" is stored as `box`; running outdoors needs no gym inventory.
* The profile route does not edit the training environment; script B writes `lugar_entreno` with the service role (stage B3).
* The real session-duration options are `Hasta 30 min | 45 min | 1 hora | 1h 30min | Más de 1h 30min` (no 60–75). Default `Hasta 1 hora`.
  Minutes are enforced by the session Builder, which B does not run (reported as a WARN).
* The Coach's own derivation of goal requirements is not returned as structured data by the route; B shows the server projection it
  receives and the per-session guidance, plus the server log markers when diagnostics are on.
* Without credentials in this repo there is no `.env.example` convention, so none was added.
