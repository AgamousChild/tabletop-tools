# apps/brain/server/src/types.ts

> Worker environment bindings and manifest types.

## Prompt

`Env` interface: `BRAIN_BUCKET` (R2Bucket), `BRAIN_INDEX` (VectorizeIndex), `AI` (Ai), optional API keys and secrets. `BrainManifest`: version, updatedAt, files (Record of filename→hash for cache invalidation).
