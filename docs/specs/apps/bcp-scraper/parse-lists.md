# apps/bcp-scraper/server/src/lib/parse-lists.ts

> Batch army list parser — processes pending list text into structured TTT format.

## Prompt

Export `parsePendingLists(db: Db): Promise<{ parsed, partial, failed, skipped }>`.

Query `meta_event_players` rows that have `list_text` but no `list_ttt`, joined to events dated after 2026-01-01, limited to 100 per run (Worker time budget). For each row, call `parseList(text)` from the list-parser module, JSON-stringify the result, and UPDATE `list_ttt`. Count results by parseStatus: `ok` → parsed, `partial` → partial, `failed` → failed. Empty/blank texts → skipped.

## Dependencies

- `drizzle-orm` — `sql`
- `@tabletop-tools/db` — `Db`
- `./list-parser` — `parseList`
