# Chat: coaching, factual verification and mutation authority

Production demonstrated that structured Generation and answer parsing work. The
remaining rejection was CHAT_PROSE_UNGROUNDED after review, followed by an entire
second Generation. This change does not revert or alter the Generation transport.

## Review contract and outcome

Review retains its separate Structured Output schema. unsupportedClaims now contains
{quote, kind}, where kind is one of unsupported_fact, interpretation, recommendation,
metadata. quote is a literal span of the candidate answer; no review output is logged.
The prompt explicitly accepts the current human report as evidence without requiring
prior canonical storage. The reviewer verifies factual assertions, not sports quality
or agreement with the plan. Proposals and interpretations need not be canonical facts.

- Verified review: keep the answer and existing authority checks.
- Interpretation/recommendation objection: keep answer unchanged; no regeneration.
- Metadata objection: keep answer but disable extraction learning and automatic actions.
- Exact unsupported factual spans: remove only those spans, with a neutral visible
  omission marker; preserve the rest of the Coach response. Disable extraction learning
  and automatic actions from that answer. Merge overlapping spans and replace all
  occurrences without asking an LLM to regenerate coaching.
- Failed/malformed/unclassified review or unmatched factual quote: preserve the answer
  as an explicitly unverified quoted proposal, not as confirmed data; disable extraction
  learning and automatic actions. No second Generation.

The last case includes legacy string-category reviews. They cannot identify precise
factual spans and are not silently interpreted as approval. Quoted unverified text can
still contain incorrect claims; it is not promoted to verified knowledge. Exact-span
removal depends on correct reviewer classification, which remains model-based.

Metadata mismatch alone remains nonterminal, as before. No unverifiable metadata is
admitted to the FACT store. History remains conversation, including assistant output;
the existing separation prevents assistant text becoming human evidence. Redacted
factual spans are absent from the answer saved to history.

## Repair and latency

The maximum two Generation attempts remain for unusable transport/JSON/answer. Review
is attempted once after the first usable answer, and its refusal, parse error or outage
does not regenerate that answer. HTTP Generation failures retain their prior behavior.
No model, provider timeout, token budget or six-message window changes.

## Mutations and conflicts

runChatCoach prevents actions when factual review leaves claims removed or unverified.
The user receives the existing unconfirmed-change notice; useful coaching survives.
For availability conflicts, or explicit restriction signals from existing admission
or action review, actions return confirmation_required before any plan write. The user
is told of the conflict and asked to confirm the requested change.

No automatic replay or authorization token is created. A subsequent confirmation
requires a fresh decision and the existing authorization checks; a bare “yes” does not
override a canonical restriction, ownership, identity, receipt, freshness or CAS. This
change does not implement a restriction-resolution workflow or automatic override.
If canonical context still prohibits the change, it remains unapplied. No DB schema
or pending-action persistence is introduced.

Restriction classification reuses only existing EXPLICIT_DISCIPLINE_RESTRICTED and
MOVEMENT_RESTRICTED signals. Mixed technical failures remain rejected. Unknown movement
alone remains accepted by existing authority; no new sports catalogue or policy engine
is introduced. Transactional admission, receipts, freshness checks and CAS are unchanged.

## Observability

Existing events remain. Review has closed nonterminal codes CHAT_REVIEW_COACHING_ONLY,
CHAT_REVIEW_FACTS_REMOVED, CHAT_REVIEW_UNVERIFIED. Provider/parse failures remain visible.
review.admit may be rejected while answer.return succeeds; that is intentional.
CHAT_COACHING_PIPELINE can report coachingResponseProduced=true with actions failures
and fallbackReason=null. No claims, prompts, answers, histories, profiles or secrets
are added to logs. Diagnostics ON/OFF remains observational.

## Remaining terminal conditions

Unusable Generation after allowed repair and existing Generation transport failures
can still cause fallback. Unexpected programming exceptions outside contained optional
operations also retain existing outer-catch behavior. Review and sports disagreement
are no longer intentional answer vetoes.

## Validation coverage

Tests cover current subjective evidence, metadata mismatch, noncanonical recommendations,
literal HRV claim removal, no learning/actions from unsupported claims, availability and
restriction confirmation, unknown movements, rejected/failed mutations, single Generation
on review rejection/outage/invalid JSON, malformed Generation repair, and the Production
incident shape with nonempty longitudinal history. Diagnostics tests compare results,
exceptions, provider requests and DB effects ON/OFF. Grounding and the Generation schema
were compared against HEAD; the HTTP adapter and Weekly/Session/shared authorities remain
unchanged. No real provider or Production reproduction is part of this local validation.

Local validation on 2026-09-21: focused Chat/Coach/diagnostics 129/129 PASS; complete
suite 2642/2642 PASS, zero failed or skipped; TypeScript --noEmit and git diff --check
PASS. Diagnostics ON/OFF and broken sinks preserve outputs/exceptions/DB effects.
Source comparisons also confirm identity/ownership/target and refresh/integrity/CAS
commit blocks are unchanged. No content logging was introduced. No commit/push/deploy.
