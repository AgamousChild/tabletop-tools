# CLAUDE.md — physics

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

Personal-use video-search interface. Takes a folder of Zoom-recorded `.mp4` lectures + their
transcripts, chunks the transcripts into ~30-second windows, extracts one frame per chunk via
ffmpeg, and serves a search SPA at `/physics/` where the user types a query and sees matching
moments with the captured frame + transcript text.

Not auth-gated. Same shape as `apps/study/` (slide search) but for video.

---

## Architecture

Static SPA, no server, no Turso, no Vectorize, no R2. All data lives as static assets in the
SPA's `dist/`: `data/chunks.json` + `data/chunks/<meeting>/<startSec>.jpg`.

---

## Build pipeline

`apps/physics/client/scripts/build-chunks.mjs` runs locally. Needs `ffmpeg` + `ffprobe` on
PATH (Chocolatey: `choco install ffmpeg`).

1. Walk `$PHYSICS_SRC_DIR` (default `C:/Users/micah/OneDrive/Documents/Physics`) for `.mp4`s
2. For each `.mp4`, look for a sibling transcript by basename: `meeting-1.vtt` / `.srt` / `.txt`
3. Parse the transcript:
   - `.vtt` / `.srt` → native timestamps
   - `.txt` → approximate cues by spreading sentences across the video's `ffprobe` duration
     uniformly by word count
4. Aggregate cues into ~30-second chunks (constant `CHUNK_SECONDS` in the script)
5. For each chunk, `ffmpeg -ss <midpoint> -i <mp4> -frames:v 1 -vf scale=960:-1 <out>.jpg`
6. Emit `chunks.json` + `chunks/<meetingId>/<startSec>.jpg`

Run with `pnpm chunks:build`. Re-run whenever videos or transcripts change.

---

## SPA

Vite + React + minisearch. Same plain-CSS style as `apps/study/`. Three components:

- `SearchBar` — typed query
- `ResultsList` — top hits grouped by chunk, shows `<meeting> · HH:MM:SS–HH:MM:SS`
- `ChunkViewer` — full frame + the chunk's transcript text

`base: '/physics/'` so all asset URLs resolve correctly on the gateway origin.

---

## Deploy

```bash
cd apps/physics/client && pnpm chunks:build       # only when sources change
bash apps/gateway/build.sh                         # builds + validates all 11 apps
bash scripts/deploy-gateway.sh                     # full deploy
```

Live at `https://tabletop-tools.net/physics/`.

---

## No tests

Single-screen personal-use app. Mirrors `apps/study/` exactly in shape — if a regression
needs fixing in both, fix `study` first then apply the same change here.
