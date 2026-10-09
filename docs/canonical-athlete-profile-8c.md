# Canonical athlete profile + Free → planning activation (Build 8C-A)

Backend contract for web and React Native/Expo. Clients are consumers; planning authority stays in the backend.
ACCOUNT IDENTITY ≠ ATHLETE PROFILE ≠ DAILY PHYSIOLOGY.

## Data classes

| Class | Fields | 8C-A |
|---|---|---|
| PLAN_STRUCTURE | category, specialty, objective, age, level, weeklyAvailability, sessionDuration, trainingSources | read + **write** |
| PLAN_STRUCTURE (read only here) | targetEvent (written by `target_event`, signed envelope) | read |
| PLAN_STRUCTURE (optional, never REQUIRED) | restrictions/injuries, equipment | read + **write**, on the already-canonical stores (below) |
| PRESCRIPTION_PARAMETERS | marks/RM, hrMax, restingHrReference, thresholdHr, thresholdPace | read + **preserved**; editing is 8C-E |
| CONTEXT_ONLY | displayName, heightCm, weightKg, avatarUrl | read |
| DAILY_PHYSIOLOGY | HRV, daily RHR, sleep, readiness | never read/written by the profile; never mutates stable references |

The Coach/LLM is not an authority for any of these fields. Only the authenticated client → validators below.

## Routes (Bearer → `auth.getUser` → `usuarios.auth_user_id`; the body never selects the athlete)

* `GET /api/athlete/profile` → `{ ok, profile }`. Explicit column whitelist (`PROFILE_READ_COLUMNS`), no `select("*")`.
  Never returns admin, premium, auth_user_id, id, stripe, tokens, historial, notes or `legacyCodigo`.
  `profile = { mode, planningProfileStatus, planStructure, prescriptionParameters, context, editableFields, unsupported }`.
* `PUT|PATCH /api/athlete/profile` (same partial-update semantics; an absent field means "unchanged", `null` is rejected).

```jsonc
{ "profile": { "category": "carrera", "specialty": "carrera", "objective": "…", "age": "31-40", "level": "Intermedio",
               "sessionDuration": "Hasta 1 hora", "weeklyAvailability": { "days": ["lunes","miercoles"] },
               "trainingSources": [{ "owner": "forge|external", "discipline": "box", "days": ["lunes"] }] },
  "activate": { "mode": "supervision|focus|coach" } }   // both keys optional, at least one required
```

Any other key (`codigo`, `email`, `modo_entrada`, marks, HR…) is rejected with `PROFILE_FIELD_NOT_ALLOWED` before any write.

Response: `{ ok, saved, activation: { requested, status: NOT_REQUESTED|ACTIVATED|ALREADY_ACTIVE|NOT_READY, missingFields }, profile }`
(the profile is re-read from the database after the write).

## Validation (domain adapter: `lib/athlete/canonicalProfile.ts`)

categories `funcional|carrera|fuerza|hibrido`; specialty ∈ catalog of the resulting category (same keys as the web onboarding;
adding a specialty = adding a catalog entry); age ∈ web age bands; level ∈ `Principiante|Intermedio|Avanzado`;
sessionDuration ∈ web options; objective 3–500 chars; availability = 1–7 valid weekdays; ≤ 6 training sources, unique discipline.
Changing the category requires a specialty of the new category.

## Authorities written

* **Objective** → `usuarios.objetivo_principal.descripcion` (what the planner resolves). The duplicated `perfil.objetivo_general` /
  `perfil.objetivo_principal` are removed (kept under `resolution.previousProfileDeclarations`) so evidence cannot conflict.
  `perfil.objetivo_detalle` (legacy free detail) is neither written nor erased. No fifth copy is created.
* **Category / specialty** → `usuarios.categoria` / `usuarios.especialidad`. Carrera derives its canonical specialty when activating
  (same rule as `ensurePlanningSpecialty`); ambiguous categories never invent one.
* **age / level / sessionDuration** → `perfil.edad` / `perfil.nivel` / `perfil.duracion` (legacy level variants are preserved).
* **Availability** → `usuarios.distribucion_semanal` in the existing shape (`{disponibilidad:[…]}`, or the single existing day category).
  Several day categories are not guessed (`AVAILABILITY_MULTI_CATEGORY_UNSUPPORTED`; per-discipline editing is 8C-C).

## Restrictions and equipment (plan structure, optional)

Both are PLAN_STRUCTURE: server-validated, user-editable, never LLM-authoritative, and **not** part of `planningProfileStatus`
(a missing injury or equipment never blocks Free → planning). Legacy users without them read `[]`.

**Restrictions** reuse the store `getCanonicalRestrictions` already reads (no new table): `athlete_state_events` (one active
`restricted` row) + `athlete_coaching_notes` (`constraint_level: hard`, `prohibits_*` derived from the zone through
`restrictionAreas.ts`, the same map the Coach engine uses). Write payload `restrictions` is the **complete active set**:
`{ id }` keeps an existing one, `{ area, description, movement?, validUntil? }` adds one (`area` ∈ `rodilla|hombro|lumbar|tobillo|muñeca`,
identical restriction = idempotent), anything not listed is closed (`status: resuelta`, history kept), `[]` clears the set
("no restrictions" is real information). Order is fail-closed: new protective notes → state row → release. Read:
`planStructure.restrictions` (`id, area, movement, description, level, validUntil, source, prohibits[]`) and
`restrictionsStatus: KNOWN|UNAVAILABLE`; a failed read returns `restrictions: null`, never `[]`. Saving does not regenerate a week:
`assertFreshSessionRestrictions` already compares the session against the current state at save/materialization time.

**Equipment** reuses `perfil.prescription_signals["equipment.<id>"] = { state, updatedAt }` (ids from `equipmentCatalog.ts`).
Payload `equipment: [{ id, state: available|unavailable }]` replaces only the athlete's explicit equipment declarations in the same
single compare-and-set `UPDATE` as the other profile fields; other signals (`capability.*`, `skill.*`) are untouched. Read:
`planStructure.equipment` (explicit declarations only). Equipment is an **override/constraint**, not a mandatory inventory:

* `equipment = []` = no explicit equipment exceptions. It is **not** "no equipment", never writes anything to the profile, and never
  adds `equipment` to `missingFields` (CrossFit / Gym / Running with `[]` can be `ready`).
* Absence of a declaration is not `unavailable`. Precedence: **explicit `unavailable` > discipline/environment default `available` > `unknown`**.
* Defaults come from the declared training environment (`lugar_entreno`, `tipo_sala`, "gimnasio completo") and, only when the athlete
  gave no environment evidence at all, from `DISCIPLINE_ENVIRONMENT_DEFAULTS` in `trainingEnvironment.ts` (today `funcional_crossfit`/
  `crossfit` → standard box; extend the table for new disciplines). A declared (even different or conflicting) environment always
  wins over the default. Defaults are derived at projection time; they are never stored in the profile.
* Defaults grant only the catalog's standard capability for that environment. Nothing extraordinary is assumed (EXPLICIT_ONLY items such
  as the yoke, GYM-only machines, pools, tracks…): those stay `unknown` unless declared `available`. Running needs no gym inventory.
* `restrictions = []` has the opposite meaning: the athlete declares no active restrictions.
* Admission/materialization is unchanged: `unknown` blocks a movement only when no standard alternative exists; the athlete is asked
  about material only when it is indispensable and cannot be inferred from the declared environment.

## Rules (8C contract)

* **RULE A** — An explicit objective is never replaced by category, specialty, trainingSources or equipment.
* **RULE B** — Category/specialty/trainingSources describe training means/context.
* **RULE C** — Equipment declarations are overrides/constraints, not an exhaustive mandatory inventory.
* **RULE D** — Absence of an equipment declaration does not mean unavailable.
* **RULE E** — A declared standard training environment may provide reasonable default equipment capabilities.
* **RULE F** — Explicit `unavailable` always overrides defaults.
* **RULE G** — Unknown/custom objectives remain valid planning goals even when no hard-coded specialised strategy exists.

## Goal-driven planning

`explicit objective → goal requirements → athlete profile + training context → planning → sessions`.

`CanonicalWeekStrategy.goalRequirements` (`lib/planning/goalRequirements.ts`) is the serializable projection the Coach receives inside
`WEEKLY_CONTRACT.strategy`: the explicit objective (bounded, data not instructions), `mode` (`EXACT_STRATEGY` when a specialised
strategy supports it, `GOAL_DRIVEN` otherwise), `strategySupport`, the `programmingBase` (the specialty family when it is only a
fallback — a catalog of means, **not** the goal), `trainingMeans` (managed/external disciplines), `trainingContext` (max days,
environment, explicit equipment exceptions) and the immutable list (objective, category, specialty, availability, duration,
restrictions, equipment declarations, prescription parameters). `GOAL_REQUIREMENTS_INSTRUCTION` (added to the three weekly prompts)
asks the Coach to derive the requirements of that objective (capacities, test/event format, standards, date, volume tolerance,
terrain) marking undeclared data as unknown, and to combine the available means. The LLM interprets and plans; it is not an
authority over profile truths. There is no per-objective strategy or keyword logic: new objectives need no code.
Availability, duration, restrictions, references and dose parameters already travel in the weekly contract/coaching context.
`strategyId` stays the deterministic spine (`GOAL_DEMANDS`, methods, admission). When neither the objective nor the specialty maps
to a strategy family, the technical id `general_goal_driven` is the spine (see "Universal goal-driven path"); nothing is blocked
for lack of a family.

## Universal goal-driven path

Fallback order: 1 `EXACT_GOAL` → 2 `STRUCTURED_EVENT` → 3 `GENERAL_GOAL_DRIVEN` → 4 error only if the objective is missing
(`GOAL_MISSING`), conflicting primary goals, or the profile fails existing validation. A specialty family (crossfit/hyrox/
running_general) remains the programming base (`SPECIALTY_FALLBACK`/`GENERAL_FALLBACK` metadata) when it exists; it is not required.
`general_goal_driven` is a technical id, not a discipline or objective: its `GOAL_DEMANDS` carry only generic SUPPORTING/OPTIONAL
capacities (no PRIMARY, no objective-specific demand), so the Coach orders the week from `goalRequirements`
(`universalPath: true`, `trainingContext.category/level`; level read from `declaredLevel`). Restrictions, availability, session
duration, equipment (explicit unavailable overrides defaults), prescription parameters and admission/materialization checks apply
unchanged. The LLM never writes the profile.

## Goal authority vs strategy support

The athlete's declared objective is the goal. `resolvePlanningStrategy` used to replace an unrecognised objective with the
strategy derived from the specialty (`c.recognizedId ?? fallback`) and present it as the goal (e.g. a Police-entrance objective
with CrossFit specialty was planned and rendered as "Preparación de CrossFit"). Now the result separates:

* `goalAuthority` — `origin: EXPLICIT_OBJECTIVE|NONE`, `objectiveRecognized`, `recognizedGoalId` (the objective text is never rewritten).
* `strategySupport` — `EXACT_GOAL | STRUCTURED_EVENT | SPECIALTY_FALLBACK | GENERAL_FALLBACK | GENERAL_GOAL_DRIVEN | NONE`.
* `fallback` — non-null exactly when the programming strategy is a specialty-derived fallback (`kind`, `strategyId`, `basedOn`, `reason: EXPLICIT_OBJECTIVE_NOT_SPECIALISED`).

`CanonicalWeekStrategy.goal.fallback` carries it into the planner and both week-objective renderers say "programación base …
(objetivo declarado sin estrategia específica)" instead of presenting the fallback as the athlete's goal. No keyword matching:
recognition is the existing catalog (`resolveGoalId`), so a future uncatalogued objective behaves the same. Without a declared
objective nothing is invented from the specialty (`GOAL_MISSING`); with no strategy family for the specialty the explicit objective
plans through `general_goal_driven`. The Mobile `objective` stays a string.

## Free → planning

1. Validate the whole payload (invalid ⇒ zero writes). 2. Compute the resulting state. 3. `resolvePlanningProfileStatus` for the target
mode. 4. One `UPDATE` on `usuarios` with compare-and-set on the state read (concurrent edit ⇒ `409 PROFILE_CHANGED_RETRY`, zero writes).
5. Training sources upsert. 6. Only if `ready`: `executeAthleteModeChange` — the same code `cambiar_modo_atleta` runs
(`lib/athlete/modeChange.ts`: specialty guard → missing fields → cycle → RPC `change_athlete_mode`). If not ready the profile is
saved, the mode is untouched and `missingFields` is returned. No week is generated, Coach is not opened, `onboarding_completado`
is never written.

### Atomicity limit

`change_athlete_mode` only changes mode/cycle and is not replaced in this phase, so profile + mode are not one transaction.
Guarantees: validation before writes; the `usuarios` columns and `perfil` keys this PATCH touches are written by ONE atomic call
(`forge_profile_apply`, see below); the mode changes only after the profile is persisted and ready, so "new mode + invalid profile"
cannot occur; if the RPC fails the profile stays saved and valid with the previous mode (`502 MODE_CHANGE_FAILED`,
`profileSaved:true`) and the call can be retried. Training sources live in another table and are written after the profile write
(`500 PROFILE_PARTIAL_WRITE` if that fails; mode untouched).

## Concurrency: field-scoped CAS (8C-A.2)

Before: `UPDATE usuarios … WHERE codigo AND modo_entrada AND categoria AND especialidad AND objetivo_principal = JSON.stringify(prev)
AND perfil = JSON.stringify(prev)` through PostgREST `eq` filters. `usuarios` has no version/updated_at/xmin usable through PostgREST,
and the whole `perfil` (coach_first_turns, prescription_signals, HR/marks…) was serialised into the query string and compared as text,
so any unrelated difference — or a perfil large enough to exceed URL limits or whose JSON text differs from the stored jsonb
(key order/whitespace/unicode) — produced a 0-row update that was reported as `409 PROFILE_CHANGED_RETRY`.
(Root cause is an evidence-based hypothesis: it was not reproduced on a real database from this environment. Run smoke stage S5b.)

After: `docs/sql/profile-field-cas.sql` defines `public.forge_profile_apply(p_user, p_expected, p_set)` (security invoker, `service_role`
only). Under a row lock it compares ONLY the authorities this PATCH touches (`usuarios` columns `categoria`, `especialidad`,
`objetivo_principal`, `distribucion_semanal`, and individual `perfil` paths / `prescription_signals` sub-keys), returns
`CONFLICT` with the field names before writing anything, and otherwise applies the change on the CURRENT row, so unrelated concurrent
edits (avatar, other perfil keys, other signals) are preserved. Real conflict (objective A read, B written by someone else, we save C)
→ `409 PROFILE_CHANGED_RETRY` with `fields`. RPC not installed → `503 PROFILE_CAS_UNAVAILABLE` (never an unguarded write).
**The SQL must be applied before PATCH works.**

## Profile change diff (8C-D)

A successful PATCH that changed something returns `profileChange` (omitted on no-ops):

```
profileChange: { version: 1, id: <24-hex digest of (field, previous, current)>, requiresCoachReview: boolean,
  changedFields: [{ field, class: 'PLAN_STRUCTURE'|'CONTEXT_ONLY', previous, current, requiresCoachReview }],
  handoffToken?: string }   // present only when requiresCoachReview
```

Derived from previous canonical projection vs persisted canonical projection (never the raw payload), restricted to the fields
the PATCH addressed (a concurrent edit of another field is not attributed to it; restrictions only when the payload carried them).
Review required: objective, category, specialty, weeklyAvailability, sessionDuration, trainingSources, restrictions, equipment, level,
targetEvent. Not required: age and CONTEXT_ONLY. PRESCRIPTION_PARAMETERS arrive with 8C-E. PATCH generates no week and calls no LLM.

## Coach handoff (8C-D)

`POST /api/chat { action: 'profile_change_handoff', sessionId?, messageId?, datos: { profileChange: { id, changedFields: [{field, previous, current}] }, token } }`
with `Authorization: Bearer`. The athlete is the verified principal's (`authenticatedAthleteId` on the legacy path, the resolved athlete in
Coach First); body `codigo`/`email`/`athleteId`/`message`/`pending`/`references`/`attachments`/`weeklyAction` are never authority. The server
verifies the HMAC token (athlete-bound, 24h, bound to the change digest so edited fields fail), REREADS the canonical profile and rejects with
`409 PROFILE_HANDOFF_STALE` if the persisted values no longer match (before any turn is claimed). It then builds ONE deterministic Spanish message
and ONE immutable context (`coachHandoffContext`: new objective = authority, previous = change context, specialty/sources = means,
availability, duration, level, restrictions, equipment, prescription parameters, plus a fixed instruction). Both Coach routes receive exactly that:

* Legacy (`NEXT_PUBLIC_FORGE_COACH_FIRST` off): `groundedReply → runChatCoach(..., { profileChange })`, profile read-only (no fact extraction,
  knowledge/state writes or learning). Response `{ ok, delivery: 'COACH_REPLY', changeId, answer, respuesta, … }`.
* Coach First (flag on; same action, `sessionId` + `messageId` required like any Coach First turn): `handleCoachFirst` claims the normal
  idempotent journal turn with the server message, injects the context as `profileChangeHandoff` in the turn JSON (system instruction
  `PROFILE CHANGE HANDOFF`), skips the canonical-week pre-parser, ignores client pending/references/attachments, and refuses the tools that would
  write profile truths (`update_availability`, `record_athlete_data`, `transition_restriction` → `PROFILE_HANDOFF_READ_ONLY`). Planning reads,
  session adaptation and generation stay available. Response is the standard Coach First turn response (`answer`, `operationId`, `persisted`, …).

Either way the exchange is stored in `usuarios.historial`, which the existing Coach screen hydrates (no second chat).

## Chat history persistence (8D)

Legacy `runChatCoach` appended history with `.eq('historial', JSON.stringify(before))` (the same whole-JSON compare that caused the profile false
409). It now calls `forge_chat_history_append(p_user, p_message, p_answer)` (`docs/sql/chat-history-append.sql`): append on the CURRENT history under a row lock
(concurrent exchanges both kept, in order; replay is a no-op; last 15 conversation turns). RPC missing → `CHAT_HISTORY_APPEND_UNAVAILABLE`, the answer is still
returned with `historySaved:false` (fail-closed, nothing written). Coach First history is unchanged (its own session RPC).

### Age in the handoff (8D.1)

`age` is a structured editable truth and a valid `changedFields` entry (stored representation: the range label, e.g. `"31-40"`; never converted,
inferred or derived from a date). It is covered by the same change digest/HMAC, reconciled against the persisted profile, and the Coach context carries the
canonical current `age` (immutable). An age-only change keeps `requiresCoachReview:false` (no handoff token is issued); alongside a reviewed field
(e.g. objective) the change stays `requiresCoachReview:true` and the handoff is valid.
Future profile model (product debt, NOT implemented): `dateOfBirth` as a stable source with `age` derived automatically; no field, migration, UI or computation exists yet.

## Legacy containment

`cambiar_modo_entrada` (web banner "Pasar a modo Coach") now applies the same specialty guard and the same required fields as the
canonical transition for every mode except `consulta`; otherwise it returns `400 PLANNING_PROFILE_INCOMPLETE` with `missingFields`.
`cambiar_modo_atleta` behaves exactly as before (its implementation moved to `modeChange.ts`).

## Not in 8C-A

Mobile UI, Coach hand-off / profile-change events, marks and HR editors, readiness, week generation,
`change_athlete_mode` replacement, Stripe.
