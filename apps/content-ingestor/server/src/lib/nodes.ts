/**
 * Write community nodes to R2 brain bucket and index in Vectorize.
 */

import type { ExtractedNode } from './extract'

interface BrainNode {
  id: string
  layer: 'community'
  category: string
  title: string
  content: string
  summary: string
  phase?: string
  factionId?: string
  edition?: string
  sources: Array<{ type: 'youtube' | 'manual'; title: string; url?: string; retrievedAt: string }>
  refs: never[]
  version: 1
  keywords: string[]
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function vectorizeId(nodeId: string): string {
  if (nodeId.length <= 64) return nodeId
  const hash = nodeId.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  return nodeId.substring(0, 56) + '_' + Math.abs(hash).toString(36).padStart(7, '0')
}

function toBrainNode(extracted: ExtractedNode, sourceUrl: string, sourceName: string): BrainNode {
  return {
    id: `community:${slugify(extracted.title)}`,
    layer: 'community',
    category: extracted.category,
    title: extracted.title,
    content: extracted.content,
    summary: extracted.summary,
    factionId: extracted.factionId ?? undefined,
    edition: extracted.edition ?? '11th', // default to target edition per CLAUDE.md Rule 5
    sources: [
      {
        type: sourceUrl.includes('youtube') ? 'youtube' : 'manual',
        title: sourceName,
        url: sourceUrl,
        retrievedAt: new Date().toISOString(),
      },
    ],
    refs: [],
    version: 1,
    keywords: extracted.keywords,
  }
}

interface WriteNodesOpts {
  nodes: ExtractedNode[]
  sourceUrl: string
  sourceName: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
}

/** Bound on read-merge-write retries for R2 conditional writes (see writeConditionally). */
const MAX_R2_WRITE_RETRIES = 5

/**
 * Read-modify-write a JSON object in R2 under an optimistic-concurrency
 * (etag) precondition, retrying the whole read→merge→write cycle when a
 * concurrent writer commits in between.
 *
 * R2Conditional (see @cloudflare/workers-types) has no "must not exist"
 * precondition — only etagMatches/etagDoesNotMatch against a known etag — so
 * the first-ever-write case (key doesn't exist yet) can't be asserted
 * atomically. For that case we do a plain unconditional put, then
 * immediately re-read to detect whether another writer created the key
 * first; if so, we fall into the same retry loop as an etag mismatch.
 *
 * Throws after MAX_R2_WRITE_RETRIES failed attempts rather than silently
 * dropping a writer's data.
 */
async function writeConditionally<T>(
  bucket: R2Bucket,
  key: string,
  merge: (current: T | undefined) => T,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_R2_WRITE_RETRIES; attempt++) {
    const existingObj = await bucket.get(key)
    const etag = existingObj?.etag
    const current = existingObj ? ((await existingObj.json()) as T) : undefined
    const next = merge(current)
    const jsonStr = JSON.stringify(next)

    if (etag !== undefined) {
      const result = await bucket.put(key, jsonStr, { onlyIf: { etagMatches: etag } })
      if (result !== null) return // conditional write succeeded
      // Someone else wrote first — loop and retry with fresh state.
      continue
    }

    // Key doesn't exist yet: no atomic "must not exist" precondition
    // available, so put unconditionally, then re-check for a lost race.
    await bucket.put(key, jsonStr)
    const verify = await bucket.get(key)
    if (verify) {
      const verifyText = (await verify.json()) as T
      if (JSON.stringify(verifyText) === jsonStr) return // our write is the one that landed
      // Another writer created the key concurrently — retry against real state.
      continue
    }
    return
  }

  throw new Error(
    `writeConditionally: exceeded ${MAX_R2_WRITE_RETRIES} retries writing R2 key "${key}" — concurrent writers kept conflicting`,
  )
}

export async function writeNodesToBrain(opts: WriteNodesOpts): Promise<{ written: number }> {
  const { nodes, sourceUrl, sourceName, bucket, vectorize, ai } = opts

  // 1. Read existing community.json from R2 to compute what's new (dedup is
  //    read-only here; the authoritative merge happens again, against
  //    possibly-fresher state, inside writeConditionally below).
  let existingNodes: BrainNode[] = []
  const communityObj = await bucket.get('nodes/community.json')
  if (communityObj) {
    existingNodes = (await communityObj.json()) as BrainNode[]
  }

  const existingIds = new Set(existingNodes.map((n) => n.id))

  // 2. Convert and deduplicate against the snapshot read above.
  const newBrainNodes: BrainNode[] = []
  for (const extracted of nodes) {
    const brainNode = toBrainNode(extracted, sourceUrl, sourceName)
    if (existingIds.has(brainNode.id)) continue
    existingIds.add(brainNode.id)
    newBrainNodes.push(brainNode)
  }

  if (newBrainNodes.length === 0) return { written: 0 }

  // 3. Conditionally write community.json: re-read + re-merge against
  // current R2 state on every attempt so a concurrent writer's nodes are
  // never clobbered, only appended alongside.
  console.log(`Writing community.json: ${newBrainNodes.length} new nodes`)
  await writeConditionally<BrainNode[]>(bucket, 'nodes/community.json', (current) => {
    const base = current ?? []
    const baseIds = new Set(base.map((n) => n.id))
    const toAppend = newBrainNodes.filter((n) => !baseIds.has(n.id))
    return [...base, ...toAppend]
  })
  console.log('R2 PUT complete')

  // 4. Conditionally update manifest.json (independent key, independent race).
  await writeConditionally<{ files: Record<string, string> }>(
    bucket,
    'manifest.json',
    (current) => {
      const manifest = current ?? { files: {} }
      manifest.files['nodes/community.json'] = String(Date.now())
      return manifest
    },
  )

  // 5. Embed and index new nodes in Vectorize
  const BATCH_SIZE = 50
  for (let i = 0; i < newBrainNodes.length; i += BATCH_SIZE) {
    const batch = newBrainNodes.slice(i, i + BATCH_SIZE)
    const texts = batch.map((n) => `${n.title}. ${n.summary}. ${n.keywords.join(', ')}`)

    const embResult = (await ai.run('@cf/baai/bge-base-en-v1.5', { text: texts })) as {
      data: number[][]
    }

    const vectors = batch.map((node, idx) => ({
      id: vectorizeId(node.id),
      values: embResult.data[idx]!,
      metadata: {
        originalId: node.id,
        title: node.title,
        summary: node.summary.substring(0, 500),
        layer: node.layer,
        category: node.category,
        factionId: node.factionId ?? '',
        phase: '',
      },
    }))

    await vectorize.upsert(vectors)
  }

  return { written: newBrainNodes.length }
}
