/**
 * vectorize-corpus.ts — Compose the text-to-embed for each brain node at
 * index time.
 *
 * The datasheet's `content` field is intentionally minimal (title, faction,
 * keywords, points, composition, wargear options, damaged profile) — full
 * ability bodies live on their own `unit-ability` nodes and full weapon
 * detail lives on `weapon` nodes. Storing them once and once only is the
 * whole point of the datasheet-content-duplication fix.
 *
 * But semantic search still needs the datasheet to surface for
 * ability-related queries ("sustained hits", "twice per battle", etc.).
 * We fix that at the index layer, not the storage layer: at index time we
 * compose a per-datasheet corpus by concatenating the datasheet's content
 * with all of its child ability bodies and weapon bodies. Everything else
 * (weapons, abilities, stratagems, rules, etc.) uses the old
 * `title + summary + keywords` formula.
 */
import type { Node } from './model'

/**
 * Look up all `unit-ability` and `weapon` child nodes for a datasheet.
 * Children are matched by `datasheetId === datasheet.id` and the appropriate
 * category. The match set is small (typical datasheet has < 15 children), so
 * we use a simple linear scan; callers that index many datasheets in a batch
 * can precompute a `childrenByDatasheetId` map instead.
 */
export function collectDatasheetChildren(
  datasheet: Node,
  allNodes: readonly Node[],
): { abilities: Node[]; weapons: Node[] } {
  const abilities: Node[] = []
  const weapons: Node[] = []
  for (const n of allNodes) {
    if (n.datasheetId !== datasheet.id) continue
    if (n.category === 'unit-ability') abilities.push(n)
    else if (n.category === 'weapon') weapons.push(n)
  }
  return { abilities, weapons }
}

/**
 * Compose the text-to-embed for a **datasheet** node.
 *
 * Corpus shape: `title. summary. keywords. content. ability1 ability2 ...
 * weapon1 weapon2 ...`
 *
 * The datasheet's own `content` is included so the header/stat/keyword band
 * still contributes. Ability + weapon bodies are appended so ability-text
 * queries still resolve to the parent datasheet even though the storage
 * layer keeps those bodies on separate nodes.
 */
export function buildDatasheetCorpus(datasheet: Node, allNodes: readonly Node[]): string {
  const { abilities, weapons } = collectDatasheetChildren(datasheet, allNodes)
  return buildDatasheetCorpusFromParts(datasheet, abilities, weapons)
}

/**
 * Same as `buildDatasheetCorpus` but takes the abilities + weapons directly.
 * Preferred inside a batch loop that has already precomputed the children
 * index.
 */
export function buildDatasheetCorpusFromParts(
  datasheet: Node,
  abilities: readonly Node[],
  weapons: readonly Node[],
): string {
  const abilityText = abilities.map(abilityCorpus).filter(Boolean).join(' ')
  const weaponText = weapons.map(weaponCorpus).filter(Boolean).join(' ')
  const keywordText = datasheet.keywords.join(', ')
  const parts = [
    `${datasheet.title}.`,
    `${datasheet.summary}.`,
    keywordText ? `${keywordText}.` : '',
    datasheet.content,
    abilityText,
    weaponText,
  ]
  return parts.filter(Boolean).join(' ').trim()
}

/**
 * Default text-to-embed formula for any node that isn't a datasheet.
 * Kept identical to the pre-refactor behaviour in `worker.ts::/index-vectors`.
 */
export function buildDefaultCorpus(node: Node): string {
  return `${node.title}. ${node.summary}. ${node.keywords.join(', ')}`
}

function abilityCorpus(ab: Node): string {
  // Include the title so short "flavour" queries hit even when the body is
  // vague, and the content so ability-text queries resolve.
  const body = (ab.content || '').trim()
  if (!body) return ab.title
  return `${ab.title}: ${body}`
}

function weaponCorpus(w: Node): string {
  // Weapon `content` is a short markdown block ("Range: 24 | Type: Ranged
  // ... anti-infantry 4+"). It's the ability-carrying part of the row.
  const body = (w.content || '').trim()
  if (!body) return w.title
  return `${w.title}: ${body}`
}

/**
 * Compose the text-to-embed for a node. Dispatches on category:
 *   - `datasheet` → `buildDatasheetCorpus`
 *   - everything else → `buildDefaultCorpus`
 *
 * `allNodes` is only consulted when `node.category === 'datasheet'`.
 */
export function buildCorpusForNode(node: Node, allNodes: readonly Node[]): string {
  if (node.category === 'datasheet') return buildDatasheetCorpus(node, allNodes)
  return buildDefaultCorpus(node)
}
