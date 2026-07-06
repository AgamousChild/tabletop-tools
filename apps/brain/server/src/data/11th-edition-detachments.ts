/**
 * 11th Edition detachment data — formerly hand-scraped from Warhammer Community
 * faction focus articles (May 2026). All detachment entries have since been
 * superseded by the official faction packs + MFM pipeline that runs through
 * merge-sources.ts.
 *
 * DO NOT add detachment entries here. build11thEditionNodes runs AFTER
 * mergeSources in build-graph.ts (step 6c), so any detachment node added here
 * bypasses the merge pipeline and creates duplicates alongside the MFM + faction
 * pack versions. If new detachment data is needed before a faction pack ships,
 * add it through the faction-pack v2 parser pipeline instead.
 *
 * Retained: Army Construction rules node only (not a detachment and has no
 * canonical source in the faction-pack pipeline). The hand-scraped Red Terror
 * unit stub was removed 2026-07-06 — the Tyranids faction pack now ships the
 * official THE RED TERROR datasheet through the v2 parser, and the stub
 * duplicated it under a slightly different title.
 */
import type { Node, NodeRef } from '../lib/model'

const RETRIEVED_AT = '2026-05-05T00:00:00Z'

export function build11thEditionNodes(): { nodes: Node[]; refs: NodeRef[] } {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  // ── 11th Edition Army Construction Rules ──────────────────────────────────
  nodes.push({
    id: '11e:core:army-construction',
    layer: 'core',
    category: 'army-construction',
    title: '11th Edition Army Construction — Detachment Points',
    content: `**Multiple Detachments**

In 11th Edition, armies can include multiple detachments. Each unit is assigned to one detachment and benefits from that detachment's rules, stratagems, and enhancements.

**Detachment Points**

Each detachment has a cost of 1-3 Detachment Points:
- **1 point:** Narrow, unit-focused detachments (e.g., affects only one unit type)
- **2 points:** Moderate scope
- **3 points:** Army-wide buffs that affect your entire force

**Detachment Points by Game Size:**
- **Incursion (1,000 pts):** 2 Detachment Points
- **Strike Force (2,000 pts):** 3 Detachment Points

**Build Options at Strike Force (competitive standard):**
- One 3-point detachment (all-in on one army-wide buff)
- One 2-point + one 1-point detachment (primary + support)
- Three 1-point detachments (breadth across different unit synergies)

**70+ detachments available at launch.**

Units in different detachments benefit from different rules. A melee-focused unit could be in an aggressive detachment while a shooting unit sits in a firepower detachment — within the same army.`,
    summary:
      '11th Edition army construction: multiple detachments per army, 1-3 Detachment Points each. Strike Force gets 3 pts. 70+ detachments at launch.',
    edition: '11th',
    sources: [
      {
        type: 'manual' as const,
        title: 'Warhammer Community — Building an Army in the New Edition',
        url: 'https://www.warhammer-community.com/en-gb/articles/95fucn12/building-an-army-in-the-new-edition-of-warhammer-40000/',
        publishedAt: '2026-04-01',
        retrievedAt: RETRIEVED_AT,
      },
    ],
    refs: [],
    version: 1,
    keywords: [
      'army construction',
      'detachment points',
      '11th edition',
      'multiple detachments',
      'strike force',
      'incursion',
      'list building',
    ],
  })

  return { nodes, refs }
}
