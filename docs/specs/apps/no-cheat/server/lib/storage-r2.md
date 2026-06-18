# apps/no-cheat/server/src/lib/storage/r2.ts

> R2 storage for evidence photos — similar to game-tracker but with different interface.

## Prompt

Define `R2Storage` interface: `upload(key: string, data: ArrayBuffer, contentType: string): Promise<string>`. Returns the public URL.

**`createR2Storage(bucket, publicUrl)`** — Real R2 implementation. Calls `bucket.put(key, data, { httpMetadata: { contentType } })`. Returns `${publicUrl}/${key}`.

**`createNullR2Storage()`** — Dev/test no-op. Logs a warning and returns a `null://discarded/{key}` URL.

### Difference from game-tracker's R2Storage

No-cheat's `upload` takes `(key, data: ArrayBuffer, contentType: string)` — the caller provides raw bytes and content type. Game-tracker's takes `(key, dataUrl: string)` and decodes base64 internally. Different because no-cheat's `savePhoto` endpoint decodes base64 to Buffer before calling storage.

## Dependencies

None.
