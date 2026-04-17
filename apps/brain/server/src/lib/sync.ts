import type { Node, NodeRef } from './model'
import type { BrainManifest } from '../types'
import { mergeSources } from './merge-sources'

/**
 * Partition nodes into files by layer and faction.
 * Returns a map of filename -> Node[].
 */
export function partitionNodes(nodes: Node[]): Record<string, Node[]> {
  const files: Record<string, Node[]> = {}

  for (const node of nodes) {
    let filename: string
    switch (node.layer) {
      case 'core':
        filename = 'nodes/core.json'
        break
      case 'faction':
      case 'unit':
        filename = `nodes/faction-${node.factionId || 'unknown'}.json`
        break
      case 'errata':
        filename = 'nodes/errata.json'
        break
      case 'balance':
        filename = 'nodes/balance.json'
        break
      case 'community':
        filename = 'nodes/community.json'
        break
      default:
        filename = 'nodes/other.json'
    }
    if (!files[filename]) files[filename] = []
    files[filename]!.push(node)
  }

  return files
}

/**
 * Partition refs into files matching their target node's file.
 * Each ref file contains edges pointing to nodes in the corresponding node file.
 */
export function partitionRefs(
  refs: NodeRef[],
  nodeFileMap: Map<string, string>,
): Record<string, NodeRef[]> {
  const files: Record<string, NodeRef[]> = {}

  for (const ref of refs) {
    const sourceFile = nodeFileMap.get(ref.targetId)
    const refsFile = sourceFile
      ? sourceFile.replace('nodes/', 'refs/').replace('.json', '-refs.json')
      : 'refs/unlinked-refs.json'
    if (!files[refsFile]) files[refsFile] = []
    files[refsFile]!.push(ref)
  }

  return files
}

/** Simple deterministic hash of JSON content for manifest comparison. */
function hashContent(data: unknown): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `hash:${Math.abs(hash).toString(16)}`
}

/**
 * Build a manifest from the files map.
 * Increments version from existing manifest if present.
 */
export function buildManifest(
  files: Record<string, unknown>,
  existing: BrainManifest | null,
): BrainManifest {
  const fileHashes: Record<string, string> = {}
  for (const [name, data] of Object.entries(files)) {
    fileHashes[name] = hashContent(data)
  }

  return {
    version: (existing?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    files: fileHashes,
  }
}

export interface BrainSyncResult {
  success: boolean
  nodeCount: number
  refCount: number
  fileCount: number
  errors: string[]
}

/**
 * Run the full brain sync pipeline.
 * Combines PDF-sourced data (core rules, faction packs, commentary, dataslate)
 * with Wahapedia/BSData game data. Writes partitioned JSON to R2.
 */
export async function runBrainSync(
  bucket: R2Bucket,
  markdownFiles: Record<string, string>,
  gameData: import('./parsers/game-data').GameDataInput | null,
  retrievedAt: string,
): Promise<BrainSyncResult> {
  const errors: string[] = []
  const allNodes: Node[] = []
  const allRefs: NodeRef[] = []

  const { parseCoreRules } = await import('./parsers/core-rules')
  const { parseFactionPack } = await import('./parsers/faction-pack')
  const { parseRulesCommentary } = await import('./parsers/rules-commentary')
  const { parseBalanceDataslate } = await import('./parsers/balance-dataslate')

  // Parse core rules
  if (markdownFiles['core-rules.md']) {
    try {
      const result = parseCoreRules(markdownFiles['core-rules.md']!, retrievedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
    } catch (err) {
      errors.push(`Core rules: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Parse rules commentary
  if (markdownFiles['core-rules-updates-and-rules-commentary.md']) {
    try {
      const result = parseRulesCommentary(markdownFiles['core-rules-updates-and-rules-commentary.md']!, retrievedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
    } catch (err) {
      errors.push(`Rules commentary: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Parse balance dataslate
  if (markdownFiles['balance-dataslate.md']) {
    try {
      const result = parseBalanceDataslate(markdownFiles['balance-dataslate.md']!, retrievedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
    } catch (err) {
      errors.push(`Balance dataslate: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Parse faction packs
  for (const [filename, content] of Object.entries(markdownFiles)) {
    if (!filename.startsWith('faction-pack-')) continue
    const factionSlug = filename.replace('faction-pack-', '').replace('.md', '')
    try {
      const result = parseFactionPack(content, factionSlug, retrievedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
    } catch (err) {
      errors.push(`Faction ${factionSlug}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Convert Wahapedia/BSData game data
  if (gameData) {
    try {
      const { convertGameData } = await import('./parsers/game-data')
      const result = convertGameData(gameData, retrievedAt)
      allNodes.push(...result.nodes)
      allRefs.push(...result.refs)
    } catch (err) {
      errors.push(`Game data: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Merge and deduplicate nodes from all sources
  const mergeResult = mergeSources(allNodes, allRefs)
  allNodes.length = 0
  allNodes.push(...mergeResult.nodes)
  allRefs.length = 0
  allRefs.push(...mergeResult.refs)

  // Partition nodes into files
  const nodeFiles = partitionNodes(allNodes)

  // Build node-to-file mapping for ref partitioning
  const nodeFileMap = new Map<string, string>()
  for (const [filename, nodes] of Object.entries(nodeFiles)) {
    for (const node of nodes) {
      nodeFileMap.set(node.id, filename)
    }
  }

  // Partition refs
  const refFiles = partitionRefs(allRefs, nodeFileMap)

  // Build indexes for graph traversal
  const nodeMap = new Map<string, Node>()
  for (const node of allNodes) nodeMap.set(node.id, node)

  // Reverse index: targetId → [{sourceId, rel, context, factionId}]
  // "What points TO this node?"
  const reverseIndex: Record<string, Array<{ sourceId: string; rel: string; context: string; factionId?: string }>> = {}
  // Forward index: sourceId → [{targetId, rel, context}]
  // "What does this node point TO?" (for resolving part_of parents, etc.)
  const forwardIndex: Record<string, Array<{ targetId: string; rel: string; context: string }>> = {}

  for (const ref of allRefs) {
    if (!reverseIndex[ref.targetId]) reverseIndex[ref.targetId] = []
    const sourceNode = nodeMap.get(ref.sourceId)
    reverseIndex[ref.targetId]!.push({
      sourceId: ref.sourceId,
      rel: ref.rel,
      context: ref.context.substring(0, 120),
      factionId: sourceNode?.factionId,
    })

    if (!forwardIndex[ref.sourceId]) forwardIndex[ref.sourceId] = []
    forwardIndex[ref.sourceId]!.push({
      targetId: ref.targetId,
      rel: ref.rel,
      context: ref.context.substring(0, 120),
    })
  }

  // Combine all files
  const allFiles: Record<string, unknown> = {
    ...nodeFiles,
    ...refFiles,
    'refs/reverse-index.json': reverseIndex,
    'refs/forward-index.json': forwardIndex,
  }

  // Read existing manifest
  let existingManifest: BrainManifest | null = null
  try {
    const obj = await bucket.get('manifest.json')
    if (obj) existingManifest = await obj.json() as BrainManifest
  } catch { /* no existing manifest */ }

  // Build and write manifest
  const manifest = buildManifest(allFiles, existingManifest)

  // Write all files to R2
  for (const [filename, data] of Object.entries(allFiles)) {
    await bucket.put(filename, JSON.stringify(data))
  }
  await bucket.put('manifest.json', JSON.stringify(manifest))

  return {
    success: errors.length === 0,
    nodeCount: allNodes.length,
    refCount: allRefs.length,
    fileCount: Object.keys(allFiles).length,
    errors,
  }
}
