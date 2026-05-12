# Brain Retrieval Flow — How Queries Become Results

> Traces the exact code path for real queries through all four endpoints.

---

## The Four Endpoints

| Endpoint | What it returns | Who calls it |
|---|---|---|
| `POST /search` | Paginated records (aggregated node groups) with cross-refs | Search tab |
| `POST /ask` | LLM-generated answer using retrieved context | Ask tab |
| `POST /graph-data` | Nodes + edges for visualization | Graph tab |
| `GET /browse/nodes` | Filtered node list by category | Browse tab |

All three POST endpoints call `retrieve()` internally. Browse bypasses it.

---

## Example 1: "Blood Angels" (faction name query)

### Step 1: Faction Detection
```
Input: "blood angels"
detectFactions() → { factions: ["space-marines"], subfaction: "blood angels" }
stripFactionFromQuery() → "" (empty — the whole query was the faction name)
extractMechanicKeywords() → [] (no mechanics)
```

### Step 2: Faction Browse Check
```
strippedQuery is empty + faction detected + query matches faction pattern exactly
→ isFactionBrowse = true
```

### Step 3: Faction Root Browse (new path)
```
rootId = "faction-root:blood-angels" (from subfaction slug)
→ Load ALL node files from R2
→ Find node with id === rootId
→ Walk reverse index: who has part_of → faction-root:blood-angels?
   Found: 3 army rules + 7 detachment containers
→ Walk forward index: does faction-root:blood-angels point to anything?
   Found: nothing (faction is a target, not a source)
```

### Step 4: What gets returned
```
results: [faction-root:blood-angels] (1 node — the faction)
connected: [3 army rules + 7 detachments] (10 nodes)
records: aggregated into 11 records for search display
```

### Step 5: Endpoint-specific processing

**Search (`/search`):**
```
→ buildCrossRefs() adds cross-references between records
→ Paginate → return page of records
User sees: BLOOD ANGELS faction card, then army rules, then detachments
```

**Graph (`/graph-data`):**
```
→ Filter by faction (factionSet includes "space-marines" and "blood-angels")
→ Walk eligible_for forward from any datasheets → pull in detachments (none here, center is faction)
→ Build edges from forward+reverse indexes between all nodes in the set
→ Return 11 nodes + 10 edges
User sees: Faction node at center, army rules + detachments radiating out
```

**Ask (`/ask`):**
```
→ assembleContext() formats nodes into LLM prompt text
→ LLM generates answer about Blood Angels army rules and detachment options
```

---

## Example 2: "Lemartes" (unit name query)

### Step 1: Faction Detection
```
Input: "Lemartes"
detectFactions() → { factions: [], subfaction: undefined }
stripFactionFromQuery() → "Lemartes" (unchanged — no faction detected)
extractMechanicKeywords() → [] (no mechanics)
```

### Step 2: Faction Browse Check
```
No faction detected → isFactionBrowse = false
→ Falls through to semantic search
```

### Step 3: Vectorize Search
```
→ Embed "Lemartes" via Workers AI (bge-base-en-v1.5)
→ Query Vectorize: topK=50, no faction filter (none detected)
→ Get ranked matches by semantic similarity
→ Top match: Lemartes datasheet (score ~0.95)
→ Other matches: Death Company Marines, Blood Angels abilities, etc.
```

### Step 4: Post-filtering
```
→ No faction detected, so infer from top result:
   results[0].factionId = "space-marines", subfaction = "blood angels"
→ Post-filter: keep only space-marines + blood-angels factionIds + generic
→ Subfaction filter: keep blood angels + no subfaction, drop space wolves/dark angels
→ Sort: exact title match first, then by Vectorize score
→ Slice to limit (10)
```

### Step 5: Connected Nodes (for /ask and /graph-data)
```
→ fetchConnectedNodes() walks reverse index from result node IDs
→ Finds: abilities that reference Lemartes, weapons on Lemartes, 
   stratagems that interact with his keywords
→ Faction filter: only keep space-marines or blood-angels nodes
→ Subfaction filter: drop space wolves/dark angels content
→ Cap: 30 high-priority + 30 weapons max
```

### Step 6: Endpoint-specific processing

**Search (`/search`):**
```
→ aggregateToRecords(): Lemartes datasheet + weapons + abilities → 1 unit record
→ buildCrossRefs(): find what Lemartes' nodes reference in fwd/rev indexes
   Cross-refs filtered by faction (blood-angels + space-marines only)
→ Return paginated records
User sees: Lemartes unit card with weapons, abilities, and related detachments/stratagems
```

**Graph (`/graph-data`):**
```
→ Filter nodes by inferred faction (space-marines + blood-angels)
→ Walk eligible_for FORWARD from Lemartes → pull in his eligible detachments
→ Build edges between all nodes in the set
→ Return nodes + edges
User sees: Lemartes at center, weapons + abilities + eligible detachments around him
```

**Ask (`/ask`):**
```
→ Filter connected nodes by keyword relevance to query
   "Lemartes" → queryWords: ["lemartes"]
   Only connected nodes mentioning "lemartes" in title/summary/keywords pass
→ assembleContext() with primary + filtered connected nodes
→ Attach errata for any matched nodes
→ LLM generates answer
```

---

## Example 3: "space marines sustained hits" (faction + mechanic query)

### Step 1: Faction Detection
```
Input: "space marines sustained hits"
detectFactions() → { factions: ["space-marines"], subfaction: undefined }
stripFactionFromQuery() → "sustained hits"
extractMechanicKeywords() → ["sustained hits"]
```

### Step 2: Faction Browse Check
```
strippedQuery = "sustained hits" (not empty) → isFactionBrowse = false
→ Falls through to semantic search
```

### Step 3: Vectorize Search
```
→ Embed "sustained hits" (stripped query) via Workers AI
→ Query Vectorize: topK=50, no pre-filter on faction
→ Get ranked matches: core Sustained Hits rule, abilities that grant it, 
   weapons that have it, stratagems that interact with it
```

### Step 4: Post-filtering
```
→ Faction detected: space-marines
→ Keep: nodes with factionId space-marines OR no factionId (core rules)
→ Drop: orks abilities with sustained hits, tyranid stratagems, etc.
→ Sort: exact title match "sustained hits" first (core rule), then by score
```

### Step 5: Connected Nodes
```
→ fetchConnectedNodes() from primary results
→ Reverse index: who references the core "sustained hits" node?
   → Hundreds of abilities across all factions
→ Faction filter: only keep space-marines
→ Priority sort: faction-abilities first, then detachment rules, then unit abilities
→ Cap at 30 high-priority + 30 weapons
```

### Step 6: For /ask specifically
```
→ Filter connected nodes by keyword relevance:
   queryWords: ["sustained", "hits"]
   mechanicKeywords: ["sustained hits"]
   → Only nodes mentioning "sustained" or "hits" in title/summary/keywords pass
   → Cap at 15 most relevant
→ This is what reduced Black Rage + 141 connected nodes down to 8 focused ones
→ assembleContext() with focused context
→ LLM answers: "Here are the SM abilities that grant Sustained Hits..."
```

---

## How Refs Are Used at Each Stage

### During retrieve():
- **Vectorize** finds semantically similar nodes (no refs involved)
- **fetchConnectedNodes()** walks `reverse index` to find what REFERENCES the results
- **fetchConnectedNodes()** walks `forward index` to resolve `part_of` parents (weapon → datasheet name)
- **fetchConnectedNodes()** walks `stacks_with` to find combo partners

### During /search endpoint:
- **buildCrossRefs()** walks `forward + reverse indexes` for ALL ref types to build the "Related" links on each search card
- Filtered by faction + subfaction

### During /graph-data endpoint:
- **eligible_for forward walk**: from datasheets in results → pull in their detachment containers
- **eligible_for reverse walk**: from detachments in results → pull in eligible units (NOT YET IMPLEMENTED)
- **forward + reverse indexes**: build edge list between all nodes in the graph

### During /ask endpoint:
- Refs are NOT directly used for context building
- Connected nodes (found via refs in retrieve) are filtered by keyword relevance
- stacks_with combos are found separately via forward index walk in the /ask handler

### During /browse endpoints:
- Refs are NOT used — browse returns filtered node lists by category
- Exception: `/browse/unit/:id` and `/browse/detachment/:id` use `datasheetId`/`detachmentId` fields (not ref indexes)

---

## What's NOT Connected (Gaps)

1. **Detachment → eligible units (reverse)**: eligible_for only walked forward in graph. Focusing on a detachment doesn't show its units.
2. **Units → faction node**: No direct ref. Units connect to detachments, detachments connect to factions. Two hops.
3. **Community nodes → anything**: Tactic/ruling nodes have no structural refs to the rules they discuss. They're found by Vectorize similarity only.
4. **Core rules → faction specifics**: "Sustained Hits" core rule doesn't ref every ability that grants it. That connection is via the reverse index (abilities ref the core rule via `modifies`).
