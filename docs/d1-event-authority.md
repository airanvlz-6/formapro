# D1 event authority

This implements temporal product authority, not periodization or dose progression.
The goal remains an independent adaptation/performance declaration.

## Contract and persistence

`usuarios.perfil.targetEvent` holds `{event, signature}`. Event v1 contains eventId,
goalId, discipline, eventType (race/competition/test/other), civil eventDate,
priority (primary/secondary), optional declared targetPerformance, status
(active/completed/cancelled), structured-form provenance, confirmation, createdAt,
confirmedAt, revision and content digest. D1 writes one primary active event;
without-date cancels an existing confirmed event. Legacy fields are preserved.

The event goal catalog wires half_marathon/10k to carrera, CrossFit/Open to box,
max_strength testing to fuerza and Hyrox to explicit hyrox ownership. It does not
infer ownership of a mixed Hyrox event from box/carrera alone. Unsupported 5K or
marathon goal families are not introduced by D1. Future domains extend adapters.

## Trust

The dedicated `target_event` action reads persisted goal and scope, issues an
expiring form challenge bound to athlete and exact profile/goal/sources snapshot,
then accepts a date through explicit form submission. That submission is the
declaration and confirmation; no second confirmation screen is needed. No LLM
extraction is involved. The server determines identity, discipline, timestamps,
revision and signature. Creation drops targetEvent; generic profile updates
preserve it from the server. The signed event binds the athlete and all facts.
Digests and signatures normalize object key ordering, including JSONB round trips.
The action inherits the existing chat identity boundary; this is not an auth redesign.

Dates at usuarios.objetivo_principal.fecha, perfil.objetivo_principal.fecha,
perfil.competicion, proxima_carrera and carrera_objetivo are inspected as candidates.
objetivo_detalle and prioridad are not parsed for dates or promoted to authority.
All audited historical writers are mixed/free-text or lack a trusted date
attestation: no historical record is auto-confirmed merely because its date is
valid or contains a self-asserted source/confirmed flag. Explicit exact candidates
are reusable in the form; confirmation records their source paths. Conflicting
dates request review and do not invalidate the goal. Canonical signed D1 records
are reusable without reconfirmation. Raw legacy values are never destroyed.

## Horizon and scope

`civilDay` validates exact YYYY-MM-DD by UTC round trip. Days remaining is the
difference of civil day numbers; weeks remaining is days/7 (fractional, not rounded
or a count of calendar weeks). 2026-09-10 to 2026-11-15 is 66 days, 66/7 weeks.
Server current civil date uses Atlantic/Canary, consistent with the product.
Dates themselves have no timezone. A new active event must be strictly future.
An existing event on/past today has an explicit diagnostic and null remaining
horizon; D1 does not automatically complete it or prescribe a race week.

EVENT_PREPARATION requires a valid signed primary active future event, matching
current goal and a discipline managed by Forge. Supervision never gains planning;
Focus external events remain context; Coach retains its existing managed scope.
Other states use GENERAL_DEVELOPMENT with explicit validity diagnostics. Event
context can still carry a positive horizon without granting managed authority.

## Integration and invalidation

Canonical weekly strategy receives eventAuthority without altering adaptation,
method, volume, intensity or block decisions. The authority includes date, mode,
event, horizon, asOfDate and scope/goal digests. It is included in the existing
signed weekly contract and freshness reconstruction. Changing date, cancelling,
changing goal or scope changes/revokes the derived authority. Each date update
creates a new revision and digest. Concurrent/stale form writes fail snapshot
checks; updates reread the result. Later D3 must rebuild from these facts.

Analyzer receives server facts and only retains its existing advisory fields;
its objective text is bounded by deterministic temporal copy. It cannot provide
date, identity, mode or horizon. Its accepted strategyProposal still only orders
existing adaptations. Web/mobile conversational prompts receive server event
context, or a no-authority instruction on read failure; legacy date arithmetic
and the instruction to trigger taper from a date were removed. Free-form LLM
language remains instruction-bound, not a formal proof of every sentence.

## Limits

One primary event, no race calendar or multi-event prioritization. No year
inference from prose. No phase lengths, taper, race-week templates, post-event
transition, peak model or dose progression. Profile UI offers later review;
onboarding can continue without a date or dismiss the optional form. No database
migration is needed. Tests exercise pure authority, explicit actions and shared
planning integration; no browser visual test is claimed.
