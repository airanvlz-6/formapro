# D3 V1 final enforcement

This completes the local D3 worktree against f0efc8d. No production connection,
database migration, unit inference or numeric progression selector is involved.

## Root cause and fixtures

The original historical HM fixture fails for category **D: B3 dose capability
interaction**. Monday/Wednesday/Friday are available, scope manages Carrera and
there are no active restrictions. Legacy duration is unitless. There is no
confirmed habitual duration. `resolveRunningMethodDose` cannot select an easy
dose; `resolveAuthorizedMethodCandidates` excludes the non-prescriptible base
capability and the weekly contract reports `D3_REQUIRED_EASY_UNAVAILABLE`.
REQUIRED is preserved.

The positive fixture adds a separate structured 45-minute habitual declaration,
three habitual sessions per week, and the existing server confirmation bound to
the planning run. These are fixture inputs, not facts asserted about production
or inferred from legacy history. Both fixtures use the supplied July–September
record patterns, including safety-net rows and notes that are never extracted.
No detailed June records were supplied.

## Unchanged temporal and continuity policy

Civil days: >56 BASE_BUILD; 22–56 SPECIFIC_BUILD; 8–21 TAPER; 0–7 RACE_WEEK;
past event POST_EVENT, with a nonnegative reported horizon. D1 confirmation and
primary active HM identity are required. These are Forge product boundaries.

The inherited continuity classifier requires at least six distinct active weeks,
four sessions in the latest 28 civil days, a latest session no more than 14 days
old, two long-run exposures, two quality exposures and easy/recovery evidence.
No records means INSUFFICIENT; stale latest exposure means STALE; other current
history means DEVELOPING; all conditions produce ESTABLISHED_CURRENT. Legacy
numeric duration does not contribute to this decision.

## Enforcement path

1. `loadWeeklyPlanningContext` derives D3 from D1/D2A and adds it to Carrera's
   server context. The same context is reconstructed by `assertFreshWeeklyAuthority`
   and used by `sessionAuthority` to build the session contract. The existing
   signed weekly contract digest binds these constraints and history changes.
2. `buildDoseCapabilityProfile` receives typed longitudinal intent. B3 reports
   `numericProgressionAuthorized: false`; a resolved existing dose is preserved.
   PROGRESS with a resolved dose still reports PROGRESSION_SELECTOR_NOT_ESTABLISHED.
3. `resolveMethodIntensity` receives the typed D3 session context, includes it in
   the source digest, rejects forbidden method categories, and removes canonical
   rodaje_largo targets when longRun is forbidden. It still selects actual HR/RPE
   through existing C2 policies. Weekly capability requires resolved C2 as well
   as resolved B3 and all existing execution gates.
4. Weekly enumeration filters methods, protects the event date and checks required
   purposes. Selection uses exact option IDs and independently checks requirements.
5. `generateContractSession` rejects forbidden/date-conflicting contracts and
   missing B3/C2 before invoking the completion callback. Its existing immutable
   snapshot includes D3, B3 and C2 in Builder's CONTRACT JSON.
6. `validateSessionAgainstTrainingContract` checks that same contract after
   composition, rejects forbidden canonical long-run movement and missing B3/C2,
   and retains exact existing B3 quantity and C2 intensity validation. Free-text
   titles are not purpose authority.

## Product proof

`d3-v1-product-proof.json` contains the actual positive decision, entire weekly
contract, method capabilities, Builder contract, candidate and validator result.
The automated proof additionally calls `composeBoundedWeek` and
`generateContractSession` using deterministic completion callbacks, not a live LLM.
It selects one easy session and rest in remaining slots, satisfies required
coverage, invokes Builder once and validates one continuous rodaje_z2 at exactly
2700 seconds with the existing C2 RPE 2–3 policy. No numeric increase is authorized.

The original fixture remains quantitatively unavailable and is correctly rejected.
The positive fixture is BASE_BUILD / ESTABLISHED_CURRENT / MAINTAIN at 66 days.
Easy is REQUIRED; recovery, longRun and quality ALLOWED; eventSpecific, progression
and overload FORBIDDEN. Allowance never makes an unresolved method executable.

## Current selector limitations are explicit

Only the existing running_base selector supplies an executable numeric target.
There is no dedicated B3 long-run or recovery selector. LongRun REQUIRED therefore
fails with D3_REQUIRED_LONG_RUN_NO_AUTHORIZED_SELECTOR. It never relabels the
habitual easy dose as a long run. Recovery REQUIRED in taper/race-week fails with
D3_REQUIRED_RECOVERY_UNAVAILABLE. This is an enforced unmet requirement, not an
executable taper prescription. Adding selectors is outside this task.

Quality may have C2 resolved (threshold in the fixture) or unresolved (VO2), but
both remain non-prescriptible without a B3 selector. The original unavailable
fixture cannot produce an executable week without additional canonical evidence.

Negative tests cover forbidden quality/long run, missing required easy/recovery/
quality, required unsupported long run, unresolved C2, missing B3, event-date
collision and increased dose. Taper/race contexts are exercised through the real
weekly loader and generation/validation rejection boundaries. No permissive
fallback creates an otherwise unavailable session.
