# New-Meta List Viewer (#44)

## Goal

Display army lists as structured, readable data instead of raw text walls.

## Depends on

- #45 (TTT standard format) — need the parser and schema first

## Plan

### Step 1: Build parsers (part of #45)

Parse BattleScribe and New Recruit text → TTT format JSON.

### Step 2: Parse existing lists

Run parser across all 30,000 army lists in meta_event_players. Store TTT JSON in `list_ttt` column. Track parse success rate — expect ~70-80% (some freeform lists won't parse).

Batch script requirements (from #45):
- Process in chunks of 500 rows per transaction
- Idempotent: `WHERE list_ttt IS NULL`
- Log failed IDs to `.local/meta/parse-errors.json`
- Report: parsed / partial / failed / skipped counts
- Re-runnable after parser updates (target by `parsedWith` version)

### Step 3: Structured list display component

`ListViewer` component that renders TTT format:

```
┌────────────────────────────────────┐
│ Blood Angels — Sons of Sanguinius  │
│ Strike Force — 1,995 pts           │
├────────────────────────────────────┤
│ CHARACTERS                         │
│  ▸ Lemartes (120pts)              │
│  ▸ The Sanguinor (140pts) ★       │
│  ▸ Chaplain w/ Jump Pack (75pts)  │
│    · Inferno Pistol               │
├────────────────────────────────────┤
│ BATTLELINE                         │
│  ▸ 10x Assault Intercessors       │
│    (180pts)                        │
│    · Thunder hammer (Sgt)         │
├────────────────────────────────────┤
│ OTHER                              │
│  ▸ 5x Sanguinary Guard (150pts)  │
│  ▸ ...                            │
└────────────────────────────────────┘
```

Collapsible sections by role. Unit names link to brain unit cards.

### Step 4: Fallback

Lists that don't parse stay as raw text in a `<pre>` block (current behavior). Show badges:
- **Parsed** (green) — `parseStatus: 'ok'`
- **Partial** (amber) — `parseStatus: 'partial'` — show structured part + raw text for unparsed sections
- **Raw** (gray) — `parseStatus: 'failed'` or no `list_ttt`

## Estimated effort

Step 2: 1 hour (batch processing script)
Step 3: 2 hours (component + styling)
Step 4: 30 min

## Blocked by

- #45 (TTT format + parsers)
