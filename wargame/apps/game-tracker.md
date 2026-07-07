# Playbook — game-tracker: deliberately parked (with the unpark conditions)

> **Deliverable.** A recorded no-build decision with explicit unpark
> conditions — so the question is settled, not forgotten.
>
> **Status:** drafted 2026-07-06 (loop iteration 10). Grounded: game-tracker
> CLAUDE.md (screen flow, matchV2/mission/turn routers, R2 photo storage).

## Current state (grounded)

Live match companion: setup → mission → pre-game → per-round VP/CP/units
tracking → summary; photos to R2; results feed list-builder ratings. Every
input is a button press or number — **there is no language surface in the
hot path**, and mid-game latency tolerance is near zero.

## Wargamed conclusion: no model now

- **Round tracking / scoring:** deterministic button flows; an LLM adds
  failure modes to a phone-at-the-table UX. Same class of rejection as
  tournament pairings.
- **Rules questions mid-game:** legitimate need — but it's **brain's** job
  (Rule 1: one knowledge surface). The right feature is a brain Ask link/
  panel inside game-tracker, reusing brain's provider routing — zero new
  model surface in this app. That's a UI ticket, not an AI decision.
- **Score-sheet / battlefield photo → structured data (the latent surface):**
  real potential (photos already flow to R2), but no user demand signal yet,
  and paper score sheets are exactly what the app replaces. Building vision
  ingestion for artifacts the app's adoption eliminates is backwards.

## Unpark conditions (any one of these reopens the decision)

1. Micah (or users) actually photograph paper score sheets and want them
   ingested — then: D11's OCR/VLM rung, on-capture, client-side or T1,
   feeding the existing matchV2 rounds schema; acceptance mirrors no-cheat's
   gates (structured extraction accuracy + explicit review UI).
2. Voice input at the table becomes wanted ("Claude, round 2, 12 primary") —
   then: local ASR (D11 Whisper family, small model) → intent schema (D08)
   → the same tRPC mutations the buttons call. On-device or LAN-local only;
   a match must not depend on internet.
3. The brain-panel ticket lands and mid-game usage shows question types the
   retrieval misses — that's brain-playbook eval feedback, tracked there.

## Verification (of the parking itself)

- [ ] Brain-panel link ticket filed/triaged (the one real feature hiding here).
- [ ] This doc linked from the README register so the parked state is visible.

## Notes

Parking with conditions honors "no features that aren't needed yet" without
losing the analysis — the next person asking "should game-tracker get AI?"
reads this, checks the three conditions, and either stops or knows exactly
what to build.
