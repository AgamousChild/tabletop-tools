# apps/list-builder/client/src/components/RatingBadge.tsx

> Colored tier badge for unit meta ratings (S/A/B/C/D).

## Prompt

Write a small presentational component that displays a unit's meta rating as a colored badge.

### Props

`rating: string | null | undefined`

### Color logic

`colorFor(rating)`:
- S or A → green (`bg-emerald-500 text-slate-950`)
- B or C → amber (`bg-amber-400 text-slate-950`)
- D or anything else → red (`bg-red-500 text-slate-100`)

### Rendering

- If `rating` is null/undefined: show a dash "—" in a neutral gray badge (`bg-slate-700 text-slate-400`)
- Otherwise: show the rating letter in the colored badge

Use `inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold` for the badge styling.

## Dependencies

None — pure presentational.
