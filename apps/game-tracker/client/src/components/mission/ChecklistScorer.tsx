export type ChecklistItem = { id: string; label: string; checked: boolean }

type Props = {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void
}

export function ChecklistScorer({ items, onChange }: Props) {
  function toggle(id: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => toggle(item.id)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-400"
          />
          <span className="text-sm text-slate-300">{item.label}</span>
        </label>
      ))}
    </div>
  )
}
