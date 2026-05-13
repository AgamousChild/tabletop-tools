# TTT List Parser — Design Spec

## Overview

A tool that converts raw army list text (from BCP scraping) into structured TTT package JSON. Runs automatically after the BCP scraper finishes, or manually via the admin dashboard.

This is the bridge between "blob of text in the database" and "structured data you can query and analyze."

---

## What it does

Takes raw list text like this:

```
Wu-Tang it (1990 Points)
Adeptus Mechanicus
Haloscreed Battle Clade
Strike Force (2,000 Points)

CHARACTERS

Belisarius Cawl (210 Points)
  • Warlord
  • 1x Solar Atomiser
  • 1x Mechadendrite hive
```

And produces structured TTT JSON like this:

```json
{
  "version": 1,
  "parsedWith": "gw-app-v1",
  "parseStatus": "ok",
  "meta": {
    "name": "Wu-Tang it",
    "totalPoints": 1990,
    "edition": "10th",
    "battleSize": "Strike Force",
    "source": "bcp-import"
  },
  "list": {
    "factionId": "adeptus-mechanicus",
    "factionName": "Adeptus Mechanicus",
    "detachmentId": "haloscreed-battle-clade",
    "detachmentName": "Haloscreed Battle Clade",
    "units": [
      {
        "name": "Belisarius Cawl",
        "role": "Character",
        "points": 210,
        "models": 1,
        "wargear": ["Solar Atomiser", "Mechadendrite hive"],
        "isWarlord": true
      }
    ]
  }
}
```

---

## Input formats

Based on sampling 2026 BCP list data, two formats exist:

### 1. GW App / New Recruit (majority)

```
List Name (Points)
Faction
Detachment
Battle Size (Points)

CHARACTERS

Unit Name (Points)
  • Warlord
  • 1x Weapon name
  • Enhancement: Name

OTHER DATASHEETS

Unit Name (Points)
  • Nx Model Name
  ◦ Nx Weapon per model
```

Key patterns:
- Line 1: list name + total points in parens
- Lines 2-4: faction, detachment (optional), battle size
- Role headers: `CHARACTERS`, `OTHER DATASHEETS`, `BATTLELINE`
- `•` (bullet) for top-level wargear
- `◦` (hollow bullet) for sub-model wargear
- `Warlord` as standalone bullet
- `Enhancement: Name` as bullet
- `Nx Model Name` for multi-model units
- Points in parens: `(200 Points)` or `(200 points)`
- Footer: `Exported with App Version: ...` (strip this)

### 2. BattleScribe (minority)

```
+++ FACTION KEYWORD: Chaos - Chaos Space Marines
+ DETACHMENT: Pactbound Zealots (Marks of Chaos)
+ TOTAL ARMY POINTS: 2000pts
...
+ Epic Hero +
Abaddon the Despoiler [280pts]
...
+ Character +
Dark Apostle [75pts]: Enhancements - ...
```

Key patterns:
- `+++` header line with faction
- `+ DETACHMENT:` line
- `+ TOTAL ARMY POINTS:` line
- Role sections: `+ Epic Hero +`, `+ Character +`, `+ Battleline +`, `+ Other +`
- Points as `[120pts]` on unit line or sub-entries
- Wargear after colon or on indented lines

### 3. Unrecognizable

Some lists are freeform text, partial, or in unknown formats. These get:
- `parseStatus: "failed"`
- `exports.rawSource` preserves the original text
- No structured data extracted

---

## Output format

TTT package JSON, Layer 1 (Meta) + Layer 2 (List) only. As defined in `docs/superpowers/plans/2026-04-30-ttt-list-format.md`.

Enrichment (Layer 3: Rules) and exports (Layer 7: BattleScribe XML, Yellowscribe) are separate operations, not part of this tool.

---

## Display format

When any TTT app renders a list for the user, it outputs in GW App style. The TTT JSON is internal storage only. Users always see the clean, readable GW format.

---

## Where it runs

A Cloudflare Worker function, triggered:
1. **Automatically** — by the BCP scraper after it finishes writing new events
2. **Manually** — via "Parse Lists" button in admin dashboard
3. **Cron fallback** — Monday 6am UTC (after scraper at 4am, meta pipeline at 5am)

---

## Database

### Input

Raw list text is stored by the scraper. The parser reads rows where `list_ttt IS NULL` and `list_text IS NOT NULL`.

### Output

Writes parsed TTT JSON to `list_ttt` column on the same row.

### New column

```sql
ALTER TABLE meta_event_players ADD COLUMN list_ttt TEXT;
```

Migration required in `packages/db`.

### Deduplication / idempotency

- Only processes rows where `list_ttt IS NULL`
- Re-running is safe — already-parsed rows are skipped
- To re-parse (e.g. after parser improvement), set `list_ttt = NULL` for target rows

---

## Faction normalization

The parser must map faction strings from list text to the `dim_faction` slugs already in the database. The existing `BCP_FACTION_TO_SLUG` mapping in the content-ingestor handles this. Port it to the parser.

Examples:
- "Space Marines" → `space-marines`
- "Black Templars" → `black-templars` (subfaction of space-marines)
- "Adeptus Mechanicus" → `adeptus-mechanicus`
- "T'au Empire" → `tau-empire`

---

## Detachment normalization

Map detachment names to `dim_detachment` slugs. The existing `extract-detachments.ts` logic handles this. Port it to the parser.

---

## Error handling

| Situation | parseStatus | What happens |
|---|---|---|
| Clean parse, all fields extracted | `ok` | Full TTT JSON written |
| Partial parse — missing detachment or some units unclear | `partial` | Best-effort TTT JSON, `parseError` explains what's missing |
| Unrecognizable format | `failed` | Only `exports.rawSource` preserved, no structured data |
| Empty list text | skipped | Row ignored |

---

## Processing

### Batch mode (initial backfill)

Process all existing rows with list text but no TTT JSON:
- Chunks of 500 rows per transaction
- Only 2026 data (filter by event date)
- Log results: parsed / partial / failed / skipped
- Save failed IDs for review

### Incremental mode (weekly after scraper)

Process only newly scraped rows (where `list_ttt IS NULL`).

---

## Porting from existing code

| Existing | New location | Changes |
|---|---|---|
| `extract-detachments.ts` detachment patterns | Parser module | Reuse patterns, port to Worker-compatible code |
| `BCP_FACTION_TO_SLUG` mapping | Parser module | Direct port |
| TTT package schema | `packages/db` or shared types | TypeScript interface from the TTT format doc |

### New code

- **GW App parser** — parse the GW App/New Recruit format into TTT JSON
- **BattleScribe parser** — parse the BattleScribe format into TTT JSON
- **Format detector** — look at first few lines, decide which parser to use
- **Normalizers** — faction and detachment string → slug mapping

---

## Admin dashboard

Add to the existing BCP Scraper page:

- **Parse status** — how many lists parsed vs pending vs failed
- **"Parse Lists" button** — triggers the parser manually
- **Breakdown** — count by parseStatus (ok / partial / failed)
- **Recent failures** — show last N failed parses with the raw text for debugging

---

## Pipeline order

```
Monday 4am  →  BCP Scraper (new events, pairings, raw list text)
Monday 5am  →  Meta Pipeline (3NF import, cube rebuild)
Monday 6am  →  TTT List Parser (raw text → structured TTT JSON)
```

Scraper triggers meta pipeline. Meta pipeline triggers parser. Each can also be triggered independently via admin.

---

## Testing

- Unit tests for GW App parser with real 2026 list samples
- Unit tests for BattleScribe parser with real samples
- Unit tests for format detector
- Unit tests for faction/detachment normalization
- Edge cases: missing detachment, missing battle size, multi-faction, freeform text
- Integration test: raw text in → TTT JSON out → renders correctly in GW display format

---

## What Micah provides

Nothing. This runs on existing scraped data.
