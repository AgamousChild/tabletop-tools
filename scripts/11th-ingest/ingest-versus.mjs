/**
 * Ingest the weapon/unit abilities into the content source the versus simulator
 * reads. Each ability in abilities.json becomes a content_entity (type='ability')
 * — the canonical, FK-able registry. The ability's effect text lives in
 * abilities.json (and, on publish, the R2 content doc); the simulator applies
 * abilities by keyword and resolves the canonical entity for display/reference.
 *
 * Usage: node scripts/11th-ingest/ingest-versus.mjs <abilities.json> [--dry]
 * Reads TURSO creds from the repo-root .env.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

export async function ingestVersus({ abilitiesPath, db, dry = false }) {
  const data = JSON.parse(readFileSync(abilitiesPath, 'utf8'))
  const abilities = data.abilities || []
  const now = Math.floor(Date.now() / 1000)
  let n = 0
  for (const a of abilities) {
    if (!dry) {
      await db.execute({
        sql: `INSERT INTO content_entity (id,type,name,r2_key,updated_at) VALUES (?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, r2_key=excluded.r2_key, updated_at=excluded.updated_at`,
        args: [a.id, 'ability', a.name, `content/ability/${a.id.replace(/^ability:/, '')}.json`, now],
      })
    }
    n++
  }
  return { abilities: n, weapon: abilities.filter((a) => a.type === 'weapon').length, unit: abilities.filter((a) => a.type === 'unit').length }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/ingest-versus.mjs')) {
  const abilitiesPath = process.argv[2]
  const dry = process.argv.includes('--dry')
  const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
  const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })
  const res = await ingestVersus({ abilitiesPath, db, dry })
  console.log(`${dry ? '[dry] ' : ''}abilities=${res.abilities} (weapon=${res.weapon}, unit=${res.unit}) -> content_entity(type=ability)`)
}
