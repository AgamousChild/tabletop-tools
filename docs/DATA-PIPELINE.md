# Data Pipeline — Master Database & Automation

## Overview

The platform uses a three-tier data system. No GW (Games Workshop) content is committed to the repository. All game data is loaded at runtime.

```
Tier 1: Source Databases (external, not committed)
  ├── Wahapedia SQLite (scraped from wahapedia.ru)
  └── BSData SQLite (parsed from BSData/wh40k-10e GitHub repo)

Tier 2: Export Layer (JSON files, gitignored)
  └── 19 JSON files in apps/data-import/client/public/wahapedia/

Tier 3: Client IndexedDB (browser, per-user)
  └── 22 object stores in 'tabletop-tools-game-data' database
```

---

## Master Database

The master database (`scripts/.local/master.db`) is a validation artifact that cross-references Wahapedia and BSData. It is not used at runtime — it exists to verify data completeness and ID mapping accuracy.

### Creation

```bash
npx tsx scripts/create-master-db.ts
```

### Schema

**Wahapedia tables** (prefixed `w_`):
- `w_factions` — faction ID + name
- `w_datasheets` — unit reference (name, faction, role, legend status)
- `w_datasheet_models` — stat lines (M/T/Sv/W/Ld/OC/invSv)
- `w_datasheet_wargear` — weapon profiles (range/A/BS_WS/S/AP/D)
- `w_detachments` — detachment names per faction
- `w_detachment_abilities` — detachment rules
- `w_stratagems` — stratagems with CP cost and phase
- `w_enhancements` — enhancements with point cost
- Plus: models cost, keywords, abilities, leader attachments, unit compositions, junction tables

**BSData tables** (prefixed `b_`):
- `b_units` — BSData unit profiles (name, faction, stats, legend)
- `b_weapons` — weapon profiles
- `b_weapon_abilities` — parsed weapon abilities (LETHAL_HITS, SUSTAINED_HITS, etc.)
- `b_abilities` — core and faction abilities

**Cross-reference tables** (prefixed `xref_`):
- `xref_factions` — maps BSData faction names to Wahapedia faction IDs
- `xref_units` — maps BSData unit IDs to Wahapedia datasheet IDs (by normalized name matching)

**Game rules tables**:
- `game_rules` — standard weapon ability catalog (50+ types)
- `unit_rules` — links rules to specific units

### Validation Output

The script prints a validation report showing:
- Table counts
- Foreign key integrity
- Cross-reference coverage (% of BSData units matched to Wahapedia datasheets)
- Per-faction completeness (units, detachments, stratagems, enhancements, weapons, models, costs)

---

## Data Flow: Source → App

### Step 1: Sync Source Data

The sync tools live in a separate repository (`/c/R/sync-data/tools/`):

| Tool | Input | Output | Location |
|------|-------|--------|----------|
| wahapedia-sync | wahapedia.ru | `data.db` (SQLite) | `sync-data/tools/wahapedia-sync/.local/wahapedia/data.db` |
| bsdata-sync | GitHub BSData/wh40k-10e | `data.db` (SQLite) | `sync-data/tools/bsdata-sync/.local/bsdata/data.db` |
| chapter-approved-sync | PDF extraction | markdown files | `sync-data/.local/chapter-approved/markdown/` |

```bash
cd /c/R/sync-data/tools/wahapedia-sync && pnpm start
cd /c/R/sync-data/tools/bsdata-sync && pnpm start
cd /c/R/sync-data/tools/chapter-approved-sync && pnpm start
```

### Step 2: Export Wahapedia → JSON

The export script reads the Wahapedia SQLite database and writes 19 JSON files:

```bash
npx tsx scripts/export-wahapedia.ts [path-to-wahapedia-db]
# Default: C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db
# Output:  apps/data-import/client/public/wahapedia/*.json
```

**JSON files produced** (19 total):

| File | Contents | Records |
|------|----------|---------|
| factions.json | Faction ID + name | ~30 |
| datasheets.json | Unit reference (name, faction, role, legend) | ~800 |
| datasheet_models.json | Stat lines (M/T/Sv/W/Ld/OC/invSv) | ~1200 |
| datasheet_wargear.json | Weapon profiles (range/A/BS_WS/S/AP/D) | ~3500 |
| detachments.json | Detachment names per faction | ~100 |
| detachment_abilities.json | Detachment rules (HTML→Markdown) | ~400 |
| stratagems.json | Stratagems with CP cost and phase | ~600 |
| enhancements.json | Enhancements with point cost | ~200 |
| leader_attachments.json | Leader ↔ unit relationships | ~300 |
| unit_compositions.json | Models-in-unit text | ~800 |
| unit_costs.json | Points costs by model count | ~1500 |
| wargear_options.json | Weapon loadout options | ~800 |
| unit_keywords.json | Faction & keyword tags | ~5000 |
| unit_abilities.json | Core/faction abilities on units | ~3000 |
| abilities.json | Global abilities library | ~50 |
| missions.json | Chapter Approved missions (primary/secondary/deployment/twist/challenger) | ~50 |
| datasheet_stratagems.json | Unit ↔ stratagem junction | ~4000 |
| datasheet_enhancements.json | Unit ↔ enhancement junction | ~1000 |
| datasheet_detachment_abilities.json | Unit ↔ detachment ability junction | ~3000 |

All HTML descriptions are converted to markdown during export (bold, italic, lists, code, tables).

### Step 3: User Imports Data (Browser)

The **data-import app** (`apps/data-import/client/`) is a client-only SPA that loads the JSON files into IndexedDB:

**BSData tab**: User selects factions → app fetches `.cat` XML from GitHub → `parseBSDataXml()` → `saveUnits()` → IndexedDB `units` store.

**Wahapedia tab**: User clicks "Import Wahapedia Data" → app fetches 19 JSON files from `/wahapedia/` → builds ID mapping (Wahapedia datasheet → BSData unit by normalized name) → re-keys all junction tables → saves to 16+ IndexedDB stores.

### Step 4: Consumer Apps Read IndexedDB

Consumer apps (versus, list-builder, game-tracker) use hooks from `packages/game-data-store`:

```typescript
import { usePrimaryFactions, usePrimaryUnitSearch, usePrimaryUnit } from '@tabletop-tools/game-data-store'

// Wahapedia is primary, BSData is fallback
const { data: factions } = usePrimaryFactions()
const { data: units } = usePrimaryUnitSearch({ faction, name })
const { data: unit } = usePrimaryUnit(unitId)
```

---

## IndexedDB Schema (Client-Side)

Database: `tabletop-tools-game-data`, version 7

| Store | Key Path | Indexes | Source |
|-------|----------|---------|--------|
| units | id | faction | BSData |
| lists | id | — | User-created |
| list_units | id | listId | User-created |
| meta | key | — | Import timestamps |
| detachments | id | factionId | Wahapedia |
| detachment_abilities | id | detachmentId, factionId | Wahapedia |
| stratagems | id | factionId, detachmentId | Wahapedia |
| enhancements | id | factionId, detachmentId | Wahapedia |
| leader_attachments | id | leaderId | Wahapedia |
| unit_compositions | id | datasheetId | Wahapedia |
| unit_costs | id | datasheetId | Wahapedia |
| wargear_options | id | datasheetId | Wahapedia |
| unit_keywords | id | datasheetId | Wahapedia |
| unit_abilities | id | datasheetId | Wahapedia |
| missions | id | — | Chapter Approved |
| datasheets | id | factionId, name | Wahapedia |
| datasheet_wargear | id | datasheetId | Wahapedia |
| datasheet_models | id | datasheetId | Wahapedia |
| abilities | id | — | Wahapedia |
| datasheet_stratagems | id | datasheetId, stratagemId | Wahapedia |
| datasheet_enhancements | id | datasheetId, enhancementId | Wahapedia |
| datasheet_detachment_abilities | id | datasheetId | Wahapedia |

---

## ID Mapping Strategy

**Problem**: Wahapedia uses opaque hex IDs. BSData uses readable GUIDs. They don't match.

**Solution** (in `apps/data-import/client/src/lib/wahapedia.ts`):

1. Build fuzzy name-match map: normalize both names (lowercase, strip punctuation) → match
2. For ambiguous matches, prefer same faction
3. Re-key all Wahapedia junction tables (stratagems, enhancements, abilities) from Wahapedia IDs → BSData IDs
4. Datasheets stored with BSData IDs so consumer app queries work seamlessly
5. Factions re-keyed from Wahapedia codes ("SM") → full names ("Space Marines")

---

## Automation Scripts

### Full Pipeline (Local)

```bash
./scripts/setup-data.sh              # Full: sync + export
./scripts/setup-data.sh --export     # Export only (skip sync)
./scripts/setup-data.sh --validate   # Export + create master DB
```

### Publish to GitHub Data Repo

```bash
./scripts/publish-data.sh            # Export + push to data repo
```

This script:
1. Runs the Wahapedia export
2. Copies JSON files to a separate `tabletop-tools-data` repo
3. Commits and pushes

### GitHub Actions (Automated)

See `.github/workflows/update-data.yml` for the CI workflow template. It:
1. Runs on a schedule (weekly) or manual trigger
2. Clones the sync-data repo
3. Runs sync tools to fetch fresh source data
4. Exports to JSON
5. Publishes to the data repo

---

## Key Files

| File | Purpose |
|------|---------|
| `scripts/setup-data.sh` | Orchestrates full data pipeline |
| `scripts/export-wahapedia.ts` | Wahapedia SQLite → 19 JSON files |
| `scripts/create-master-db.ts` | Cross-reference validation DB |
| `scripts/publish-data.sh` | Export + push to data repo |
| `apps/data-import/client/src/lib/wahapedia.ts` | JSON → IndexedDB with ID mapping |
| `apps/data-import/client/src/lib/github.ts` | BSData GitHub API client |
| `packages/game-data-store/src/store.ts` | IndexedDB CRUD operations |
| `packages/game-data-store/src/hooks.ts` | React hooks for consumer apps |
