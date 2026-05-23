# apps/gateway/functions/**/[[path]].ts

> Cloudflare Pages Functions — service binding proxies for all app Workers.

## Prompt

Nine nearly identical proxy functions, one per app. Each is a Cloudflare Pages Function that strips the app prefix from the URL path and forwards the request to the bound Worker via service binding.

### Pattern (all 9 follow this exactly)

```typescript
interface Env {
  {BINDING_NAME}: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/PREFIX/, '')
  try {
    return await context.env.{BINDING_NAME}.fetch(
      new Request(url.toString(), context.request),
    )
  } catch {
    return new Response(
      JSON.stringify({ error: { message: 'Service unavailable' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
```

### Instances

| File | Binding | Path prefix stripped |
|---|---|---|
| `functions/no-cheat/trpc/[[path]].ts` | `NO_CHEAT_API` | `/no-cheat` |
| `functions/versus/trpc/[[path]].ts` | `VERSUS_API` | `/versus` |
| `functions/list-builder/trpc/[[path]].ts` | `LIST_BUILDER_API` | `/list-builder` |
| `functions/game-tracker/trpc/[[path]].ts` | `GAME_TRACKER_API` | `/game-tracker` |
| `functions/tournament/trpc/[[path]].ts` | `TOURNAMENT_API` | `/tournament` |
| `functions/new-meta/trpc/[[path]].ts` | `NEW_META_API` | `/new-meta` |
| `functions/admin/trpc/[[path]].ts` | `ADMIN_API` | `/admin` |
| `functions/brain/api/[[path]].ts` | `BRAIN_API` | `/brain/api` |
| `functions/data-import/api/[[path]].ts` | `DATA_IMPORT_API` | `/data-import/api` |

Note: brain and data-import use `/api` subpath (not `/trpc`) because they're Hono apps, not tRPC.

### Error handling

All proxies catch Worker failures and return structured JSON: `{ error: { message: 'Service unavailable' } }` with HTTP 503. This ensures tRPC clients get parseable error responses even when a Worker is down.

## Contracts

- `[[path]]` catch-all matches any subpath under the function directory
- `PagesFunction<Env>` type from Cloudflare Pages
- `Fetcher` type is a Cloudflare service binding interface
- Request is reconstructed with the modified URL but same method/headers/body
- No auth logic — auth is handled by each Worker's own middleware
