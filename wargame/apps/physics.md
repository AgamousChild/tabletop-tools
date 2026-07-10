# Playbook — physics: local ASR + semantic search over lecture video

> **Deliverable.** Upgrade the video-search pipeline with local Whisper
> (missing/mis-timed transcripts), VLM frame captions (equation slides), and
> build-time embeddings (semantic search) — all fully local, per D11/D04/D05.
>
> **Status:** drafted 2026-07-06 (loop iteration 8). Grounded:
> `client/scripts/build-chunks.mjs` (read this session — **CLAUDE.md is
> stale**: the script now does ffmpeg scene-detection + Zoom HTML transcript
> parsing, not fixed 30 s chunks / vtt-srt).

## Current state (grounded)

- Build (`build-chunks.mjs`, local, ffmpeg/ffprobe): scene-detect slide
  changes (`gt(scene,0.3)`, ≥6 s gap, t=0 included) → parse Zoom transcript
  (`.txt`, or `.html` `transcript-list-item` aria-labels with speaker+time) →
  aggregate cues per slide window → 1 frame/slide → `chunks.json` + JPGs.
- SPA: minisearch (keyword) over chunk text; no server, static assets.
- Gaps (D11): videos with **no transcript** are unsearchable; `.txt`
  transcripts have approximated timing; equation/diagram **frames contribute
  no text**.

## Implementation plan

### Phase A — Whisper lane (D11-A1)

1. `transcribe(videoPath, opts)` importable + CLI (Rule 4): faster-whisper
   **large-v3**, int8, word timestamps, VAD filter on; model files in
   `.local/models/` (pinned name+revision, D03 rule). Runs under the D09
   guard (~3 GB VRAM need).
2. Source priority in `build-chunks.mjs`: Zoom **HTML** (has speakers) →
   **Whisper** (no transcript, or `.txt`-only meetings — replace approximate
   timing with real word timestamps) → `.txt` as last resort.
3. **Proof:** a no-transcript `.mp4` becomes searchable end-to-end; for one
   `.txt` meeting, spot-check 5 quotes against video timestamps (±2 s).

### Phase B — Frame captions for equation slides (D11-O4)

1. 10-frame bake-off: Florence-2 vs Qwen2-VL-2B on real slide frames (math
   density is the differentiator); pick per results, record in D11.
2. Caption pass appends `[vlm]`-marked text per frame (skip-friendly rerun —
   the `[ocr]` marker pattern from study, reused); overnight batch via D09
   runner.
3. **Proof:** query for a concept that appears *only on a slide* (never
   spoken) returns the right moment.

### Phase C — Semantic search (D04/D05-S4)

1. Build step embeds each chunk's (transcript + caption) text with local
   bge-base ONNX → `embeddings.bin` (Float32Array rows aligned to
   `chunks.json` order).
2. SPA: keyword results render instantly (minisearch, unchanged); a worker
   thread lazily loads `embeddings.bin`, embeds the query
   (transformers.js), brute-force cosine (thousands of rows — ms), re-ranks/
   merges. Hybrid, no server.
3. **Proof:** a paraphrase query ("disorder increasing over time") hits an
   entropy chunk that keyword search misses; first-paint latency unchanged.

### Phase D — Hygiene

Fix physics CLAUDE.md (scene-detect pipeline, transcript sources, new
passes); note the shared embed helper with study (one util, Rule 3).

## Verification checklist

- [ ] A: no-transcript video searchable; timestamp spot-checks pass; VAD on.
- [ ] B: bake-off recorded in D11; slide-only concept findable.
- [ ] C: paraphrase-query demo; `embeddings.bin` row count == chunks.
- [ ] D: CLAUDE.md matches the script.

## Risks / notes

- Whisper hallucination on silence/music → VAD default-on (D11 flip trigger).
- OneDrive source dir (`C:/Users/micah/OneDrive/Documents/Physics`) —
  ensure files are locally materialized before ffmpeg/Whisper runs (OneDrive
  placeholder files stall tools); a pre-flight check in the CLI beats a
  mysterious hang.
- Personal app: stop at "works for Micah" — no auth, no server, no cloud.
