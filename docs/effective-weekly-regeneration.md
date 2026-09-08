# Effective weekly regeneration

Repair 1 on 14c288f. The two-generation limit is unchanged.

For a snapshot targeting the active civil week, completed entries remain protected.
Past REST/RECOVERY/UNAVAILABLE entries retain their previous historical semantics;
unreported past TRAIN remains unavailable rather than being prescribed retrospectively.
Current external activity still fixes its days through the existing domain adapter.
Future old REST/RECOVERY/UNAVAILABLE alone no longer confers protection.
Other target weeks retain the preceding protection policy.

The adapter derives `regeneration.pendingManagedDays` from current managed availability
minus fixed days, respecting the existing includeToday decision. There is no client
sport-specific authority and no new inference of availability.

The global minimum remains one TRAIN or RECOVERY. For active regeneration, the finite
existence proof additionally requires a non-protected executable option. Coverage is
bound under this same condition; there is no new volume target or arbitrary training
frequency. Selection reports preservedExecutableDays and newExecutableDays separately.

Terminal outcomes have ok=false and canContinue=false, including a legitimate no-op:
- WEEKLY_REGENERATION_NO_OP / NO_REMAINING_MANAGED_DAYS: nothing remains to plan.
- NO_NEW_EXECUTABLE_PRESCRIPTION / NO_FEASIBLE_REMAINING_SELECTION: no admissible
  remaining selection exists under the current methods, restrictions and calendar ceiling.
- NO_NEW_EXECUTABLE_PRESCRIPTION / NO_NEW_EXECUTABLE_SELECTION: Planner selected
  no new executable despite a feasible domain, after its existing proposal budget.
- NO_NEW_EXECUTABLE_PRESCRIPTION / EMPTY_BUILDER_TARGETS: defensive client stop.

No terminal outcome persists a weekly plan or inserts a generation log. The save route
verifies the signed calendar before preparing survivor identities or doing save effects;
it derives survivor indices from signed original-content digests, not old state types.
Ordinary receipt freshness and final session/whole-week validation still apply.
Old active-week receipts fail the rebuilt contract digest check; no migration is needed.

The frontend retains structured outcomes from preflight, Planner and save, including
non-2xx save responses. Presentation distinguishes no-prescription, no-op, cap and
technical failure. Week Integrity still validates integrity only. Assembly diagnostics
separate Builder targets/successes, preservation, REST, unavailable and total slots;
REST/unavailable counts include preserved slots and are not additive with preservation.

Tests cover R1-R10 in weeklyRegeneration, weeklySave and weeklyAuthorityBinding tests,
including real Planner/Builder/calendar receipt admission and no-write save-route seams.
Controlled restrictions are fixtures, not a claim about production box_technique failure.

Validation: 307 affected-layer tests passed before the final edge-case additions;
final complete suite: 1387/1387. TypeScript and git diff --check passed.
Global ESLint remains at the baseline 739 errors / 105 warnings. Every modified
file retains its baseline error/warning count; new files and changed tests have zero.
No migration, amended history or push.
