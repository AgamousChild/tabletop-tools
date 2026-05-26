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
    factionId: extracted.factionId,
    edition: extracted.edition,
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

export async function writeNodesToBrain(opts: WriteNodesOpts): Promise<{ written: number }> {
  const { nodes, sourceUrl, sourceName, bucket, vectorize, ai } = opts

  // 1. Read existing community.json from R2
  let existingNodes: BrainNode[] = []
  const communityObj = await bucket.get('nodes/community.json')
  if (communityObj) {
    existingNodes = (await communityObj.json()) as BrainNode[]
  }

  const existingIds = new Set(existingNodes.map((n) => n.id))

  // 2. Convert and deduplicate
  const newBrainNodes: BrainNode[] = []
  for (const extracted of nodes) {
    const brainNode = toBrainNode(extracted, sourceUrl, sourceName)
    if (existingIds.has(brainNode.id)) continue
    existingIds.add(brainNode.id)
    newBrainNodes.push(brainNode)
  }

  if (newBrainNodes.length === 0) return { written: 0 }

  // 3. Write new nodes to a separate ingested file (avoids large file read-modify-write)
  // Brain rebuild merges these. Also append to main file.
  const allNodes = [...existingNodes, ...newBrainNodes]
  const jsonStr = JSON.stringify(allNodes)
  console.log(`Writing community.json: ${allNodes.length} nodes, ${jsonStr.length} bytes`)
  await bucket.put('nodes/community.json', jsonStr)
  console.log('R2 PUT complete')

  // 4. Update manifest.json
  const manifestObj = await bucket.get('manifest.json')
  let manifest: { files: Record<string, string> } = { files: {} }
  if (manifestObj) {
    manifest = (await manifestObj.json()) as typeof manifest
  }
  manifest.files['nodes/community.json'] = String(Date.now())
  await bucket.put('manifest.json', JSON.stringify(manifest))

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
