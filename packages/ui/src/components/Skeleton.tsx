/**
 * Loading placeholders that hold the shape of the content they replace.
 *
 * A bare "Loading..." line is indistinguishable from a page that has given up,
 * which is exactly how the new-meta dashboard read while its cube queries ran
 * for several seconds: "it looks like it might load, it might not." A block
 * that occupies the right footprint and animates says the opposite, and it
 * stops the layout jumping when the data lands.
 */

interface SkeletonProps {
  /** Tailwind height class, e.g. `h-4`. */
  height?: string
  /** Tailwind width class, e.g. `w-full`, `w-1/3`. */
  width?: string
  className?: string
}

export function Skeleton({ height = 'h-4', width = 'w-full', className = '' }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded bg-slate-700/50 ${height} ${width} ${className}`}
    />
  )
}

interface SkeletonTableProps {
  rows?: number
  columns?: number
  className?: string
}

/**
 * Stand-in for a data table. Column widths taper so it reads as a table rather
 * than a stack of identical bars.
 */
export function SkeletonTable({ rows = 8, columns = 5, className = '' }: SkeletonTableProps) {
  return (
    <div role="status" aria-label="Loading table" className={`space-y-2 ${className}`}>
      <div className="flex gap-4 border-b border-slate-700 pb-2">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} height="h-3" width={c === 0 ? 'w-1/3' : 'w-16'} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 py-1">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height="h-4" width={c === 0 ? 'w-1/3' : 'w-16'} />
          ))}
        </div>
      ))}
    </div>
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
}

/** Stand-in for a paragraph or a stat block. The last line is short, as prose is. */
export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div role="status" aria-label="Loading" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height="h-4" width={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}
