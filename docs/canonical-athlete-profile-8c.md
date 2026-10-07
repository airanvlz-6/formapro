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
single compare-and-set `UPDATE` as the other profile fields; other signals (`capability.*`, `skill.*`) are untouched. `[]` means
"no explicit declarations" (back to unknown) — **never** "no equipment"; to say an item is not available send it as `unavailable`.
Nothing is inferred from specialty or category. Read: `planStructure.equipment` (explicit declarations only).

## Goal authority vs strategy support

The athlete's declared objective is the goal. `resolvePlanningStrategy` used to replace an unrecognised objective with the
strategy derived from the specialty (`c.recognizedId ?? fallback`) and present it as the goal (e.g. a Police-entrance objective
with CrossFit specialty was planned and rendered as "Preparación de CrossFit"). Now the result separates:

* `goalAuthority` — `origin: EXPLICIT_OBJECTIVE|NONE`, `objectiveRecognized`, `recognizedGoalId` (the objective text is never rewritten).
* `strategySupport` — `EXACT_GOAL | STRUCTURED_EVENT | SPECIALTY_FALLBACK | GENERAL_FALLBACK | NONE`.
* `fallback` — non-null exactly when the programming strategy is a specialty-derived fallback (`kind`, `strategyId`, `basedOn`, `reason: EXPLICIT_OBJECTIVE_NOT_SPECIALISED`).

`CanonicalWeekStrategy.goal.fallback` carries it into the planner and both week-objective renderers say "programación base …
(objetivo declarado sin estrategia específica)" instead of presenting the fallback as the athlete's goal. No keyword matching:
recognition is the existing catalog (`resolveGoalId`), so a future uncatalogued objective behaves the same. Without a declared
objective nothing is invented from the specialty (`GOAL_MISSING`); with no strategy family for the specialty the result stays
`STRATEGY_UNSUPPORTED`. The Mobile `objective` stays a string.

## Free → planning

1. Validate the whole payload (invalid ⇒ zero writes). 2. Compute the resulting state. 3. `resolvePlanningProfileStatus` for the target
mode. 4. One `UPDATE` on `usuarios` with compare-and-set on the state read (concurrent edit ⇒ `409 PROFILE_CHANGED_RETRY`, zero writes).
5. Training sources upsert. 6. Only if `ready`: `executeAthleteModeChange` — the same code `cambiar_modo_atleta` runs
(`lib/athlete/modeChange.ts`: specialty guard → missing fields → cycle → RPC `change_athlete_mode`). If not ready the profile is
saved, the mode is untouched and `missingFields` is returned. No week is generated, Coach is not opened, `onboarding_completado`
is never written.

### Atomicity limit

`change_athlete_mode` only changes mode/cycle and is not replaced in this phase, so profile + mode are not one transaction.
Guarantees: validation before writes; one atomic CAS `UPDATE` for all `usuarios` columns; the mode changes only after the profile is
persisted and ready, so "new mode + invalid profile" cannot occur; if the RPC fails the profile stays saved and valid with the previous
mode (`502 MODE_CHANGE_FAILED`, `profileSaved:true`) and the call can be retried. Training sources live in another table and are
written after the `UPDATE` (`500 PROFILE_PARTIAL_WRITE` if that fails; mode untouched).
`distribucion_semanal` is not part of the CAS (its column type is not asserted here); a concurrent write to it alone is last-writer-wins.

## Legacy containment

`cambiar_modo_entrada` (web banner "Pasar a modo Coach") now applies the same specialty guard and the same required fields as the
canonical transition for every mode except `consulta`; otherwise it returns `400 PLANNING_PROFILE_INCOMPLETE` with `missingFields`.
`cambiar_modo_atleta` behaves exactly as before (its implementation moved to `modeChange.ts`).

## Not in 8C-A

Mobile UI, Coach hand-off / profile-change events, marks and HR editors, readiness, week generation,
`change_athlete_mode` replacement, Stripe.
