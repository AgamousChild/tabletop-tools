# Brain Full Model — Multi-Layer Diagrams

---

## Diagram 1: A Complete Army — All Layers Visible

This shows a real Blood Angels army with every object type, every relationship, and every constraint in one view. The colors indicate what layer each thing lives on.

**Assumption: A Blood Angels player has access to BA-specific content AND generic Space Marines content. Is this correct?**

```mermaid
graph TD
    classDef faction fill:#3b82f6,color:white
    classDef armyrule fill:#8b5cf6,color:white
    classDef detachment fill:#f59e0b,color:black
    classDef detrule fill:#fbbf24,color:black
    classDef stratagem fill:#ef4444,color:white
    classDef enhancement fill:#10b981,color:white
    classDef unit fill:#06b6d4,color:white
    classDef weapon fill:#64748b,color:white
    classDef ability fill:#ec4899,color:white
    classDef core fill:#f97316,color:white

    %% FACTION LAYER
    BA[BLOOD ANGELS]:::faction
    SM[SPACE MARINES\ngeneric - shared]:::faction
    %% No "accesses" ref — generic SM content (no subfaction) is available to all chapters

    %% ARMY RULES — always active
    OOM[Oath of Moment\nre-roll hits+wounds vs 1 target\nAPPLIES TO: all units in army]:::armyrule
    SOS[The Sons of Sanguinius\nBA-specific army rule]:::armyrule
    OOM -->|part_of| SM
    SOS -->|part_of| BA

    %% DETACHMENTS — player picks these
    WOD[Wrath of the Doomed\n2pts - DEATH COMPANY focused]:::detachment
    AH[Angelic Host\n1pt - CHARACTER focused]:::detachment
    GLAD[Gladius Task Force\n3pts - all-rounder]:::detachment
    WOD -->|part_of| BA
    AH -->|part_of| BA
    GLAD -->|part_of| SM

    %% DETACHMENT INTERNALS — what each detachment contains
    FC[Fanatical Celerity\nadvance+charge for\nDEATH COMPANY at cost of MW]:::detrule
    RFR[Rage-Fuelled Response\n1CP - surge D6 after being shot\nTARGET: DEATH COMPANY]:::stratagem
    II[Instinctive Interception\nHeroic Intervention -1CP\nMODEL: DEATH COMPANY only]:::enhancement
    
    FC -->|rule_of| WOD
    RFR -->|part_of| WOD
    II -->|part_of| WOD

    AH_RULE[Angelic Host Rule\nbuffs CHARACTER units]:::detrule
    AH_STRAT[Angel's Sacrifice\n1CP\nTARGET: BA CHARACTER]:::stratagem
    AH_RULE -->|rule_of| AH
    AH_STRAT -->|part_of| AH

    GLAD_RULE[Combat Doctrines\ncycle each turn\nAPPLIES TO: all ADEPTUS ASTARTES]:::detrule
    GLAD_STRAT[Armour of Contempt\n1CP\nTARGET: any ADEPTUS ASTARTES]:::stratagem
    GLAD_RULE -->|rule_of| GLAD
    GLAD_STRAT -->|part_of| GLAD

    %% UNITS — assigned to detachments
    LEM[Lemartes\nM12 T4 SV3+ W4\nKEYWORDS: DEATH COMPANY,\nCHARACTER, CHAPLAIN, FLY,\nEPIC HERO]:::unit
    DCM[Death Company Marines\nM6 T4 SV3+ W2 x5\nKEYWORDS: DEATH COMPANY,\nINFANTRY]:::unit
    INT[Intercessors\nM6 T4 SV3+ W2 x5\nKEYWORDS: INFANTRY,\nBATTLELINE]:::unit
    RED[Redemptor Dreadnought\nM8 T10 SV2+ W12\nKEYWORDS: VEHICLE,\nWALKER]:::unit

    LEM -->|assigned_to| WOD
    DCM -->|assigned_to| WOD
    INT -->|assigned_to| GLAD
    RED -->|assigned_to| GLAD

    %% LEADER ATTACHMENT — character joins unit
    LEM ==>|leads| DCM
    
    %% LEADER ABILITIES FLOW DOWN
    GOTL[Guardian of the Lost\nunit gets FNP 6+]:::ability
    GOTL -->|part_of| LEM
    GOTL -.->|flows to| DCM

    %% UNIT WEAPONS + ABILITIES
    BC[The Blood Crozius\nS6 AP-1 D2\nDEVASTATING WOUNDS]:::weapon
    BR[Black Rage\nhit re-rolls below\nhalf strength]:::ability
    BC -->|part_of| LEM
    BR -->|part_of| LEM

    ABR[Auto Bolt Rifle\nS4 AP0 D1\nASSAULT]:::weapon
    ABR -->|part_of| INT

    %% WHAT APPLIES TO WHAT
    %% Army rules → all units
    OOM -.->|applies to| LEM
    OOM -.->|applies to| DCM
    OOM -.->|applies to| INT
    OOM -.->|applies to| RED

    %% Detachment rules → units in that detachment with matching keywords
    FC -.->|applies to\nDEATH COMPANY keyword| LEM
    FC -.->|applies to\nDEATH COMPANY keyword| DCM
    GLAD_RULE -.->|applies to\nADEPTUS ASTARTES keyword| INT
    GLAD_RULE -.->|applies to\nADEPTUS ASTARTES keyword| RED

    %% Stratagems → targetable units
    RFR -.->|can target\nDEATH COMPANY + unengaged| LEM
    RFR -.->|can target\nDEATH COMPANY + unengaged| DCM
    GLAD_STRAT -.->|can target\nADEPTUS ASTARTES| INT
    GLAD_STRAT -.->|can target\nADEPTUS ASTARTES| RED

    %% Enhancement → one character
    II -.->|given to\nbut EPIC HERO cannot take| LEM

    %% CORE MECHANIC connections
    DW_CORE[Core: Devastating Wounds\nauto-wound on crit]:::core
    BC -.->|has keyword| DW_CORE

    %% COMBO
    BR <-.->|stacks_with\nhit re-rolls + dev wounds\n= fish for mortals| DW_CORE
```

**Assumptions — VERIFIED with Micah (2026-05-07):**
1. ✅ Army rules apply to ALL units regardless of detachment assignment.
2. ✅ Detachment rules apply only to units assigned to that detachment. BUT some detachments have keyword requirements (e.g., "only DEATH COMPANY units benefit") or apply new keywords to specified units (e.g., "your INFANTRY units gain BATTLELINE").
3. ✅ In an army list with multiple detachments, each unit is assigned to exactly one. But a unit CAN be in any detachment that doesn't restrict membership — eligibility is determined by the detachment's restrictions, not the unit's choice.
4. ✅ In 10th: stratagems can only target units in their own detachment. In 11th: unknown — flag for confirmation when rules drop.
5. ⚠️ NOT automatic. Each leader ability explicitly states whether it affects just the leader or the whole attached unit. Abilities that say "while leading a unit" only work when the leader has a bodyguard unit. In 10th, the leader LOSES those abilities when their unit dies. In 11th, the leader KEEPS those abilities even after their unit is destroyed.
6. ✅ Epic Heroes (named characters) cannot take enhancements. Hard constraint.
7. ✅ CORRECTED: There is NO "accesses" relationship between factions. Generic SM units (those without a subfaction keyword) are available to ALL chapters. When a unit has no subfaction, it's shared content — Intercessors, Redemptors, etc. belong to everyone. Same for detachments without a chapter restriction. The availability is determined by the ABSENCE of a subfaction, not by a link between factions.

---

## Diagram 2: Eligibility and Targeting — What Can Combine With What

This shows the constraint system. Green = legal, red = illegal.

**Assumption: The keyword system determines most eligibility. Is that the whole picture?**

```mermaid
graph LR
    classDef legal fill:#10b981,color:white
    classDef illegal fill:#ef4444,color:white
    classDef partial fill:#f59e0b,color:black

    subgraph "Detachment: Wrath of the Doomed"
        WOD_RULE[Fanatical Celerity]
        WOD_STRAT[Rage-Fuelled Response\nTARGET: DEATH COMPANY]
        WOD_ENH[Instinctive Interception\nMODEL: DEATH COMPANY]
    end

    subgraph "Units with DEATH COMPANY keyword"
        LEM2[Lemartes ✅]:::legal
        DCM2[DC Marines ✅]:::legal
        DCC[DC Captain ✅]:::legal
    end

    subgraph "Units WITHOUT DEATH COMPANY keyword"
        INT2[Intercessors]:::illegal
        RED2[Redemptor]:::illegal
    end

    WOD_RULE -->|"applies ✅\nDEATH COMPANY"| LEM2
    WOD_RULE -->|"applies ✅"| DCM2
    WOD_RULE --->|"does NOT apply ❌\nno keyword match"| INT2

    WOD_STRAT -->|"can target ✅"| DCM2
    WOD_STRAT --->|"cannot target ❌"| INT2

    WOD_ENH -->|"can give to ✅\n...but EPIC HERO ❌"| LEM2
    WOD_ENH -->|"can give to ✅"| DCC
    WOD_ENH --->|"cannot give ❌"| INT2
```

**But wait — can those non-DEATH COMPANY units still be IN the Wrath of the Doomed detachment?**
- In 10th: Only 1 detachment, so all units are technically "in" it. But the rules only affect matching keywords.
- In 11th: Units are assigned to specific detachments. An Intercessor could be in WotD but wouldn't benefit from most of its rules.

**This is a critical question: Is eligibility about "can be assigned" or "benefits from"?**

---

## Diagram 3: How a Query Traverses the Data

Shows the actual path through the graph when a user searches for something, at every level.

```mermaid
graph TD
    classDef vectorize fill:#8b5cf6,color:white
    classDef refwalk fill:#3b82f6,color:white
    classDef filter fill:#ef4444,color:white
    classDef output fill:#10b981,color:white

    Q[User: 'Lemartes'] --> DETECT[Faction Detection\nfactions: none\nsubfaction: none\nstripped: 'Lemartes']
    
    DETECT --> BROWSE{Faction browse?}
    BROWSE -->|No - stripped query\nis not empty| EMBED[Embed 'Lemartes'\nvia Workers AI]:::vectorize
    
    EMBED --> VECTORIZE[Query Vectorize\ntopK=50\nno faction filter]:::vectorize
    
    VECTORIZE --> MATCHES[Raw matches:\n1. Lemartes datasheet 0.95\n2. Death Company Marines 0.72\n3. Black Rage ability 0.71\n4. Guardian of the Lost 0.68\n5. Blood Angels detachment 0.55\n...\n47. Space Wolves stratagem 0.31\n48. Dark Angels ability 0.30]

    MATCHES --> INFER[Infer faction from top result:\nLemartes.factionId = space-marines\nLemartes.subfaction = blood angels]:::filter

    INFER --> FFILTER[Post-filter by faction:\n✅ space-marines\n✅ blood-angels\n❌ dark-angels\n❌ space-wolves\n❌ orks]:::filter

    FFILTER --> SUBFILTER[Subfaction filter:\n✅ blood angels\n✅ no subfaction\n❌ dark angels\n❌ space wolves]:::filter

    SUBFILTER --> SORTED[Sort:\n1. Exact title match first\n2. Then by Vectorize score\nSlice to limit 10]

    SORTED --> PRIMARY[Primary Results:\n10 nodes about Lemartes\nand BA content]:::output

    PRIMARY --> CONNECTED{Include connected?}
    
    CONNECTED -->|Search: YES\nfor cross-refs| CROSSREF[Walk fwd+rev indexes\nfrom all primary nodes\nbuild cross-ref links\nfiltered by faction+subfaction]:::refwalk
    
    CONNECTED -->|Graph: YES\nfor visualization| GRAPHWALK[Walk eligible_for\nfrom datasheets → detachments\nWalk part_of\nfrom detachment internals\nBuild edges between\nall nodes in set]:::refwalk
    
    CONNECTED -->|Ask: YES\nfor LLM context| ASKFILTER[Score connected nodes\nby keyword relevance\nto query terms\nkeep top 15 with score > 0]:::filter

    CROSSREF --> SEARCH_OUT[Search: paginated records\nwith cross-ref links]:::output
    GRAPHWALK --> GRAPH_OUT[Graph: nodes + edges\nfor visualization]:::output
    ASKFILTER --> ASK_OUT[Ask: focused context\n→ LLM → answer]:::output
```

**What this reveals:**
- Vectorize doesn't know about our ref structure. It finds semantically similar content. Refs are only used AFTER Vectorize narrows the candidates.
- Faction detection from the query is unreliable for unit names. "Lemartes" doesn't trigger faction detection — we infer from the result. "Blood Angels Lemartes" would detect the faction.
- Each endpoint uses the connected nodes differently. Search builds cross-ref links. Graph builds visual edges. Ask filters by keyword relevance. Same underlying retrieve(), different post-processing.

---

## Diagram 4: The Data At Rest — What's Actually Stored

Shows the actual node and ref structure as it exists in R2, not the conceptual model.

```mermaid
graph TD
    classDef node fill:#1e293b,color:#f1f5f9,stroke:#334155
    classDef ref fill:#0f172a,color:#94a3b8,stroke:#475569
    
    subgraph "R2: nodes/faction-blood-angels.json"
        N1["id: faction-root:blood-angels\ncategory: faction\nfactionId: blood-angels\nsubfaction: (none)\nedition: 10th\ncontent: 'BLOOD ANGELS faction.\n9 detachments, 1 army rules,\n15 datasheets'"]:::node
        
        N2["id: faction:blood-angels:the-sons-of-sanguinius\ncategory: army-rule\nfactionId: blood-angels\nsubfaction: (none)\ncontent: 'The Sons of Sanguinius...'"]:::node
        
        N3["id: det:blood-angels:angelic-inheritors:angelic-inheritors\ncategory: detachment-rule\nfactionId: blood-angels\nsubfaction: (none)\ncontent: 'Angelic Inheritors...'"]:::node
    end

    subgraph "R2: nodes/faction-space-marines.json"
        N4["id: 000000164\ncategory: datasheet\nfactionId: space-marines\nsubfaction: blood angels\nedition: 10th\ncontent: 'Lemartes...'"]:::node

        N5["id: ability:000000166:black-rage\ncategory: unit-ability\nfactionId: space-marines\nsubfaction: blood angels\ndatasheetId: 000000164\ncontent: 'Black Rage...'"]:::node

        N6["id: det:space-marines:the-lost-brethren\ncategory: detachment-rule\nfactionId: space-marines\nsubfaction: blood angels\ncontent: 'The Lost Brethren...'"]:::node
    end

    subgraph "R2: refs/forward-index.json"
        R1["000000164 → [\n  {target: detachment:det:...:wrath-of-the-doomed,\n   rel: eligible_for},\n  {target: detachment:det:...:angelic-host,\n   rel: eligible_for},\n  {target: detachment:det:...:gladius-task-force,\n   rel: eligible_for},\n  ... 17 more\n]"]:::ref

        R2["ability:000000166:black-rage → [\n  {target: 000000164,\n   rel: part_of},\n  {target: det:...:mercy-is-weakness,\n   rel: stacks_with},\n  ... 8 more\n]"]:::ref
    end

    subgraph "R2: refs/reverse-index.json"
        R3["faction-root:blood-angels ← [\n  {source: faction:blood-angels:the-sons-of-sanguinius,\n   rel: part_of},\n  {source: detachment:det:...:angelic-inheritors,\n   rel: part_of},\n  ... 8 more\n]"]:::ref
    end
```

**What this reveals:**
- Blood Angels data lives in TWO files: `faction-blood-angels.json` (factionId: blood-angels) and `faction-space-marines.json` (factionId: space-marines, subfaction: blood angels). This split is the source of every faction-matching bug we've hit.
- Node IDs are inconsistent: Wahapedia uses numeric IDs (`000000164`), faction packs use slug-based IDs (`det:blood-angels:angelic-inheritors:angelic-inheritors`), 11th edition uses prefixed IDs (`11e:det:space-marines:wrath-of-the-doomed`), auto-generated containers use `detachment:` prefix.
- The ref indexes are keyed by node ID. A query for "what points to Blood Angels faction?" requires the reverse index. A query for "what is Lemartes eligible for?" requires the forward index. Both are ~10-14MB JSON files loaded once per Worker isolate.
- factionId inconsistency: Lemartes has `factionId: "space-marines"` but is functionally a Blood Angels unit. The Sons of Sanguinius has `factionId: "blood-angels"`. These represent the same army but use different identifiers.

---

## Diagram 5: What The User Sees vs What Exists

The navigation experience at each level, showing what appears and what's hidden.

```mermaid
graph TD
    classDef visible fill:#10b981,color:white
    classDef hidden fill:#ef4444,color:white
    classDef partial fill:#f59e0b,color:black

    subgraph "Search: 'Blood Angels'"
        V1[✅ BLOOD ANGELS faction node]:::visible
        V2[✅ 9 detachments]:::visible
        V3[✅ 1 army rule\nThe Sons of Sanguinius]:::visible
        H1[⚠️ 15 BA units — part_of refs exist\nbut not prominently surfaced]:::partial
        H2[❌ Oath of Moment — not shown\nlives under space-marines faction]:::hidden
        H3[❌ Generic SM detachments\nGladius, Ironstorm, etc.\nno access relationship]:::hidden
        H4[❌ Community tactics about BA\nno structural connection]:::hidden
    end

    subgraph "Search: 'Lemartes'"
        V4[✅ Lemartes datasheet]:::visible
        V5[✅ Weapons: Blood Crozius, Bolt Pistol]:::visible
        V6[✅ Abilities: Black Rage, Guardian]:::visible
        V7[✅ 20 eligible detachments\nbut ALL shown equally]:::partial
        H5[❌ Which detachments are BEST for him\nno affinity scoring]:::hidden
        H6[⚠️ Who he can lead\ncan_lead refs exist but not surfaced in UI]:::partial
        H7[❌ Which stratagems target him\ntarget text not parsed]:::hidden
        H8[❌ His stat line as numbers\nburied in content text]:::hidden
    end

    subgraph "Focus on: Wrath of the Doomed"
        V8[✅ Fanatical Celerity rule]:::visible
        V9[✅ Stratagems]:::visible
        V10[✅ Enhancements]:::visible
        H9[❌ Units that benefit from this\neligible_for not walked in reverse]:::hidden
        H10[❌ Which keywords this cares about\nnot extracted from rule text]:::hidden
        H11[❌ Detachment points cost\nnot stored]:::hidden
    end
```

---

## My Assumptions That May Be Wrong

I'm listing these explicitly so you can correct me:

1. **"Blood Angels accesses Space Marines content"** — RESOLVED: There is no "accesses" relationship. Generic SM content (no subfaction keyword) is available to all chapters. The query is: same factionId where subfaction matches mine OR subfaction is empty. Faction nodes are created by `buildFactionNodes()` in combo-detection.ts.

2. **"eligible_for means the unit can be in that detachment"** — I assumed any BA unit can be assigned to any BA detachment. But maybe some detachments REQUIRE specific keywords (not just benefit from them)?

3. **"One leader per unit"** — Is this always true? Can you stack two characters?

4. **"Stratagems target units in their own detachment"** — In 10th with one detachment this is moot. In 11th with multiple, can you use Detachment A's stratagem on a unit in Detachment B?

5. **"The faction node is the entry point"** — I assumed people navigate faction → detachment → unit. But maybe most users start from a unit ("I own Lemartes, what do I do with him?") and go up, not down.

6. **"Community content should connect to game objects"** — Maybe it's fine as a separate Vectorize-searchable pool. Maybe forcing structural refs onto opinion content is wrong.

7. **"Detachment containers and detachment rules are separate"** — Maybe they should be one node. The container was my invention to hold stratagems/enhancements. Maybe the detachment IS the rule + its contents, not a wrapper around them.
