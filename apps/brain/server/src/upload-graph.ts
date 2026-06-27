/**
 * Upload the built graph to R2 and index nodes in Vectorize.
 * Run build-graph.ts first, then this script.
 *
 * Usage:
 *   cd apps/brain/server
 *   npx tsx src/build-graph.ts              # build the graph locally
 *   npx wrangler r2 object put ...          # or use this script with wrangler
 *
 * This script uploads files to R2 via wrangler CLI and indexes
 * nodes in Vectorize via the REST API.
 *
 * Prerequisites:
 *   - wrangler authenticated (wrangler login)
 *   - R2 bucket 'tabletop-tools-brain' created
 *   - Vectorize index 'brain-nodes' created with dimension 768 (bge-base-en-v1.5)
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-brain.md — Brain knowledge graph schema
 */
import { execSync } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = '.local/brain'
const BUCKET = 'tabletop-tools-brain'

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    console.error('No local graph found. Run build-graph.ts first.')
    process.exit(1)
  }

  console.log('Uploading brain graph to R2...\n')

  // Upload all JSON files to R2
  const files: string[] = []

  // Manifest
  files.push('manifest.json')

  // Node files
  const nodeDir = join(OUTPUT_DIR, 'nodes')
  if (existsSync(nodeDir)) {
    for (const f of readdirSync(nodeDir)) {
      files.push(`nodes/${f}`)
    }
  }

  // Ref files
  const refDir = join(OUTPUT_DIR, 'refs')
  if (existsSync(refDir)) {
    for (const f of readdirSync(refDir)) {
      files.push(`refs/${f}`)
    }
  }

  console.log(`Found ${files.length} files to upload\n`)

  let uploaded = 0
  let failed = 0

  for (const file of files) {
    const localPath = join(OUTPUT_DIR, file)
    try {
      execSync(
        // --remote is critical: without it wrangler writes to the LOCAL R2
        // emulator (a sqlite file under .wrangler/) and prod stays stale. The
        // caltrop is documented in the root CLAUDE.md under environment gotchas.
        `npx wrangler r2 object put "${BUCKET}/${file}" --remote --file "${localPath}" --content-type "application/json"`,
        { stdio: 'pipe' },
      )
      uploaded++
      process.stdout.write(`  ✓ ${file}\n`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${file}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\nR2 upload: ${uploaded} succeeded, ${failed} failed`)

  // Summary
  const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'))
  console.log(`\nManifest version: ${manifest.version}`)
  console.log(`Files in manifest: ${Object.keys(manifest.files).length}`)
  console.log(`Updated at: ${manifest.updatedAt}`)

  console.log('\n--- Vectorize indexing ---')
  console.log('To index nodes in Vectorize, deploy the Worker and call:')
  console.log('  curl -X POST https://tabletop-tools.net/brain/api/index-vectors \\')
  console.log('    -H "Authorization: Bearer $SYNC_SECRET"')
  console.log('\nOr create the index and upload vectors via wrangler:')
  console.log('  npx wrangler vectorize create brain-nodes --dimensions 768 --metric cosine')
  console.log('\nThe Worker will generate embeddings on first search query (lazy indexing).')
}

main().catch(console.error)
