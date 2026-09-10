# B.3.2B — Running Method Dose Authority

> Historical, rejected numeric v1; local/pre-production and never pushed. Current issuance is
> redesigned in [B.3.2B.2](b32b2-running-dose-policy-redesign.md). Numbers below are retained
> as audit history and compatibility semantics, not accepted current training authority.

Initial HEAD: `ff41e5ff5e27bd931ded9d32088a365f059f8ed8`, clean working tree.
Local implementation only; no push, migration, execution writer or activity matching.

## Policy provenance: read before interpreting the numbers

The numbers below are **newly codified Forge product policies for this phase**, not existing
deterministic repository knowledge, physiological safety thresholds, or values established by
the references. They implement a bounded initial authorization envelope; they do not establish
optimal training, minimum adaptation-effective work or injury safety. They are explicit versioned
decisions, not hidden Builder defaults. B.3.3's joint and weekly checks remain necessary.

Repository audit:

* `sessionTimeDosePolicy.ts` has no production target/minimum-useful policies. It remains unchanged.
* `workoutStructureLibrary.ts`: continuous Running 30–120, intervals 25–50, recovery 10–40,
  tempo 20–50, technique 10–30 minutes are **descriptive metadata**, not enforceable minima/maxima.
  None is promoted to an authority or used as the numeric source here.
* `sessionDose.ts` already knows sets, work quantity, rests and operational time estimation;
  it does not contain a quantitative athlete-specific Running policy.
* Running intensity policies authorize intensity separately. No HR/pace/intensity rule changes.
* B.3.1/B.3.2A distinguish declarations, verified quantities and occurrence-only evidence;
  planned quantities and the Analyzer's relative volume are not admissible sources.

[Olympiatoppen's published scale](https://olt-skala.nif.no/en) was reviewed for the distinction
between session duration, interval duration and recovery, and its elite-athlete/individual-variation
limitations. It does **not** establish the percentages or caps below. No elite session model,
HR formula or intensity value was imported into this policy.

## Numeric registry v1

All rows support OBSERVED and DECLARED quantitative basis. UNKNOWN and EXPOSURE_ONLY have
no numeric fallback and resolve UNRESOLVED. CONFLICT stays CONFLICT for every row.

| Method / policy ID prefix | Main allocation share | Cap if basis is seconds | Cap if basis is meters | Structures / composition |
|---|---:|---:|---:|---|
| `running_base` | 0.12 | 1800 s | 5000 m | `continuo_carrera`; one continuous main movement |
| `running_recovery` | 0.06 | 900 s | 2500 m | `continuo_regenerativo`; half the base share/caps |
| `running_threshold` | 0.04 | 600 s work | 2000 m work | `tempo_continuo` or `intervalos_carrera`; intervals 2–4 efforts, 60–120 s recovery |
| `running_vo2` | 0.03 | 480 s work | 1600 m work | `intervalos_carrera`; 3–5 efforts, 120–180 s recovery |
| `running_specific` | 0.10 | 1500 s | 4000 m | `continuo_carrera`; exact admitted HM/10K goal context required |
| `running_economy` | none | no aggregate-time allocation | no distance allocation | `tecnica_carrera`; 4–6 timed efforts, 10–20 s each, 60–120 s recovery |

Policy IDs are `<methodId>_dose_v1`, version 1. Registry entries explicitly include supported
evidence classes and `fallback=UNRESOLVED`. The policies live only in
`runningMethodDosePolicies.ts`; the validator does not select new quantities.

Exact arithmetic for the five volume/work policies:

```text
maximumAuthorized = floor(min(selectedBasisQuantity * methodShare, sameUnitCap))
target.minimum = max(1, floor(maximumAuthorized * 0.8))
target.maximum = maximumAuthorized
minimumUseful = null
```

No seconds/meters conversion. A result below the positive representable unit is UNRESOLVED.
The 0.8 factor is a **new product composition tolerance**, not an 80/20 intensity distribution
or a physiological minimum. `minimumUseful=null` is deliberate: this phase does not invent
minimum adaptation-effective durations. Under-target rejection enforces the chosen target
envelope, not a claim that its lower endpoint is a sports-science minimum.

Rationale/classification of every additional number:

* Shares 0.12/0.06/0.04/0.03/0.10: **new domain allocation policies**. Base receives the largest
  initial share; recovery half; threshold/VO2 smaller work-only shares; specific work remains
  below base rather than growing to race distance. These exact ratios are product choices.
  The 0.10 share is not a weekly 10% progression rule.
* Seconds/meters caps in the table: **new domain admission ceilings**, not measured capacity
  and not universal injury-safety ceilings. They prevent large declarations/observations from
  authorizing arbitrarily large single-session main work. They do not convert one unit to another.
* Target factor 0.8: **new envelope tolerance** for composition; no average of declarations.
* Interval counts and rests in the table: **new domain composition constraints**. VO2 recovery
  is longer than threshold recovery. For interval work, maximum per-bout quantity is
  `maximumAuthorized / minimumSets`, in the authorized unit. The whole total is also validated.
* Economy 4–6 efforts, 10–20 s work, 60–120 s recovery: **new fixed technical-exposure policy**,
  gated by an admitted quantitative basis. Effort count is not inferred from past occurrence count
  or kilometers. It is not enabled for UNKNOWN/EXPOSURE_ONLY. Jump-pattern variants stay UNRESOLVED.
* Preparation 600 s per warmup/cooldown block: **new preparation ceiling**, not a 600 s default
  or minimum. It prevents moving unbounded work outside main to evade the main envelope.
* One continuous movement, sets=1, rest=0: representation of the existing continuous structure
  semantics. No per-side or format multipliers can hide extra main work.
* Existing 0–120 s transition uncertainty and generic representation bounds remain unchanged.
* Protocol version 1 and positive-unit floor are engineering mechanics, not training policy.

## Evidence selection and class behavior

The only input selector is `selectRunningDoseBasis(RunningDoseEvidenceAdmission)`. It receives
no raw profile/history, availability, level, readiness, restrictions or Analyzer metadata.

1. Primary CONFLICT blocks selection. No declaration masks contradictory execution evidence.
2. Prefer available/partial **observed 7-day duration**; otherwise observed 7-day distance.
3. Otherwise select the minimum of the lower endpoints of admitted weekly-distance declarations.
   Different declarations remain in B.3.2A; this is an explicit conservative selection rule,
   not averaging, and does not upgrade declaration to execution.
4. Otherwise quantity remains unknown and resolution is UNRESOLVED. Old observations only in the
   28-day window do not create a 7-day quantity. No fallback to level or available days.

Observed duration is selected before distance as an explicit unit-priority policy, not a claim
that different metrics have identical meaning. OBSERVED and DECLARED still coexist upstream;
only the selected quantitative basis is carried in the signed dose authority. Sample metric
status, knownActivities, source window and captureCompleteness=UNKNOWN remain explicit.
An observed quantity is a known contribution, never an estimate of all weekly activity.

| Evidence class | All six methods |
|---|---|
| OBSERVED with selected quantity | RESOLVED in its unit, with original sample limitations |
| DECLARED | RESOLVED in meters, except the explicit economy effort policy |
| EXPOSURE_ONLY | UNRESOLVED; occurrence does not authorize minutes |
| UNKNOWN | UNRESOLVED; no hidden conservative fallback |
| CONFLICT | CONFLICT; provider not called |

Role, canonical block phase/week and goal are bound in the signed context. V1 does not numerically
scale dose by phase/role, implement taper/deload progression, or create new goal/strategy support.
The existing strategic-intent validator still controls admissible method/goal/role combinations.
`running_specific` does not make previously unsupported 10K strategy paths available.

## Weekly allocation and orchestration audit

`FormaPro.tsx` builds `diasAConstruir` and dispatches `construir_sesion_dia` with `Promise.all`.
Each request reaches `sessionAuthority.generateTrainingSession`; there is no sequential allocation
ledger. This implementation does not pretend otherwise or rely on call order.

Each envelope carries `allocation={scope:MAIN_ONLY, share, basisQuantity,
aggregateEnforcement:DEFERRED_B33}`. A session never receives the full weekly quantity as its
main allowance, and allocation is not weekly quantity divided by available days. However, these
are **per-session main allowances**, not a reserved complete-week budget. Preparation, mixed-unit
work, repeated allocations and accumulated intensity require B.3.3. No atomic budget reservation,
sum across units or complete-week-dose enforcement is claimed here.

## Contract, validation, retry and freshness

`generateTrainingSession` computes admission → selected basis → `AuthorizedRunningMethodDose`
for each of the six canonical Running methods, after loading the existing server context and
before calling the Builder. The contract adds `runningMethodDose`, including policy/version,
selected basis, stable evidence refs, context, sourceDigest, target/max, unit, structures,
interval/bout constraints and preparation cap. Existing intensity authority is independent.

The immutable private contract is used in both attempts. Prompt instructions require composing
inside its quantitative envelope. Unknown/conflict authorities stop before provider invocation.
`validateRunningMethodDose` runs after shape/catalog/pool/intent checks and before existing
time/sufficiency/intensity checks. It checks all main movements, sets multiplication, unit,
total work, bout/count/rest limits, continuous structure and preparation. No silent clipping,
metric conversion, quantity invention or authority mutation on retry. Dose violation codes enter
the existing maximum-two-attempt mechanism and the SAFE dose diagnostic stage.

`validRunningMethodDose` re-resolves the versioned policy from the bound basis/context and
compares canonical digests. Provider/client changes cannot widen the signed authority. Semantic
fact hashes, rather than baseline array indices, make refs stable when unrelated planned rows
are added. Freshness before persistence compares the new canonical basis as well as the existing
SessionDoseContext digest. The authority is retained in structuredPrescription metadata for B.3.3;
human rendering wording is not changed.

Previously signed contracts without this extension remain readable. Legacy isolated contract
composition and non-adaptation/stimulus-only paths retain their prior semantics; this phase does
not infer a six-method intent for them. The current six-method server issuance path always attaches
the authority. Box and supporting-strength policies are unchanged.

## Availability separation and production examples

The method resolver does not receive availability. Existing Time Authority evaluates the complete
proposal after method bounds; insufficient time rejects rather than scaling the dose or filling
time. All six method authorities are identical for 60/90/120 minutes given the same evidence/context.
For example, an observed-based 1800 s main with 300 s preparation on either side estimates
40–44 minutes (expected 42), whether the available ceiling is 60, 90 or 120 minutes.

For **declared 30 km/week**, without verified actual quantities:

| Method | Authorized MAIN target |
|---|---|
| base | 2880–3600 m |
| recovery | 1440–1800 m |
| threshold | 960–1200 m work, continuous or constrained intervals |
| VO2 | 720–900 m work, 3–5 constrained intervals |
| HM specific | 2400–3000 m |
| economy | 4–6 efforts of 10–20 s, with bounded recovery |

These are **meters, not seconds**. The original `600 + 3600 + 600` seconds incident fails metric
authorization for base, threshold and specific work. Declared 30–35 km yields the same envelopes
from its lower bound. With no declaration/actual quantity, those methods stay UNRESOLVED.

Important unchanged executability limitation: declared kilometers do not supply a pace reference.
With distance prescribed, RPE intensity and a finite time ceiling, the existing estimator cannot
bound duration and still rejects `SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET`.
B.3.2B does not invent a pace, switch authorized HR/RPE to pace, loosen Data Sufficiency, or claim
to make every first plan executable. A real signed-distance fixture succeeds with an already
authorized executable pace reference. The no-reference incident remains closed rather than
falling back to arbitrary time. VO2's existing RPE-only intensity can therefore remain temporally
unexecutable with distance-only evidence; solving that requires a separately authorized policy.

## B.3.3 boundary and limitations

B.3.2B controls how much main work may be proposed. B.3.3 must check that amount against intensity,
surrounding sessions, recovery/interference and cumulative weekly exposure. Method intensity and
minimum adaptation-effective work are not inferred here. Economy's existing intensity gap remains.
No ACWR, progression, physiological equations, readiness modulation, execution imports, new
references, substitution or C3 strength policy is implemented.

Prerequisites now retained for B.3.3: signed method/context, quantitative envelope/unit, actual
proposal, independent intensity authority, sample provenance/coverage, main-only allocation share,
bout/rest limits, and explicit unresolved conditions. Version-1 policy definitions must not be
silently repurposed when future policy versions are introduced.

## Validation

- New authority suite: 25 tests; covers the A–AE matrix through grouped cases.
- Selected regression: 578/578 passed, including baseline/admission, references/intensity,
  time/dose, structured generation, whole-week and preflight coverage.
- Full `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1872/1872 passed, no skips.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- ESLint comparison of each modified existing file against initial HEAD: unchanged
  20 errors and 1 warning. New files: zero errors/warnings. Lint delta: zero;
  the existing repository lint debt is not claimed to be clean.
- Initial HEAD: `ff41e5ff5e27bd931ded9d32088a365f059f8ed8`; initial working tree clean.
