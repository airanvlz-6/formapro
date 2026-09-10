# B.3.2B.3B — Declared habitual aerobic continuity

Base: `d621c5bb557958a5c6ace9fa8bc2c80e470b1ccc`, initially clean.

## Product decision and numeric inventory

`running_base_declared_habitual_duration_v1` is the first production numeric selector in the existing Running dose v2 protocol. Its family is `AEROBIC_CONTINUOUS`, variant `running_base`. The policy ID versions the continuity decision; the surrounding authority protocol remains version 2.

This is a **product conservative continuity policy** for an existing runner's first Forge plan (or subsequently explicitly reconfirmed continuity). It selects the athlete's declared normal current easy outing. It is not a beginner first-exposure policy, verified capacity, maximum tolerated duration, physiological prescription or scientific optimum.

The selector assigns the declared duration itself, normalized from minutes to seconds. The only new quantity conversion is `minutes * 60`. No percentage, phase/readiness/level multiplier, pace conversion, fixed training duration, progression, weekly share or frequency multiplication is introduced.

Representation counts (one main block, one movement), protocol versions and the 2,048-character confirmation-token guard are engineering constants, not training quantities. Existing RPE 2–3, generation representation bounds, temporal limits and receipt/generation lifetimes are reused without changing their values.

## Evidence and eligibility

The factual flow remains profile JSON → structured declaration projection → B.3.1 baseline → B.3.2A admission → compatible evidence → numeric selector. The new confirmation is verified against the canonical duration fact and the server-owned interaction, attached to the baseline, then projected through admission. The raw signed proof is not sports evidence and is not sent to Builder.

The selector requires:

- `running_base`, `base_aerobica`, `run`, matching family/variant;
- exactly one compatible positive integral duration declaration, `AVAILABLE`, `DECLARED`, in minutes;
- safe integral unit normalization;
- no relevant declaration or admitted execution conflict;
- no `NO_HABITUAL_EASY_RUN`;
- confirmation belonging to the current planning interaction and matching the canonical fact.

An actual contract must additionally pass existing intent, management scope, restrictions, movement pool, data sufficiency, intensity and time authorities. Numeric selection alone grants none of these permissions.

Habitual frequency is **not required to select one session**. It remains a separate declaration for future weekly exposure decisions. An existing contradictory declaration of zero current habitual sessions still participates in B.3.2B.3A's conflict semantics. Missing frequency is not a conflict. Capturing duration for the current session policy does not ask the frequency question or derive N weekly sessions.

Weekly km and observed quantities coexist unchanged. Neither 30 km/week nor a completion flag can select minutes, explain a cross-unit discrepancy or supersede a current duration declaration.

## Exact dose and total-session composition

For an eligible 45-minute declaration, `AuthorizedRunningMethodDose` binds:

| Field | Value/meaning |
| --- | --- |
| `selectedTarget` | `minimum: 2700`, `maximum: 2700`, seconds |
| `maximumAuthorized` | `2700`, a policy bound against Builder escalation, not athlete capacity |
| `minimumUseful` | `null`; no physiological useful minimum is known |
| `compositionTolerance` | `null`; no invented percentage flexibility |
| `composition` | `SINGLE_CONTINUOUS_TOTAL` |
| `structures` | `continuo_carrera` |
| `allowedMovementIds` | `rodaje_z2` |
| `sourceDigest` / `evidenceRefs` | Bind compatible evidence, confirmation provenance and intent |

The wording “normal easy/conversational outing” is interpreted as the **entire outing**, not main work excluding preparation. The authorized representation is one continuous main block with one movement. No additional running/non-running preparation, hidden load, artificial zero-dose movements or default warmup duration is permitted.

`rodaje_z2` is the catalog's dedicated base movement. This policy intentionally does not admit the mixed base/threshold `progresivo`, long-run-specific alternatives, strides, interval work, jumps or erg work as interchangeable ways to satisfy the declared outing. The catalog ID does not authorize a personal HR zone: actual intensity is independently supplied by the existing intensity authority.

Schema-v2 shape parsing supports a one-main-block representation; contract validation admits it only with the explicit composition authority. Other contracts still reject one-block proposals. The two positional `blocks[1]` consumers now find `main` by type, so both existing layouts and the new authorized layout are handled. Existing preparation restrictions remain closed for other Running policies.

The Builder instructions explicitly replace the default warmup/main layout for this contract. The exact signed contract is frozen across both attempts. The validator checks the sole movement, continuous structure, exact total duration, authorized intensity and absence of any extra preparation. It does not clip, repair, redistribute duration or reinterpret labels.

## Independent intensity and Time Authority

The existing easy hierarchy is unchanged: `easyHr` → `easyPace` → RPE 2–3. HR needs its own reference and measurement capability; a duration declaration creates neither. With no HR/pace evidence the authorized RPE fallback is executable.

Dose selection precedes the temporal **fit decision**. Existing time-budget projection can be prepared earlier, but it is not an input to the numeric selector. After selection, `aerobicExecutionGate` checks the exact complete-session estimate using existing Time Authority. A single block/movement introduces no block/movement transition estimate.

- 45 minutes declared, 90/60/45 available: same 2,700-second target.
- 45 declared, 30 available: target remains 2,700; `SESSION_DOSE_TIME_INFEASIBLE` before Builder. Validation also rejects a proposed over-budget session.
- Missing time authority/budget remains unresolved; it is not treated as an unlimited budget.

No new `TimeDosePolicy` with an invented useful minimum is created. The maximum-only time contract and its hard limit remain intact. The UI reports the conflict without suggesting that a shorter dose is automatically acceptable.

## Freshness and reconfirmation

The audit found that `confirmedAt` alone cannot prove that a declaration was obtained in the current interaction. No physiological TTL is introduced. Declaration freshness remains `UNKNOWN`; an explicit interaction attestation separately authorizes use.

The dedicated capture action stores `perfil.runningHabitualConfirmation`, an HMAC proof bound to:

- the athlete's hashed identity;
- the server-issued `planningRunId`;
- target week;
- exact canonical duration fact digest and confirmation time.

The API derives the interaction from the verified generation token, never a client-provided run ID. Existing generation validity ends when its captured current calendar week is no longer current; calendar/session receipts retain their existing short lifetimes and snapshot freshness checks. These are transport/transaction lifetimes, not physiological expiry rules.

When an admitted strategic base method needs the declaration, preflight asks for minutes if missing, or asks whether the stored duration still applies. `CONFIRMAR` is an exact structured confirmation command; the athlete may instead enter the current integer duration. No fuzzy affirmation, arbitrary prose or LLM interpretation is used. The response includes the displayed duration value; confirmation rejects if the canonical current value changed before the answer. It never silently confirms a different outing.

New capture and explicit reconfirmation refresh `confirmedAt`, including unchanged values. A changed 45 → 35 declaration replaces the current fact and selects 2,100 seconds; there is no averaging. B.3.2B.3A's capture outside a planning interaction remains idempotent and does not acquire eligibility merely by persistence.

The client preserves its pending generation and includeToday choice while asking, then resumes that same generation after confirmation. A newly started run/week requires its own confirmation. Weekly receipts bind the planning run ID so Builder freshness reconstruction reads the same interaction. Session receipts bind the resulting evidence; changes to the canonical declaration invalidate freshness before save.

The generic profile update path preserves both namespaces. The raw declaration JSON and confirmation token are excluded from Builder's non-authoritative profile prose. Builder receives only its structured authorized dose/evidence. Identity authentication and concurrent full-JSON profile merging remain limitations of the existing chat/profile transport; this change does not claim to migrate those systems.

## Capability, Strategy and scope

Eligible base evidence now yields numeric `QUANTIFIABLE`. Capability also reports composition, intensity and time status plus a prescription-block reason. `prescriptionAllowed` requires existing scope, numeric resolution and the applicable execution gate. Thus a 2,700-second target can be numerically quantifiable while time is `INFEASIBLE` and prescription is disallowed.

Old/unconfirmed declarations expose `RECONFIRMATION_REQUIRED`, not a missing numeric policy. Missing evidence and relevant conflict remain explicit. The policy is installed even when evidence cannot activate it.

`authorizedMethodCandidates` admits base only when execution gates permit it. It does not replace threshold with base or mark threshold/specific adaptation coverage as satisfied. A partial week of admitted aerobic work is allowed with explicit deferred demands; any supporting method remains subject to its own existing authority. When time exclusions leave no new executable option, the weekly result identifies time infeasibility. No unrelated frequency question is asked to fix time.

Focus remains restricted to its managed discipline. Supervision gains no prescription permission from capture or numeric evidence. Weekly frequency/allocation, generation caps and retries are unchanged.

## No habitual run, successors and boundaries

`NO_HABITUAL_EASY_RUN` returns `FIRST_EXPOSURE_POLICY_REQUIRED`. There is no universal starter duration. The other five selectors remain production-null: `running_recovery`, `running_threshold`, `running_vo2`, `running_specific`, `running_economy`.

A successor needs trustworthy executed comparable easy-running quantities, executed method identity and an explicitly accepted aerobic evidence-based policy. The current execution writer still cannot supply that identity/quantity authority. Until such a successor exists, this declaration-based source can be used only with explicit reconfirmation. There is no retirement after an arbitrary number of sessions and no upgrade of completed-plan flags to observed dose.

B.3.2B.3C may establish separately reviewed method/evidence policies; it is not implemented here. B.3.3 weekly exposure, allocation and progression must explicitly handle habitual frequency and cumulative dose. This session-level policy does not claim to solve them.

## Validation

The new `aerobicContinuityPolicy.test.mjs` covers all 12 requested scenarios, exact target/max/null semantics, no-preparation escape, incompatible movement/intensity/interval attempts, confirmation binding and concurrent-value rejection, immutable retry, time/capability separation, UI continuation and real weekly receipt → Builder → session receipt → pre-save freshness.

Existing B.3.2B.3A assertions now expect reconfirmation rather than missing-policy status. Synthetic numeric policies retain explicit `test_` identities so legacy temporal/validator tests exercise their intended downstream boundaries without accidentally invoking the new production policy or bypassing production freshness.

Validation: 22 new policy tests, 940 selected regression tests, and the final full library suite (1,952/1,952) pass. TypeScript (`npx tsc --noEmit`) and `git diff --check` pass. Modified-file lint has zero delta against the initial HEAD: 473 existing errors and 55 existing warnings; new files have no lint findings. The final preflight test also covers fully protected weeks: they do not request an irrelevant habitual-duration reconfirmation.
