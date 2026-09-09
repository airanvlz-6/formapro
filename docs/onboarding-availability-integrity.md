# Onboarding availability: capture and weekly confirmation

Base audited: `407d97b8415da7db86bdcc8bab400ea12926a95c` (clean tree).

## Demonstrated cause

`app/FormaPro.tsx` captures `dias_disponibles` as explicit weekday selections in
`selMulti`, then copies them into the onboarding `perfil`. The welcome request
uses `buildPrompt(catObj, perfil, ...)` before `guardar_usuario`. Consequently its
summary can name the days without any successful canonical availability read.

For non-Focus onboarding the payload stored
`distribucion_semanal = { disponibilidad: [...] }`. `projectLegacyCreate` preserved
that generic key. `loadWeeklyCalendarContext` instead asks
`normalizeTrainingAvailability` for each managed discipline. For Carrera,
`canonicalAvailability` finds no `carrera` category, resulting in unavailable
managed days. `readAvailabilityConfirmation` returns
`AVAILABILITY_EXISTING_REQUIRED`; the unconfirmed branch of
`dispararGeneracion` displayed “No he podido comprobar tu disponibilidad”.

This is a reproducible writer/projection mismatch, not evidence that production
lost the array or used cached AthleteContext. No production database was read:
the fixture reproduces the exact current UI payload and persisted representation.
The confirmation endpoint reads the database again on each call. The welcome
summary alone does not prove persistence succeeded for the incident's user.

## Fix boundary

`projectOnboardingAvailability`, called by the creation writer after specialty
normalization, projects the sole generic explicit day category onto the sole
configured discipline. It applies only to Coach/planning creation. It does not
infer days from counts, text, surfaces, or another discipline. Invalid or ambiguous
input, explicit category distributions, Focus and other modes remain unchanged.
Existing scope/catalog mappings determine the discipline; no Carrera branch.

Before: `{"disponibilidad":["lunes","miercoles","viernes","domingo"]}`.
After: `{"carrera":["lunes","miercoles","viernes","domingo"]}`.
`perfil.dias_disponibles`, duration and environment fields are unchanged.
React now displays the distribution returned by the writer, rather than its
pre-projection local string. Planner still relies on fresh backend reads.

## State/authority distinctions

| State | Existing structured discriminator | Next action |
|---|---|---|
| No valid habitual availability | `ok:false`, `AVAILABILITY_EXISTING_REQUIRED` | Block and request valid discipline days |
| Habitual known, week not confirmed | Successful `readAvailabilityConfirmation` with question and snapshotDigest; generation entry is unconfirmed | Ask confirmation |
| Confirmation in current flow | `CONFIRM_EXISTING_AVAILABILITY` or verified update; preflight binds current digest | Continue through existing preflight/temporal flow |

“Estoy de acuerdo” with methodology enters the unconfirmed generation branch;
it cannot skip the availability question. “Sí” after that question validates its
snapshot. Existing signed environment confirmation remains bound to user, week,
generation, digest and short TTL. This fix issues no confirmation or receipt.
Future-week temporal choices and includeToday behavior are unchanged.

The existing bounded correction grammar rejects “Esta semana solo lunes,
miércoles y domingo” without a discipline. “carrera solo lunes, miércoles y
domingo” updates habitual storage, not a separate weekly override. Both behaviors
are tested and deliberately preserved; no grammar or override redesign.

## Duration and environment control

`perfil.duracion = "Hasta 1h 30min"` follows profile persistence → canonical
`sessionTimeBudget` → `SessionDoseContext.timeBudget.maximumSeconds=5400`.
Unlike days, duration does not require a discipline category in distribution.
`perfil.dias` is a frequency/count input, not authority to infer weekday names.
`perfil.superficie` holds asfalto/pista preferences, not per-day assignments and
does not participate in the failing lookup. No time of day is invented.

Confirmed Box assignment remains the existing way to grant SESSION_ASSIGNMENT
environment authority; Carrera surfaces do not turn into Box equipment. Tests
cover preservation and confirm that unconfirmed assignments do not grant it.

## Coverage and limitations

Permanent tests in `lib/athlete/onboardingAvailability.test.mjs` reproduce the
before/after writer, fresh confirmation read, actual frontend generation entry,
methodology agreement, yes, corrections, missing data, existing profiles,
duration, environment, future week, snapshot mutation, ambiguous input and
CrossFit equivalence. Existing availability/environment/preflight/receipt tests
cover the downstream chain without changing it.

Already-created generic-key rows are not rewritten by this creation-only fix.
An explicit correction using the existing availability flow can save them;
any bulk repair requires a separate audited data operation. No migration or
backfill is included. Technical read failures remain fail-closed under the
existing endpoint error contract; this is not an observability redesign.

No intensity, strategy, dose, feasibility, retry, generation cap or environment
policy changes. Local commit only; no push.

## Validation

- Final onboarding/creation tests: 29/29 passed (including 10 added tests).
- Selected availability/environment/preflight/session authority tests: 318/318
  passed before the final environment and full-POST test additions; both additions
  are covered by the final run below.
- Full suite: `node --test --test-concurrency=4 lib/**/*.test.mjs` — 1786/1786.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Lint delta: zero. FormaPro retains 182 errors / 46 warnings; legacyContainment
  retains 2 errors; new helper and changed test files have zero errors/warnings.
  Baselines were checked against HEAD, not hidden as successful global lint.
- The initial global run failed one test because its dependency stub returned
  canonicalSpecialty for every import. The test now loads real containment
  dependencies; the final complete rerun has no failures.
