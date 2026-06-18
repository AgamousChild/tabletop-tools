/**
 * LayoutRenderer — interprets a `CardLayout` descriptor tree and renders it as
 * React elements.  No per-category knowledge lives here; it only understands the
 * primitive node types defined in `shared/card-layout-types.ts`.
 */

import type {
  AbilityNode,
  BoxNode,
  CardLayout,
  CardLayoutNode,
  DividerNode,
  HeaderNode,
  HeadingNode,
  KeyValueNode,
  PillListNode,
  StatBarNode,
  TableNode,
  TextNode,
} from '../../../../shared/card-layout-types'

// ── Colour maps ───────────────────────────────────────────────────────────────

const ACCENT_BG: Record<string, string> = {
  amber: 'bg-amber-600',
  red: 'bg-red-700',
  green: 'bg-green-800',
  blue: 'bg-blue-700',
}

const BADGE_TEXT: Record<string, string> = {
  amber: 'text-amber-400',
  blue: 'text-blue-300',
  green: 'text-green-300',
  red: 'text-red-400',
}

// ── Primitive renderers ───────────────────────────────────────────────────────

function RenderHeader({ node }: { node: HeaderNode }) {
  return (
    <div
      className="px-2 py-2 md:px-3 flex items-start justify-between"
      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #1d4ed8 100%)' }}
    >
      <div>
        <h2
          className="text-xl font-bold uppercase tracking-wide text-white leading-tight"
          style={{ fontFamily: "'Oswald', sans-serif" }}
        >
          {node.title}
        </h2>
        {node.subtitle && (
          <div className="text-[13px] text-blue-200 mt-0.5 uppercase tracking-wide">
            {node.subtitle}
          </div>
        )}
      </div>
      {node.badge && (
        <div className="ml-3 text-right flex-shrink-0">
          <span
            className={`font-bold text-[15px] ${node.badgeColor ? BADGE_TEXT[node.badgeColor] : 'text-amber-400'}`}
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {node.badge}
          </span>
        </div>
      )}
    </div>
  )
}

function RenderStatBar({ node }: { node: StatBarNode }) {
  return (
    <div
      data-testid="stat-bar"
      className="bg-slate-800 border-b border-slate-700 px-2 py-1.5 flex flex-wrap items-center justify-around gap-1"
    >
      {node.stats.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center min-w-[32px]">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
            {label}
          </span>
          <span
            className="text-[17px] font-bold text-white leading-tight"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

function RenderTable({ node }: { node: TableNode }) {
  if (node.rows.length === 0) return null
  const headerBg = node.accentColor ? ACCENT_BG[node.accentColor] : ACCENT_BG.amber

  return (
    <div className="mb-2">
      <div
        className={`${headerBg} text-white text-[11px] font-bold uppercase tracking-widest px-2 py-0.5`}
      >
        {node.label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] md:text-[13px] border-collapse">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-[9px] md:text-[10px] uppercase tracking-wider">
              {node.columns.map((col) => (
                <th
                  key={col}
                  className={`py-0.5 font-medium ${col === node.columns[0] ? 'text-left px-2' : 'text-center px-1'}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, i) => (
              <tr key={i} className="bg-slate-900 border-b border-slate-700 odd:bg-slate-850">
                {row.cells.map((cell, j) => (
                  <td
                    key={j}
                    className={`py-0.5 text-slate-300 ${j === 0 ? 'text-left px-2 text-slate-200' : 'text-center px-1'}`}
                  >
                    {cell}
                    {j === 0 && row.tags && row.tags.length > 0 && (
                      <span className="ml-1 inline-flex flex-wrap gap-1">
                        {row.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-semibold uppercase tracking-wide bg-slate-700 text-amber-300 px-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RenderHeading({ node }: { node: HeadingNode }) {
  const bg = node.accentColor ? ACCENT_BG[node.accentColor] : ACCENT_BG.green
  return (
    <div
      className={`${bg} text-white text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 mb-2`}
    >
      {node.text}
    </div>
  )
}

function RenderKeyValue({ node }: { node: KeyValueNode }) {
  return (
    <div>
      <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
        {node.label}:{' '}
      </span>
      <span className="text-slate-300 text-[11px]">{node.value}</span>
    </div>
  )
}

function RenderPillList({ node }: { node: PillListNode }) {
  if (node.pills.length === 0) return null

  const pillClass = (variant: PillListNode['pills'][number]['variant']) => {
    switch (variant) {
      case 'faction':
        return 'text-[11px] text-blue-300 bg-blue-900/40 border border-blue-800 px-1.5 py-0.5 rounded'
      case 'amber':
        return 'text-[10px] font-semibold uppercase tracking-wide bg-slate-800 border border-slate-600 text-amber-300 px-1.5 py-0.5 rounded'
      case 'green':
        return 'text-[10px] font-semibold uppercase tracking-wide bg-slate-800 border border-green-600 text-green-300 px-1.5 py-0.5 rounded'
      default:
        return 'text-[11px] text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded'
    }
  }

  return (
    <div className="flex flex-wrap gap-1 items-center px-3 py-1.5 bg-slate-800 border-b border-slate-700">
      {node.label && (
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mr-1">
          {node.label}:
        </span>
      )}
      {node.pills.map(({ text, variant }) => (
        <span key={text} className={pillClass(variant)}>
          {text}
        </span>
      ))}
    </div>
  )
}

function RenderAbility({ node }: { node: AbilityNode }) {
  return (
    <div className="rounded border border-green-800 bg-green-950/30 p-1.5">
      <span className="text-xs font-bold text-green-200 uppercase tracking-wide block">
        {node.name}
      </span>
      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{node.description}</p>
    </div>
  )
}

function RenderDivider(_props: { node: DividerNode }) {
  return <hr className="border-slate-700 my-1" />
}

function RenderText({ node }: { node: TextNode }) {
  const sizeClass = node.size === 'xs' ? 'text-[11px]' : 'text-sm'
  const colorClass = node.muted ? 'text-slate-400' : 'text-slate-300'
  return <p className={`${sizeClass} ${colorClass} whitespace-pre-line`}>{node.value}</p>
}

// ── Recursive dispatcher ──────────────────────────────────────────────────────

function RenderNode({
  node,
  index,
}: {
  node: CardLayoutNode
  index?: number
}): React.ReactElement | null {
  const key = index ?? 0
  switch (node.type) {
    case 'header':
      return <RenderHeader key={key} node={node} />
    case 'stat-bar':
      return <RenderStatBar key={key} node={node} />
    case 'table':
      return <RenderTable key={key} node={node} />
    case 'heading':
      return <RenderHeading key={key} node={node} />
    case 'key-value':
      return <RenderKeyValue key={key} node={node} />
    case 'pill-list':
      return <RenderPillList key={key} node={node} />
    case 'ability':
      return <RenderAbility key={key} node={node} />
    case 'divider':
      return <RenderDivider key={key} node={node} />
    case 'text':
      return <RenderText key={key} node={node} />
    case 'box': {
      const dirClass =
        (node as BoxNode).direction === 'row' ? 'flex flex-row gap-2' : 'flex flex-col gap-2'
      return (
        <div key={key} className={dirClass}>
          {(node as BoxNode).children.map((child, i) => (
            <RenderNode key={i} node={child} index={i} />
          ))}
        </div>
      )
    }
  }
}

// ── Public component ──────────────────────────────────────────────────────────

interface LayoutRendererProps {
  layout: CardLayout
}

/**
 * Generic card renderer driven entirely by the `CardLayout` descriptor.
 * No category-specific logic lives here.
 */
export function LayoutRenderer({ layout }: LayoutRendererProps) {
  return (
    <div
      className="rounded-lg overflow-hidden bg-slate-900 border border-slate-700 text-slate-100 font-sans w-full"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      {layout.nodes.map((node, i) => (
        <RenderNode key={i} node={node} index={i} />
      ))}
    </div>
  )
}
