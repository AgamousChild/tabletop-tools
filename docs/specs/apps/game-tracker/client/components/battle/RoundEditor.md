# apps/game-tracker/client/src/components/battle/RoundEditor.tsx

> Edit a previously saved round's data (VP, CP, notes).

## Prompt

Write a form component for editing a past round's data. Shows when user taps a completed round.

### Props

`turn` (object with: id, turnNumber, and all per-player fields), `onSave(data)`, `onCancel()`, `isSaving`.

### Fields (editable)

- Your Primary VP, Their Primary VP
- Your CP Gained, Their CP Gained
- Notes

The update data type only includes the editable subset, not photos or unit lists.

### Behavior

Initialize local state from the turn's current values. On save, call `onSave` with the modified values. Show "Saving..." state while `isSaving`.

## Dependencies

- `react` — `useState`
