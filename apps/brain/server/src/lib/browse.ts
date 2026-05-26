import type { Node } from './model'

/** Categories that are children of a container — never shown in browse. */
const CHILD_CATEGORIES = new Set([
  'weapon',
  'unit-ability',
  'wargear-option',
  'leader-attachment',
  'unit-composition',
])

/** Filter nodes to only top-level browse-worthy records. */
export function filterBrowseNodes(nodes: Node[]): Node[] {
  return nodes.filter((n) => {
    if (CHILD_CATEGORIES.has(n.category)) return false
    // Exclude army-rule sub-rules (title has "(ParentName)" suffix and is a faction-ability without detachmentId)
    if (n.category === 'faction-ability' && !n.detachmentId && /\([^)]+\)\s*$/.test(n.title))
      return false
    return true
  })
}
