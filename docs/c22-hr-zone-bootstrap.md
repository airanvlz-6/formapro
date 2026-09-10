# C2.2 HR bootstrap

This is estimated training guidance, not LT1/LT2 or a laboratory threshold.
`hrr_5_zone_v1` (version 1), in `lib/sports/hrrZonePolicy.ts`, defines product
constants 50%, 60%, 70%, 80%, 90%, 100% of heart-rate reserve. No existing
canonical zone boundaries were found in the repository or local history.
These constants are replaceable only through a new policy version.

HRR = HRmax - restingHR. Each boundary is Math.round(restingHR + fraction * HRR).
Z1–Z4 include their lower boundary and stop one bpm before the next boundary;
Z5 includes the final boundary. Values must be finite, restingHR positive and
below HRmax, HRmax at most 250 bpm (product input guard), with nonempty ordered
integer zones. This is not input validation for a measured physiological test.

Confirmed systems are stored in usuarios.perfil.hrZoneBootstrap. An HMAC proposal
binds user, exact zones, input values/sources, proposal digest, previous stored
state and expiry. Confirmation rereads canonical inputs and conditionally writes
the profile. A changed input or conflicting reference makes an HRR system
non-executable; it is never silently recalculated and confirmed. Replay after a
successful confirmation or explicit RPE choice fails the previous-state digest.
The dedicated action shares the existing chat identity boundary.

Complete contiguous legacy Z1–Z5 declarations are admitted independently of HRR.
Their original source paths are retained; generatedAt/confirmedAt are null where
legacy storage has no dates. They are DECLARED, never MEASURED. Partial,
overlapping or gapped sets are not a supported system. Manual entry is reviewed
and explicitly confirmed. No Garmin provenance is inferred.

The compatibility policy running_base_zone2_compatibility/v1 selects Z2 as a
training range for running_base only. Precedence: easyHr, confirmed declared
system, confirmed HRR system, easyPace, RPE 2–3. All HR choices still require
measurement capability. The distinct metric confirmedBaseZone is not easyHr or
thresholdHr. Targets retain zone system, source zone, compatibility policy,
range and estimated provenance. Other methods, Goal/Strategy and B.3 are unchanged.

The UI asks optional HR inputs only with a monitor, explains RPE, displays exact
server-produced proposals, and offers confirm/manual entry/RPE. No client or
LLM calculations are authoritative. The existing renderer supplies the HR range
and secondary RPE guide. Input edits require reopening the review; there is no
automatic background confirmation or device import.
