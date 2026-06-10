/**
 * Upload all node files whose hash differs from the current manifest entry,
 * then write a fresh manifest and upload it. Designed for the 11e faction pack
 * rebuild — 46 files updated in one go.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { execSync } from 'node:child_process'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const NODES_DIR = '.local/brain/nodes'
const REFS_DIR = '.local/brain/refs'
const MANIFEST = '.local/brain/manifest.json'

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

function shortHash(content) {
  return 'hash:' + createHash('sha256').update(content).digest('hex').slice(0, 8)
}

function uploadFile(key, localPath) {
  const cmd = `npx wrangler r2 object put tabletop-tools-brain/${key} --file ${localPath} --remote`
  try {
    execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLOUDFLARE_API_TOKEN: env.CF_FULL_API_TOKEN },
    })
    return true
  } catch (err) {
    console.error(`  ✗ ${key}: ${err.message?.slice(0, 100)}`)
    return false
  }
}

function processDir(dir, prefix) {
  if (!existsSync(dir)) return { uploaded: 0, skipped: 0 }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  let uploaded = 0
  let skipped = 0
  for (const f of files) {
    const local = path.join(dir, f)
    const content = readFileSync(local, 'utf8')
    const hash = shortHash(content)
    const key = `${prefix}/${f}`
    if (manifest.files[key] === hash) {
      skipped++
      continue
    }
    process.stdout.write(`  ${key}... `)
    const ok = uploadFile(key, local)
    if (ok) {
      manifest.files[key] = hash
      uploaded++
      console.log('✓')
    }
  }
  return { uploaded, skipped }
}

console.log('--- Uploading nodes ---')
const nr = processDir(NODES_DIR, 'nodes')
console.log(`Nodes: ${nr.uploaded} uploaded, ${nr.skipped} unchanged`)

console.log('\n--- Uploading refs ---')
const rr = processDir(REFS_DIR, 'refs')
console.log(`Refs: ${rr.uploaded} uploaded, ${rr.skipped} unchanged`)

// Bump manifest version and upload
manifest.version = (manifest.version || 0) + 1
manifest.updatedAt = new Date().toISOString()
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))

console.log('\n--- Uploading manifest ---')
const mu = uploadFile('manifest.json', MANIFEST)
console.log(mu ? `✓ manifest v${manifest.version}` : '✗ manifest upload failed')
