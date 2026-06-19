interface Props {
  value: string
  onChange: (v: string) => void
  resultCount: number
}

export function SearchBar({ value, onChange, resultCount }: Props) {
  return (
    <div className="search-bar">
      <input
        type="search"
        autoFocus
        placeholder="Search slides…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="result-count">
        {value.trim() ? `${resultCount} result${resultCount === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  )
}
