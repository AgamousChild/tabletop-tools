# D11 — Local media models: ASR and OCR for the media pipelines

> **Decision.** Which local ASR (speech-to-text) and OCR/vision models upgrade
> the physics and study build pipelines — and when *not* to replace what
> already works.
>
> **Status:** drafted 2026-07-06 (loop iteration 5). Grounded today in
> `apps/physics/client/scripts/build-chunks.mjs` and
> `apps/study/client/scripts/ocr-slides.mjs` (both read; both **ahead of
> their CLAUDE.md docs** — drift flagged below).

## Grounded state (with two doc-drift finds)

- **physics** (`build-chunks.mjs`): now does **ffmpeg scene-detection**
  (`select='gt(scene,0.3)'`, 6 s minimum gap, t=0 always included) to find
  slide changes, and parses **Zoom HTML transcripts** (`transcript-list-item`
  aria-labels with speaker + timestamp) or `.txt`. One frame per detected
  slide; transcript cues aggregated per slide window. *Its CLAUDE.md still
  describes fixed ~30 s chunks + `.vtt`/`.srt` — stale.*
- **study** (`ocr-slides.mjs`): **OCR already exists** — tesseract.js, English,
  **PSM SPARSE_TEXT** (deliberately chosen to catch callout boxes/labels),
  skip-marker `[ocr]` for cheap re-runs, appends OCR text into each slide's
  searchable `body`. *Not mentioned in study's CLAUDE.md — drift.*
- Gaps that remain, in order of user-visible impact:
  1. physics: videos with **no transcript at all** are silent (no search text);
     `.txt` transcripts carry **approximated timestamps**.
  2. physics: slide *frames* full of equations/diagrams contribute **zero**
     searchable text (transcript-only indexing).
  3. study: tesseract quality on dense/mathy slides is unmeasured — adequate
     or not, nobody has a number.

**Rubric weights:** Quality ×3 · Effort ×3 · Fit ×2 · Stack ×2 · Latency ×1
(build-time batch) · Risk ×1.

## Part 1 — ASR (physics)

### A1 — faster-whisper (CTranslate2), large-v3 (primary candidate)

*(est.)* Best accuracy-per-effort in the open ASR world; **word-level
timestamps** (exactly what slide-window alignment needs); int8 on the 4060
runs ~10–20× realtime — an hour-long lecture transcribes in minutes; ~3 GB
VRAM → passes the D09 guard even in many contended states. Python, wrapped as
a CLI the Node build script shells to (same pattern as its ffmpeg use).

- **Score:** Quality 5 · Effort 4 · Fit 5 · Stack 3 · Latency 5 · Risk 4 → strong primary.

### A2 — whisper.cpp

Same Whisper weights, C++/GGML, no Python; CPU-viable (slower), CUDA build
available. The dependency-minimal fallback if the Python toolchain annoys.

- **Score:** Quality 4 · Effort 3 · Fit 5 · Stack 4 · Latency 3 · Risk 4.

### A3 — NVIDIA Parakeet / Canary (NeMo)

*(est.)* Leaderboard-topping English WER, very fast — but the NeMo dependency
stack is heavy for a personal pipeline, and timestamps/tooling are less
turnkey than Whisper's ecosystem.

- **Score:** Quality 5 · Effort 2 · Fit 4 · Stack 2 · Latency 5 · Risk 3.

### A4 — Status quo (Zoom transcripts only)

Free, speaker-labeled, already parsed. But gap 1 stands: no-transcript videos
stay invisible, `.txt` timestamps stay approximate.

### ASR wargame

- **Zoom-vs-Whisper is not either/or.** Zoom HTML transcripts carry *speaker
  labels* (Whisper alone doesn't) and cost nothing. The right shape:
  **keep Zoom parse as the primary source when present; Whisper fills the
  gaps** — (a) no-transcript videos get full ASR; (b) `.txt`-only meetings get
  re-timed by aligning Whisper's word timestamps (keep Zoom's text, take
  Whisper's clock, or simply prefer Whisper's transcript for those).
- **Model size:** large-v3 is the quality pick for physics jargon; if VRAM is
  contended, `distil-large-v3` or `medium` degrade gracefully — make it a
  config knob, default large-v3, and let the D09 guard pick.

## Part 2 — OCR / frame text (study + physics frames)

### O1 — tesseract.js sparse-text (incumbent — study)

**Working, integrated, skip-friendly.** Weakness *(est.)*: dense layouts,
low-contrast themes, and **mathematical notation** (Tesseract has no real
equation story).

### O2 — PaddleOCR

*(est.)* Meaningfully better text detection+recognition on hard layouts;
Python dependency; drop-in for the same append-to-body pattern.

### O3 — TrOCR / donut-class transformers

Per-region transformer OCR — needs a detector stage, heavier, mainly wins on
handwriting/stylized text we don't have. Skip.

### O4 — Small local VLM captioning (Florence-2 / Qwen2-VL-2B / moondream2)

Not OCR — **description**. For physics *frames* (equations, circuit diagrams,
graphs), a VLM emits "slide showing RC circuit discharge curve, τ = RC…" —
text that makes the frame *findable*, which literal OCR of `τ=RC` fragments
doesn't achieve. Runs on the 4060 in the D09 batch window. This attacks
gap 2, which no OCR rung can.

### OCR wargame

- **Don't replace working OCR on vibes.** O1 is in place with a sane design.
  The move is a **measurement gate**: sample ~30 slides across decks, count
  OCR junk/miss rate. Escalate to O2 only if the number is bad *and* the
  misses are search-relevant (a missed decorative label costs nothing).
- **physics frames are a different problem wearing the same hat.** Literal OCR
  of equation pixels produces token soup; **O4 captioning is the actual
  upgrade** there — and it feeds D04's semantic embeddings, where a prose
  description embeds far better than OCR fragments. One overnight batch pass,
  same D09 runner, cache per frame-hash (`[ocr]`-marker pattern reused as
  `[vlm]`).

## Recommendation

1. **ASR:** adopt **A1 faster-whisper large-v3** as a `transcribe(dir)`
   function + CLI (Rule 4), invoked by `build-chunks.mjs` for no-transcript
   and `.txt`-only meetings; Zoom HTML remains primary when present. A2 is
   the named fallback if the Python toolchain misbehaves.
2. **study OCR:** **keep O1**; run the 30-slide measurement before touching
   anything; O2 is the escalation, gated on that number.
3. **physics frames:** **O4 VLM captioning pass** (Florence-2 or
   Qwen2-VL-2B — pick after a 10-frame bake-off on real slides), appended to
   slide text with a `[vlm]` marker, overnight batch, D09 runner + guard.
4. **Order of operations:** D11 text improvements land **before** D04's
   embedding pass over physics/study — embed once over the improved text, not
   twice.
5. **Doc-drift fixes:** update physics + study CLAUDE.md to match their
   scripts (scene-detect pipeline; OCR pass exists) — both playbooks inherit
   this task.

**Flip triggers:** Whisper hallucination on silence/music sections shows up in
physics indexes → enable VAD filtering (faster-whisper flag) before blaming
the model; OCR measurement ≥ ~15 % search-relevant miss rate *(threshold to
confirm at measurement time)* → O2; VLM captions prove low-value on eval →
drop the pass rather than tune it forever (stop when it works — and stop when
it doesn't).

## Implementation notes

- Wrap all three as importable functions in the apps' `scripts/` with CLI
  entry (matching `findTool`/marker patterns already there); all runs go
  through the D09 batch runner for logs + VRAM guard.
- game-tracker's parked photo-OCR surface inherits whichever OCR/VLM rung
  wins here — no separate decision needed unless it activates.
- Whisper model files (~1.5–3 GB) live outside the repo (`.local/models/`),
  pinned by name+revision in config (D03's pinning rule).
