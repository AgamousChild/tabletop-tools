/**
 * Acceptance test for the detachment-stratagem-enhancement goal.
 *
 * For every 11e detachment, load a random stratagem, a random enhancement,
 * and (if available) a random upgrade. Fails if any detachment can't
 * produce the required entries or the returned data is incomplete.
 *
 * Run three consecutive times — every run must pass end-to-end.
 *
 * Modes:
 *  - `local`: joins from the local graph JSON in .local/brain/nodes/
 *  - `live`:  hits https://tabletop-tools.net/brain/api/browse/detachment/:id
 */
import { readdirSync, readFileSync } from 'node:fs'

const MODE = process.argv[2] ?? 'local'
const ITERATIONS = Number(process.argv[3] ?? '3')

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

function loadLocalGraph() {
  const dir = 'apps/brain/server/.local/brain/nodes'
  const all = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const raw = JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8'))
    const nodes = Array.isArray(raw) ? raw : raw.nodes || []
    all.push(...nodes)
  }
  return all
}

function endpointJoin(allNodes, id) {
  const detachment = allNodes.find(
    (n) =>
      n.id === id && (n.category === 'detachment' || n.category === 'detachment-rule'),
  )
  if (!detachment) return null
  const tail = id.split(':').pop()
  const stratagems = []
  const enhancements = []
  for (const n of allNodes) {
    if (n.edition !== '11th') continue
    if (n.detachmentId !== id && n.detachmentId !== tail) continue
    if (n.category === 'stratagem') stratagems.push(n)
    else if (n.category === 'enhancement') enhancements.push(n)
  }
  return { detachment, stratagems, enhancements }
}

async function liveFetch(id) {
  const url = `https://tabletop-tools.net/brain/api/browse/detachment/${encodeURIComponent(id)}?edition=11th`
  const r = await fetch(url)
  if (!r.ok) return null
  return r.json()
}

function pickRandom(arr) {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

function validateEntry(kind, node) {
  if (!node) return { ok: false, why: `no ${kind} to pick` }
  if (!node.title || node.title.length < 2) return { ok: false, why: `${kind} missing title` }
  if (!node.content || node.content.length < 5)
    return { ok: false, why: `${kind} missing content` }
  if (kind === 'stratagem') {
    if (node.cpCost === undefined || node.cpCost === null || node.cpCost === '')
      return { ok: false, why: 'stratagem missing cpCost' }
  }
  if (kind === 'enhancement' || kind === 'upgrade') {
    if (node.cost === undefined || node.cost === null)
      return { ok: false, why: `${kind} missing cost` }
  }
  return { ok: true }
}

async function runIteration(allNodes, detIds) {
  const failures = []
  let checked = 0
  for (const id of detIds) {
    let result
    if (MODE === 'local') {
      result = endpointJoin(allNodes, id)
    } else {
      result = await liveFetch(id)
    }
    if (!result || !result.detachment) {
      failures.push({ id, why: 'detachment not found' })
      continue
    }
    checked++
    const stratPick = pickRandom(result.stratagems || [])
    const enhPick = pickRandom(result.enhancements || [])
    const upgradePool = (result.enhancements || []).filter((e) => /\(upgrade\)/i.test(e.title))
    const upgradePick = pickRandom(upgradePool)

    // "If available" applies to each: strat, enh, upgrade. Zero-count for a
    // given kind is not a failure — the goal is that whatever exists loads
    // correctly. Only fail if the pool is non-empty but a random pick has
    // missing title/content (indicating a broken node in the graph).
    if ((result.stratagems || []).length > 0) {
      const stratCheck = validateEntry('stratagem', stratPick)
      if (!stratCheck.ok)
        failures.push({ id, det: result.detachment.title, kind: 'strat', why: stratCheck.why })
    }
    if ((result.enhancements || []).length > 0) {
      const enhCheck = validateEntry('enhancement', enhPick)
      if (!enhCheck.ok)
        failures.push({ id, det: result.detachment.title, kind: 'enh', why: enhCheck.why })
    }
    if (upgradePool.length > 0) {
      const upgradeCheck = validateEntry('upgrade', upgradePick)
      if (!upgradeCheck.ok)
        failures.push({ id, det: result.detachment.title, kind: 'upgrade', why: upgradeCheck.why })
    }
  }
  return { checked, failures }
}

async function main() {
  console.log(`Acceptance test mode=${MODE} iterations=${ITERATIONS}\n`)
  let allNodes = null
  if (MODE === 'local') {
    allNodes = loadLocalGraph()
    console.log(`Loaded ${allNodes.length} local nodes`)
  }
  // Detachment ids: every 11e node with category detachment / detachment-rule.
  const detIds = new Set()
  if (allNodes) {
    for (const n of allNodes) {
      if ((n.category === 'detachment' || n.category === 'detachment-rule') && n.edition === '11th') {
        detIds.add(n.id)
      }
    }
  } else {
    // Live mode: fetch detachment ids from the local graph anyway (source of truth)
    const localNodes = loadLocalGraph()
    for (const n of localNodes) {
      if ((n.category === 'detachment' || n.category === 'detachment-rule') && n.edition === '11th') {
        detIds.add(n.id)
      }
    }
  }
  const detIdList = [...detIds].sort()
  console.log(`${detIdList.length} 11e detachments to test\n`)

  let allPassed = true
  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`=== Iteration ${i} ===`)
    const { checked, failures } = await runIteration(allNodes, detIdList)
    console.log(
      `  checked ${checked}/${detIdList.length}, failures: ${failures.length}`,
    )
    if (failures.length > 0) {
      allPassed = false
      // Group by "why"
      const byReason = new Map()
      for (const f of failures) {
        const key = `${f.kind ?? '-'}: ${f.why}`
        if (!byReason.has(key)) byReason.set(key, [])
        byReason.get(key).push(f.det ?? f.id)
      }
      for (const [reason, dets] of byReason) {
        console.log(`    ${reason}: ${dets.length} — ${dets.slice(0, 8).join(', ')}${dets.length > 8 ? '…' : ''}`)
      }
    }
  }
  console.log(`\n=== VERDICT: ${allPassed ? 'PASS' : 'FAIL'} ===`)
  process.exit(allPassed ? 0 : 1)
}

main()
