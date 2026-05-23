# apps/game-tracker/server/src/lib/storage/r2.ts

> R2 photo storage abstraction — real R2 for production, null implementation for dev/test.

## Prompt

Define an `R2Storage` interface with one method: `upload(key: string, dataUrl: string): Promise<string | null>`. Returns the public URL of the stored photo, or null if storage isn't configured.

### Implementations

**`createR2Storage(bucket, publicUrl): R2Storage`** — Takes a Workers R2 bucket binding (typed inline as `{ put(key, value, options?) }`) and a public URL prefix. The `upload` method:
1. Strip the data URL prefix (`data:image/jpeg;base64,`)
2. Decode base64 to binary via `atob`
3. Convert to `Uint8Array` → `ArrayBuffer`
4. Call `bucket.put(key, buffer, { httpMetadata: { contentType: 'image/jpeg' } })`
5. Return `${publicUrl}/${key}`

**`createNullR2Storage(): R2Storage`** — No-op implementation. `upload` returns `null`. Used in dev and tests where R2 isn't available.

### Design decision

The bucket type is defined inline rather than importing `R2Bucket` from `@cloudflare/workers-types`. This avoids pulling Cloudflare type dependencies into client builds that import from the server's router types.

## Dependencies

None — pure TypeScript, no external imports.
