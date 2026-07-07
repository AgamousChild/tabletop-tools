# Playbook — study: OCR adequacy gate + semantic slide search

> **Deliverable.** Measure (not assume) the existing OCR, add build-time
> semantic search, share the physics embed machinery — per D11/D04/D05.
>
> **Status:** drafted 2026-07-06 (loop iteration 8). Grounded:
> `client/scripts/ocr-slides.mjs` (read this session — **CLAUDE.md is silent
> about it**: an OCR pass already ships, tesseract.js PSM SPARSE_TEXT with
> `[ocr]` skip-markers appending into searchable slide bodies).

## Current state (grounded)

- `build-slides.mjs`: pptx → PDF (LibreOffice) → per-block text+coords
  (`unpdf`) → PNGs → `slides.json`.
- `ocr-slides.mjs`: tesseract.js eng, **sparse-text mode** (deliberate — catches
  callouts/labels), skip-friendly `[ocr]` marker, `OCR_FORCE=1` override,
  progress/fail counters. **This is a working, well-designed OCR lane.**
- SPA: minisearch keyword search; highlight boxes from block coords.
- Gap: OCR quality is **unmeasured**; search is keyword-only.

## Implementation plan

### Phase A — OCR adequacy measurement (D11's gate — before touching anything)

1. Sample ~30 slides stratified across decks (text-heavy, diagram-heavy,
   dark-background); hand-count OCR misses **that a search would care about**
   (missed heading ≠ missed decoration).
2. Record the number in D11. **< ~15 % search-relevant miss rate → keep
   tesseract, close the question.** Worse → escalate to PaddleOCR (D11-O2)
   for the failing slide classes only, same marker pattern.
3. **Proof:** the number exists; escalation decision cites it.

### Phase B — Semantic search (shared with physics)

1. Extract the physics Phase-C embed helper into a shared script util (one
   bge-base ONNX embedder, two consumers — Rule 3): embed slide bodies
   (incl. OCR text) → `embeddings.bin` aligned to `slides.json`.
2. Same SPA hybrid pattern as physics: minisearch instant, worker-thread
   semantic re-rank on demand.
3. **Proof:** paraphrase query ("memory decay over time" style) finds a slide
   keyword search misses; first paint unchanged.

### Phase C — Optional VLM captions (only if A says text-poor slides matter)

Psych decks are text-forward *(expectation — the Phase A sample verifies)*;
if diagram-only slides turn out to matter for search, reuse the physics
`[vlm]` caption pass verbatim. Default: **skip** (stop when it works).

### Phase D — Hygiene

Update study CLAUDE.md: document the OCR pass (exists today, undocumented) +
new embed step; keep the skip-marker convention noted for future passes.

## Verification checklist

- [ ] A: miss-rate number recorded in D11; keep/escalate decision cited.
- [ ] B: shared embedder util used by both apps (grep); paraphrase demo.
- [ ] C: explicitly skipped or justified by A's data.
- [ ] D: CLAUDE.md documents reality.

## Risks / notes

- LibreOffice + OneDrive placeholders: same pre-flight materialization check
  as physics.
- Re-OCR cost is already solved (`[ocr]` markers) — any OCR upgrade must keep
  the marker contract so reruns stay cheap.
- Personal app; no server; done means "Micah finds slides faster."
