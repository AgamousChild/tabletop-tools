const TASKS = [
  { id: 25, subject: 'Fix brain retrieval for matchup queries', category: 'review', priority: 1, status: 'pending' },
  { id: 26, subject: 'Fix brain Ask prompt template', category: 'review', priority: 1, status: 'pending' },
  { id: 28, subject: 'Turso: update all Worker secrets to new URL', category: 'auto', priority: 1, status: 'completed' },
  { id: 30, subject: 'New-meta: add detachment data to cube', category: 'auto', priority: 2, status: 'completed' },
  { id: 37, subject: 'New-meta: add proper schema to packages/db/schema.ts', category: 'auto', priority: 2, status: 'completed' },
  { id: 31, subject: 'Content ingestor: auto-review Red Path drafts', category: 'auto', priority: 2, status: 'completed' },
  { id: 32, subject: 'Content ingestor: auto-review Warphammer Math remaining 610', category: 'auto', priority: 2, status: 'completed' },
  { id: 34, subject: 'Brain: revert Ask model to configurable', category: 'auto', priority: 2, status: 'completed' },
  { id: 36, subject: 'BCP: paginate event scan beyond 155 events', category: 'auto', priority: 3, status: 'pending' },
  { id: 47, subject: 'BCP: scrape all 10th edition GTs + US RTTs 20+ players', category: 'auto', priority: 3, status: 'pending' },
  { id: 27, subject: 'Fix first turn scraper checkbox detection', category: 'review', priority: 3, status: 'pending' },
  { id: 29, subject: 'New-meta: build Hutber/StatCheck quality dashboard UI', category: 'review', priority: 3, status: 'pending' },
  { id: 50, subject: 'New-meta: fix OverRep calculation', category: 'review', priority: 2, status: 'pending' },
  { id: 44, subject: 'New-meta: improve list viewer — parse army lists as structured data', category: 'review', priority: 4, status: 'pending' },
  { id: 48, subject: 'Admin: YouTube channel manager — add channels, auto-process 24/7', category: 'design', priority: 3, status: 'pending' },
  { id: 35, subject: 'Admin: set up routines for pipeline job control', category: 'design', priority: 4, status: 'pending' },
  { id: 45, subject: 'Lists: convert army lists to TTT standard format', category: 'design', priority: 4, status: 'pending' },
  { id: 38, subject: 'List Builder: overhaul with designed interface', category: 'design', priority: 5, status: 'pending' },
  { id: 42, subject: 'List Builder: use brain detachment/unit cards for display', category: 'design', priority: 5, status: 'pending' },
  { id: 39, subject: 'Game Tracker: overhaul with designed UI + data model changes', category: 'design', priority: 5, status: 'pending' },
  { id: 40, subject: 'No-Cheat: integrate Python vision model for dice detection', category: 'design', priority: 5, status: 'pending' },
  { id: 41, subject: 'Versus: add strat/detachment/ability selectors — auto-apply in sim', category: 'design', priority: 5, status: 'pending' },
  { id: 43, subject: 'Tournament: BCP integration — sync events, dual registration', category: 'design', priority: 5, status: 'pending' },
  { id: 46, subject: '11th Edition: prepare platform for June launch', category: 'design', priority: 2, status: 'pending' },
  { id: 49, subject: 'Admin: add project task list page', category: 'auto', priority: 1, status: 'completed' },
]

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: 'Automated', color: 'text-emerald-400 bg-emerald-400/10' },
  review: { label: 'Needs Review', color: 'text-amber-400 bg-amber-400/10' },
  design: { label: 'Needs Design Input', color: 'text-purple-400 bg-purple-400/10' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-slate-400' },
  'in_progress': { label: 'In Progress', color: 'text-amber-400' },
  completed: { label: 'Done', color: 'text-emerald-400' },
}

export function TasksPage() {
  const sorted = [...TASKS].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (b.status === 'completed' && a.status !== 'completed') return -1
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.id - b.id
  })

  const total = TASKS.length
  const done = TASKS.filter(t => t.status === 'completed').length
  const inProgress = TASKS.filter(t => t.status === 'in_progress').length
  const pending = TASKS.filter(t => t.status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Project Tasks</h1>
        <p className="text-slate-400 text-sm mt-1">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex gap-4 text-sm">
        <span className="text-slate-400">{total} total</span>
        <span className="text-emerald-400">{done} done</span>
        <span className="text-amber-400">{inProgress} in progress</span>
        <span className="text-slate-500">{pending} pending</span>
      </div>

      <div className="w-full bg-slate-800 rounded-full h-2">
        <div
          className="bg-emerald-400 rounded-full h-2 transition-all"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
            <th className="pb-2 pr-3">P</th>
            <th className="pb-2 pr-4">Task</th>
            <th className="pb-2 pr-3">Category</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(task => {
            const cat = CATEGORY_LABELS[task.category] ?? { label: task.category, color: 'text-slate-400' }
            const status = STATUS_LABELS[task.status] ?? { label: task.status, color: 'text-slate-400' }
            const dimmed = task.status === 'completed' ? 'opacity-40' : ''

            return (
              <tr key={task.id} className={`border-b border-slate-800/50 ${dimmed}`}>
                <td className="py-2 pr-3 text-slate-500 font-mono">{task.priority}</td>
                <td className="py-2 pr-4 text-slate-100">
                  <span className="text-slate-600 text-xs mr-2">#{task.id}</span>
                  {task.subject}
                </td>
                <td className="py-2 pr-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
                </td>
                <td className={`py-2 text-xs ${status.color}`}>{status.label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
