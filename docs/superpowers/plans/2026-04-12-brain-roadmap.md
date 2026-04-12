# 40K Brain — Roadmap & Session Notes

## What Was Built (April 8-12, 2026)

### Session 1: Design & Foundation
- Design spec for knowledge graph (layers, nodes, refs, source attribution)
- `apps/brain/` server + client scaffolded (MADP agents used)
- gw-sync PDF parser rewritten with font-height-based structural extraction
- All 86 PDFs re-parsed with proper heading hierarchy
- Game data converter: Wahapedia/BSData → brain nodes

### Session 2: Data Quality & Combat Knowledge
- HTML stripping, ID deduplication, faction ID normalization (SM → space-marines)
- Cross-layer refs: weapons → core mechanics, stratagems → abilities they grant
- Unit abilities scan all core patterns (sustained hits in unit abilities)
- Combat tier system: toughness/strength/save/invuln/AP cap/wounds/points
- Community knowledge layer (8 nodes: fishing, volume, breakpoints, etc.)
- Deployed to Cloudflare: R2, Vectorize, Workers AI, Worker

### Session 3: Answer Quality
- Forward + reverse indexes for graph traversal
- Multi-option abilities split (Mission Tactics → FUROR/MALLEUS/PURGATUS)
- Chapter restrictions on detachments and characters
- False positive filtering (keyword relevance)
- Deduplication
- Free LLM (Llama 3.1 8B) for small queries
- Deterministic formatter for large queries (no LLM timeout)
- Targeting keywords extracted from rules text
- Boarding actions excluded
- Flavor text stripping
- Bold text corruption fixed

## Current State
- 24,919 nodes, 116,776 refs
- 143 server tests, 51 client tests
- Live at tabletop-tools.net/brain/
- Q&A works with free LLM, Claude as upgrade option

## Remaining Issues
- Markdown rendering on frontend (raw ** showing)
- Some flavor text leaking in enhancements
- Graph visualizer not built yet

## Roadmap

### Near Term
1. **Graph Visualizer** — Cytoscape.js interactive graph, click node to expand, see connections
2. **Fix markdown rendering** — proper HTML rendering on the frontend
3. **Better search** — keyword intersection queries (find units with Infantry + Grenades + Deep Strike)

### Medium Term
4. **Simulation Matrix** — pre-compute weapon profiles × defensive profiles (~1.2M matchups)
   - Group by: S, AP, D, A, BS, abilities for weapon profiles
   - Group by: T, Sv, W, invuln for defensive profiles
   - ~2,554 unique weapon profiles × ~457 defensive profiles
   - Modifiers as multipliers (rerolls, sustained hits, etc.)
5. **Points History** — track unit costs across dataslates, correlation with win rates
6. **Better Community Knowledge** — more tactical nodes from Micah's gameplay insights

### Long Term
7. **Game Agent Helper** — "which target should I shoot?" given current game state
   - Pre-computed matrix as lookup table
   - Target priority scoring (expected damage × points value × objective threat)
   - Resource allocation (CP spending decisions)
8. **Autonomous Player** — full game tree search, movement, charging, objective play
9. **OCR for Codexes** — Micah has Adobe license, 3 codex PDFs (SM, Orks, GSC) are image scans
10. **11th Edition Support** — architecture is edition-proof, re-ingest when data changes

## Combat Knowledge Discussed

### Key Indicators (tagged on nodes)
- **Toughness tiers**: T3 (light), T4 (standard), T5 (heavy), T6 (elite), T7-10 (vehicles), T11+ (super-heavy)
- **Strength tiers**: matched to toughness for wound roll efficiency
- **Save/Invuln**: AP cap calculation (AP beyond invuln is wasted)
- **Damage vs Wounds**: overkill efficiency
- **Attack volume**: models × weapons × attacks = total dice pool

### Competitive Concepts
- **Fishing for crits**: reroll successful hits to get 6s for sustained/lethal/devastating
- **Rerolls are offensive**: the value is fishing for crits, not fixing misses
- **Volume multiplies abilities**: sustained hits on 20 attacks >> sustained hits on 3 attacks
- **Mortal wounds bypass everything**: grenades, tank shock, devastating wounds, charge abilities
- **Reactive capabilities**: overwatch, fight on death, heroic intervention change opponent decisions
- **Unit type = terrain rules**: Infantry/Beasts through terrain, Vehicles around
- **Leader abilities vs Auras**: leader = attached unit only, aura = range-based multiple units

### Data Architecture Insights
- **Weapon abilities are unit-specific**: same weapon name, different abilities per datasheet
- **Points per wound**: efficiency metric for durability comparison
- **Chapter restrictions**: parsed from detachment ability text, tagged on nodes
- **Targeting keywords**: extracted from stratagem TARGET/EFFECT text, matched to unit keywords
