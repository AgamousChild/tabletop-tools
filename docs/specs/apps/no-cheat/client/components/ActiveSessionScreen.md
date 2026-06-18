# apps/no-cheat/client/src/components/ActiveSessionScreen.tsx

> The core recording experience — camera feed, CV pipeline, auto-capture, real-time stats.

## Prompt

Write the active dice rolling session screen. This is the most complex component in no-cheat (~500 lines). It manages the camera, CV pipeline, auto-capture, and real-time statistical display.

### Props

`diceSet: { id, name }`, `onDone: () => void`

### Phases (discriminated union)

```typescript
type Phase =
  | { name: 'starting' }                  // creating session on server
  | { name: 'calibrating'; sessionId }    // CalibrationWizard for CV pipeline setup
  | { name: 'recording'; sessionId, rollCount, zScore, chiSquared, distribution }
  | { name: 'closing'; sessionId, rollCount }
  | { name: 'result'; sessionId, result }
  | { name: 'evidence'; sessionId }       // photo capture for loaded dice
```

### Recording phase behavior

1. Camera feed via `<Camera>` component + `getMainCamera()`
2. Create a `TrainedPipeline` via `createTrainedPipeline(diceSetId)`
3. Load k-NN training examples from IndexedDB via `getExamples(diceSetId)`
4. Process each video frame through the pipeline → get `RoiResult[]`
5. Draw bounding boxes on a canvas overlay (emerald boxes with pip labels)
6. **Auto-capture**: detect stable dice (same pip values for ~0.7s), auto-submit to server via `trpc.session.addRoll.mutate()`, wait for dice removal before next detection
7. Show `<StatsOverlay>` with real-time Z-score, chi-squared, distribution
8. "Complete" button → close session on server → show result

### Training integration

During recording, each detected die face is optionally shown as a `<DiceCheckCard>` for the user to confirm or correct the pip count. Corrections feed back into the k-NN training store.

## Dependencies

- `react` — `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState`
- `../lib/cv/pipeline` — `RoiResult`, `DEFAULT_CONFIG`, `Roi`
- `../lib/cv/trainedPipeline` — `createTrainedPipeline`
- `../lib/cv/mlPipeline` — `createMlPipeline`
- `../lib/cv/features` — `extractFeatures`
- `../lib/cv/knnClassifier` — `classifyKnn`, `TrainingExample`
- `../lib/cv/background` — `rgbaToGray`
- `../lib/cv/blobDetector` — `detectPips`
- `../lib/store/trainingStore` — `addExample`, `getExamples`
- `../lib/getMainCamera` — `getMainCamera`
- `@tabletop-tools/ui` — `HelpTip`
- `../lib/trpc` — `trpc`
- Sub-components: `CalibrationWizard`, `Camera`, `DiceCheckCard`, `ResultScreen`, `StatsOverlay`
