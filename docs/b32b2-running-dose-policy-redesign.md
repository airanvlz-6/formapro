# B.3.2B.2 — Method-specific Running dose policy redesign

Initial HEAD: `7436f224434b699f231736ee9ef5605e561e0a44`; initial working tree clean.
The preceding v1 numeric policy was local/pre-production and never pushed, as established in
the task context. It was rejected in B.3.2B.1. This change is a new local commit, not an amend.

## Decision and production behavior

Keep evidence admission, server authority, signed contracts, post-build validation, immutable
retries, independent Time/Intensity Authority and conflict closure. Replace universal weekly
quantity arithmetic with six method-policy families and an explicit compatible-evidence projection.

**All six production v2 families currently remain UNRESOLVED.** This is the intended result,
not an incidental inability to compose. No accepted numeric selection policy exists; current
canonical facts also cannot establish executed method-specific main-work quantities.
The provider is not called for UNRESOLVED or CONFLICT. First-plan generation can therefore block.
No fallback to v1, available minutes, level, planned volume, titles or LLM judgment is used.

## What was audited

- `runningDoseBaseline.ts`: factual windows, quantities and `plannedMethodId` semantics.
- `runningDoseEvidenceAuthority.ts`: admission classes, aggregate coverage, declarations and associations.
- `goalTransferModel.ts`: six methods, economy run/jump variants and canonical intent fields.
- `canonicalWeekStrategy.ts`: role/phase semantics, not numeric capacity.
- `workoutStructureLibrary.ts` / prior B.3.2B audit: descriptive ranges are not accepted numeric policies.
- `sessionAuthority.ts`, `sessionGeneration.ts`, `structuredSession.ts`: issuance, signing and validation.
- `FormaPro.tsx`: parallel Builder dispatch; no allocation ledger.

## Why v1 was rejected

Weekly volume is not session capacity. Observed incomplete totals and habitual declarations are
different facts. One generic duration sample cannot establish threshold/VO2/specific exposure.
Determinism did not justify fixed shares, caps, an 80% minimum or arbitrary preparation ceilings.

Removed from CURRENT issuance:

| Method | Rejected share | Rejected time/distance caps | Other rejected numeric authority |
|---|---:|---|---|
| base | 0.12 | 1800 s / 5000 m | universal target lower fraction |
| recovery | 0.06 | 900 s / 2500 m | half-base arithmetic |
| threshold | 0.04 | 600 s / 2000 m work | 2–4 efforts; 60–120 s recovery |
| VO2 | 0.03 | 480 s / 1600 m work | 3–5 efforts; 120–180 s recovery |
| specific | 0.10 | 1500 s / 4000 m | universal event policy |
| economy | none | none | 4–6 efforts; 10–20 s; 60–120 s recovery |

Also removed from v2: `0.8 × maximum`, implicit target=maximum, derived bout cap
`maximum/minimumSets`, and 600 s preparation cap. No replacement training constants were introduced.

`runningMethodDoseAuthorityV1.ts` and `runningMethodDosePoliciesV1.ts` freeze the old semantics
for previously signed LOCAL contracts. Their constants are not v2 policies. Validation dispatches
by version; freshness can refresh a signed v1 using v1. Current `generateTrainingSession` always
uses v2 for these canonical methods. Absent historical extensions retain existing compatibility.
No new policy or client input can select v1 during current server issuance.

## Compatible evidence, without universal precedence

`resolveCompatibleRunningDoseEvidence(admission, intent)` consumes B.3.2A only. It returns:

- full habitual declaration ranges and provenance refs; no lower-bound selection or averaging;
- observed activity quantity facts in original units, with hashed activity identity and date;
- every admitted descriptive observation window, including metric status and known-activity count;
- longest observed duration/distance as separate contextual metrics, not one combined synthetic run;
- matching completed-plan method associations with `quantityKnown=false`;
- `compatibleMethodQuantities.status=UNKNOWN` and `EXECUTED_METHOD_IDENTITY_NOT_MODELED`;
- conflicts, missing signals, evidence refs and `captureCompleteness=UNKNOWN`.

The actual canonical field is `plannedMethodId`: an association with a completed plan, not proof
of the executed method, intensity, format or main work. Even a verified activity quantity with
that field does not prove threshold work. Consequently no `observedEasySessions`, method work,
effort durations or rest quantities are fabricated. No title, description or report classification.

Activity facts remain separate duration/distance facts; there is no cross-unit conversion.
Semantic fact hashes replace positional indices in the signed projection. Unrelated planned rows
and reordered equivalent inputs do not alter authority; changed relevant facts do. This may
conservatively invalidate authority when relevant context changes even if a future selection
would stay numerically equal.

## Families, variants and status behavior

| Method | Family | Variant | Current non-conflict reason |
|---|---|---|---|
| running_base | AEROBIC_CONTINUOUS | running_base | MISSING_COMPATIBLE_EVIDENCE |
| running_recovery | RECOVERY | running_recovery | MISSING_COMPATIBLE_EVIDENCE |
| running_threshold | THRESHOLD_WORK | running_threshold | MISSING_COMPATIBLE_EVIDENCE |
| running_vo2 | VO2_INTERVAL | running_vo2 | MISSING_COMPATIBLE_EVIDENCE |
| running_specific | EVENT_SPECIFIC | canonical goalId:pattern | MISSING_COMPATIBLE_EVIDENCE |
| running_economy | TECHNICAL_EXPOSURE | canonical run or jump pattern | POLICY_NOT_ESTABLISHED |

Every missing numeric registry policy additionally diagnoses `RUNNING_METHOD_DOSE_POLICY_NOT_ESTABLISHED`.
Specific variants distinguish HM/10K/future intent context without expanding existing strategy
admission or using race distance as dose. Economy is not assumed to mean strides; run and jump
remain distinct canonical variants. Weekly quantity does not gate its numeric policy.

| Admission class | v2 treatment |
|---|---|
| DECLARED | Retain weekly range as context; no selected session target |
| OBSERVED | Retain actual quantities and coverage; no method classification or target inference |
| EXPOSURE_ONLY | Preserve non-quantitative association; no minutes |
| UNKNOWN | Explicit missing evidence/policy, not Builder discretion |
| CONFLICT | CONFLICT before policy selection/provider; declarations cannot mask it |

The registry exposes a server-owned `selectDose` boundary, currently null in all production
entries. Test-only runtime policies exercise RESOLVED contracts; no request/profile override,
environment switch or production test-policy import exists.

## Contract and validation

New issuance uses schema/policy version 2 and `<methodId>_dose_v2`. It binds canonical intent,
family/variant, compatible evidence, semantic refs, source digest, exact reason and diagnostics.
UNRESOLVED/CONFLICT have `dose=null`.

The typed resolved selection supports independently:

```text
metric / unit
selectedTarget: explicit range (required to resolve)
maximumAuthorized: optional
minimumUseful: optional
compositionTolerance: optional explicit admissible subrange of selectedTarget
structures
structureConstraints: mode / efforts / bout unit and range / recoverySeconds
```

A maximum does not supply a selected target. An absent/invalid target stays UNRESOLVED even
if a registry policy returns a maximum. No production minimumUseful or tolerance is populated.
Contract validation recomputes the registry result; a forged RESOLVED payload is rejected.

Post-build validation independently checks unit, main pattern, multiplication by sets, target,
optional max/minimum/tolerance, structure, effort count, bout and recovery when authorized.
It does not select, repair, clip or widen dose. Existing shape/catalog/intent validation still
precedes it. Existing time/sufficiency/intensity validation still follows it. Both attempts use
the same immutable contract. Receipt verification and freshness retain version-aware checks.

## Preparation boundary

`runningPreparationAuthority.ts` is a separate composition boundary with no numeric policy.
It currently rejects preparation as `RUNNING_METHOD_DOSE_PREPARATION_POLICY_NOT_ESTABLISHED`.
This intentionally closes the escape route rather than permitting arbitrary work relabeled as
warmup/cooldown. Structured proposals require preparation, so a future resolved method policy
also needs an accepted composition policy before full-session execution can succeed.

Current production already blocks before provider because every numeric method selection is
unresolved. The preparation validator is a second closed boundary for future/test resolved
contracts. Tests explicitly replace this boundary with a narrowly specified TEST composition;
that is not a product preparation policy.

## Permanent incident regressions

1. HM, declared 30 km/week, no verified execution/pace, RPE fallback and 90-minute ceiling:
   no meter or temporal envelope; v2 UNRESOLVED, provider calls zero. Acquiring pace alone
   would not establish individual session dose.
2. One verified 90-minute generic Running observation remains a 5400-second fact. It never
   becomes a 648-second base target. Threshold/VO2/specific do not inherit its quantity.
3. Declared distance plus partial observed duration retains both facts. There is no selected
   unit to switch from meters to seconds and no universal observation precedence.
4. Availability 60/90/120, level, readiness and restrictions do not rewrite factual admission
   or choose dose. Role/phase remain bound context without multipliers.

## Numeric inventory remaining in v2 code

| Value/operation | Location | Classification / meaning |
|---|---|---|
| 2 | registry, compatible evidence and authority | ENGINEERING: schema/policy version |
| 1 | authority | ENGINEERING: v1 compatibility dispatch; single continuous set/movement; absent sets representation |
| 0 | authority, compatibility | ENGINEERING: empty totals, ordering equality, positive quantity checks, no rest |
| -1 / 1 | compatibility ordering | ENGINEERING: stable object-key ordering |
| -1 | validator | ENGINEERING: absent recovery sentinel outside positive configured ranges |
| SHA-256 | compatibility | ENGINEERING: canonical digest algorithm, not training quantity |
| original metric values/ranges | compatible evidence | ATHLETE-DERIVED: unmodified admitted facts, contextual only |
| original window keys/dates | compatible evidence | EXISTING AUTHORITY: descriptive B.3.1/B.3.2A windows, not policy selection |

No NEW PRODUCT POLICY numeric training constant exists in v2. No weekly percentage, target
fraction, main cap, fixed effort count/duration or preparation time is active. Numeric fixture
values in `.test.mjs` / `runningDoseV2TestFixture.mjs` demonstrate contract behavior only.
Rejected v1 numbers remain solely in explicitly versioned compatibility files and historical tests.

## B.3.2B.3 prerequisites

- Approve an explicit first-plan selection policy for each intended family/variant, including
  applicable evidence classes and a justified selected target (not merely a maximum).
- Determine whether to acquire habitual session duration or comparable session exposure.
  Weekly km alone and pace alone do not establish individual capacity.
- Model executed-method/main-work identity if future policies require it; `plannedMethodId`
  is insufficient. Execution still does not automatically prove tolerated dose.
- Define valid composition/preparation semantics and quantities independently of method work.
- Establish unit executability without invented pace or changing intensity authority.
- If a policy allocates a weekly budget, precompute deterministic slot allocations before
  parallel Builder dispatch. No mutable Promise.all reservation was introduced here.

## B.3.3 boundary

B.3.2B selects/validates intrinsic method quantities when an accepted policy exists. B.3.3 owns
dose×intensity, accumulated weekly dose, preserved/surrounding sessions, interference, recovery,
progression, deload/taper compatibility. No such model was added. Time Authority still checks
the full session against availability; it never fills time or selects main work.

Typed method/family/variant, evidence provenance/coverage, intent role/phase/week, optional
authorized quantities, proposal and separate intensity authority remain available for B.3.3.
PRIMARY/SUPPORTING/MAINTENANCE/OPTIONAL are adaptation priorities, not long/easy/quality roles.

## Regression coverage

The new v2 suite covers A–Z through grouped tests, all six production unresolved families,
the real server boundary, incidents, evidence coexistence, tampering and deterministic refs.
Resolved v2 test-only policies preserve quantitative enforcement, wrong unit/structure,
effort/bout/recovery limits, independent target/max/minimum/tolerance, finite time rejection,
two-attempt immutability, receipt signing/verification and freshness coverage. The Planner
integration uses explicit isolated v2 test policies; it does not claim production can generate.
Frozen v1 regression tests remain clearly labeled compatibility, not production policy acceptance.

Validation results on the final implementation:

- 32 new v2 tests, including grouped A–Z cases; all pass in selected and global runs.
- Selected baseline/admission/dose/intensity/reference/time/structured/weekly/preflight regression:
  846/846 passed, zero skips.
- `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1904/1904 passed, zero skips.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- ESLint of every modified/new TS/MJS file against initial HEAD: 19 errors / 0 warnings
  before and after, all pre-existing in `sessionAuthority.ts`; delta zero. New files clean.
- No migration, import writer, frontend authority, intensity policy or B.3.3 model changes.
- Local commit only; no push.
