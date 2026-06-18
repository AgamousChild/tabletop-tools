# apps/game-tracker/client/src/components/battle/VpStepper.tsx

> Increment/decrement stepper for victory points and CP values.

## Prompt

Write a simple numeric stepper component. Props: `label` (string), `value` (number), `onChange(value)`, optional `min` (default 0) and `max` (default 20).

Show the label above, then a row of: minus button (disabled at min), the value in amber text, plus button (disabled at max). Both buttons are 8×8 rounded squares with slate-800 background. Add `aria-label` for accessibility: "Decrease {label}" / "Increase {label}".

## Dependencies

None — pure presentational.
