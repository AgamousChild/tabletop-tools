# apps/new-meta/client/src/components/MetaWindowSelector.tsx

> Dropdown for selecting the time frame for meta analytics queries.

## Prompt

Write a `<select>` dropdown that lets users choose a meta analytics time frame. Uses `trpc.meta.frames.useQuery()` to get available frames.

Props: `value: string | undefined`, `onChange(value: string | undefined)`.

Groups frames by type into `<optgroup>` sections:
- Quarters (typeId 4) — e.g., "2025 Q2"
- Months (typeId 3) — e.g., "2025-04"
- Years (typeId 5)
- Balance Dataslates (typeId 6)

First option: "Latest Quarter" (value = empty string → undefined).

## Dependencies

- `../lib/trpc` — `trpc`
