# Build 8 HealthKit admission

Mobile parent: 416b7698607c98f199444207b40a08ee92cfc9d2.
Backend parent: 01311cef2802725525bfee50f56278095db79a1f.

The chat action delegates to lib/physiology/healthKit.ts. HRV/RHR now require
objects with value, unit, exact HealthKit type identifier, ISO startDate and
optional endDate. HRV accepts SDNN in ms only; RHR accepts RestingHeartRate in
count/min or bpm. Both require finite values >0. Unverified legacy numeric
HRV/RHR are still rejected.

Sleep accepts durationMinutes (integer 0..1440), effectiveDate (valid civil
YYYY-MM-DD or timestamp with offset), optional startDate/endDate. If endDate
is supplied, its Madrid date must agree with effectiveDate. Invalid timestamps,
reversed intervals and future samples are rejected independently per signal.
Legacy suenoHoras is converted to rounded minutes and range-checked, with
legacy_sleep_date_assumed_today warning. New Mobile does not use that format.

HRV/RHR effective date derives from startDate in Europe/Madrid, matching existing
daily physiology. Valid historical dates remain historical; no server-today
substitution for the structured contract. Mobile filters samples over 48h old;
backend permits historical dates and never promotes them to the current day.

Every valid signal independently calls writePhysiology with source
 device_measurement and operation observe. Existing columns/RPC suffice:
hrv_ms, resting_hr_bpm, sleep_duration_minutes and their source/ingestion metadata.
Raw sample timestamps are validated to select fecha, not persisted as new columns.
No new SQL. This task does not verify or change the deployed SQL function.

Existing admission policy is unchanged: same signal/date/value => no_op preserving
original metadata; different value => conflict, no silent overwrite even for a newer
sample. Existing compatible legacy physiology mirrors are reconciled; prescription
restingHrReference, profiles and workout execution authorities are never written.

Response: signals.hrv/rhr/sleep each exposes status, retryable, optional effectiveDate
and reason. Null is ignored. Invalid signals are rejected without blocking siblings.
Top-level ok means no invalid/conflicted/retryable signals; sincronizado means at least
one accepted/no_op. Mobile must use per-signal results, not top-level ok, for dedupe.
DB/mirror failures remain retryable; rejected/conflict results are terminal for a
particular payload. Detailed authority results are returned in physiology.

Validation: healthKit.test.mjs covers B1-B12 using a stateful RPC contract fixture
feeding real canonical readiness preparation. No live DB writes or physical E2E.
The broader physiology/readiness suite has five existing failures reproducible
with the original HEAD route in memory: three briefing fixture ReferenceErrors
(resolveCurrentWeekState), one IdentityError ReferenceError, one Today fixture
503 != 200. These unrelated baseline failures are not modified by this patch.

Physical checklist and complete Mobile policy: forge-mobile/docs/healthkit-build8-p0.md.
Test with the existing HealthKit development build + LAN backend. Inspect dated
physiology_records and per-signal [HealthKit sync] logs, replay no_op and conflicts,
partial failure/retry, missing permissions, stale samples, overlapped sleep, and
canonical Today/readiness. No workout should be sent or registered.

No push, deploy, EAS, dependency or permission changes.
