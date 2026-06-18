const LAYERS = [
  { id: 'core', label: 'Core Rules' },
  { id: 'faction', label: 'Faction' },
  { id: 'unit', label: 'Units' },
  { id: 'errata', label: 'Errata' },
  { id: 'balance', label: 'Balance' },
  { id: 'community', label: 'Community' },
] as const

export function LayerNav({
  selectedLayer,
  onLayerSelect,
}: {
  selectedLayer: string | null
  onLayerSelect: (layer: string) => void
}) {
  return (
    <nav className="space-y-1">
      {LAYERS.map((layer) => (
        <button
          key={layer.id}
          onClick={() => onLayerSelect(layer.id)}
          className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${
            selectedLayer === layer.id
              ? 'bg-amber-400 text-slate-950'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          {layer.label}
        </button>
      ))}
    </nav>
  )
}
