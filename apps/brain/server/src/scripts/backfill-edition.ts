/**
 * One-shot backfill script: tag every untagged node in
 * `.local/brain/nodes/community-recent.json` with `edition: '11th'` (and
 * optionally a keyword-inferred `factionId`).
 *
 * The 167 already-on-disk untagged community-recent nodes are pre-PR-#43
 * content-ingestor output. PR #43 stopped the bleeding upstream; this script
 * cleans up what landed before that fix.
 *
 * Run from `apps/brain/server`:
 *   npx tsx src/scripts/backfill-edition.ts
 *
 * @see docs/superpowers/plans/2026-06-27-data-problems-followup.md (Step 1)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createDb, getAllFactions } from '@tabletop-tools/db'

import { backfillEdition } from '../lib/backfill-edition'
import type { Node } from '../lib/model'

const TARGET = '.local/brain/nodes/community-recent.json'

async function loadKnownFactionSlugs(): Promise<Set<string> | undefined> {
  try {
    const db = createDb({
      url: process.env.TURSO_DB_URL ?? 'file:.local/dev.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const factions = await getAllFactions(db)
    if (factions.length === 0) return undefined
    return new Set(factions.map((f) => f.id))
  } catch (err) {
    console.warn(
      `  warn: could not load faction slugs from DB (${err instanceof Error ? err.message : err})`,
    )
    console.warn('  warn: continuing without factionId inference')
    return undefined
  }
}

async function main() {
  const path = join(process.cwd(), TARGET)
  if (!existsSync(path)) {
    console.error(`error: ${TARGET} not found at ${path}`)
    console.error('       pull it from R2 first:')
    console.error(
      '       npx wrangler r2 object get tabletop-tools-brain/nodes/community-recent.json' +
        ' --remote --file=.local/brain/nodes/community-recent.json',
    )
    process.exit(1)
  }

  console.log(`Reading ${TARGET}...`)
  const raw = readFileSync(path, 'utf-8')
  const nodes = JSON.parse(raw) as Node[]
  console.log(`  loaded ${nodes.length} nodes`)

  const before = {
    missingEdition: nodes.filter((n) => !n.edition).length,
    missingFactionId: nodes.filter((n) => !n.factionId).length,
  }
  console.log(`  missing edition:   ${before.missingEdition}`)
  console.log(`  missing factionId: ${before.missingFactionId}`)

  const knownFactionSlugs = await loadKnownFactionSlugs()
  if (knownFactionSlugs) {
    console.log(`  loaded ${knownFactionSlugs.size} canonical faction slugs from DB`)
  }

  const { nodes: updated, stats } = backfillEdition(nodes, { knownFactionSlugs })

  const after = {
    missingEdition: updated.filter((n) => !n.edition).length,
    missingFactionId: updated.filter((n) => !n.factionId).length,
  }

  console.log('\nBackfill result:')
  console.log(`  edition set on:    ${stats.editionSet} nodes`)
  console.log(`  factionId set on:  ${stats.factionIdSet} nodes`)
  console.log(`  already tagged:    ${stats.alreadyTagged} nodes`)
  console.log(`  remaining missing edition:   ${after.missingEdition}`)
  console.log(`  remaining missing factionId: ${after.missingFactionId}`)

  if (stats.editionSet === 0 && stats.factionIdSet === 0) {
    console.log('\nNo changes — file already fully tagged. Not rewriting.')
    return
  }

  writeFileSync(path, JSON.stringify(updated))
  console.log(`\nWrote ${TARGET} (${updated.length} nodes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
