# apps/no-cheat/client/src/components/CalibrationWizard.tsx

> 4-step wizard for CV pipeline calibration: Background → Place Dice → Label Faces → Test Roll.

## Prompt

Write a 4-step calibration wizard component that prepares the CV pipeline for a dice recording session.

### Props

`diceSetId: string`, `onComplete(pipeline: TrainedPipeline)`, `onCancel()`

### Steps

1. **Capture Background** — User points camera at empty rolling surface. One frame captured and stored as background reference. "Capture Background" button.

2. **Place Dice** — Instruction screen: "Place your dice on the surface and hold still." Captures a frame with dice, runs pipeline to detect them, shows preview with bounding boxes.

3. **Label Faces** — For each detected die face, show the ROI image and ask user to confirm or correct the pip count (1-6 buttons). Saves labeled examples to the training store (IndexedDB).

4. **Test Roll** — User rolls dice, captures a frame, pipeline runs and displays detected values with bounding boxes. "Does this look correct?" with three buttons: Recalibrate (restart), Retest (try again), Start Recording (complete).

### Step indicator

Numbered progress dots at top of wizard (1-4), current step highlighted in amber.

### Camera integration

Uses `<Camera>` component for video feed. Pipeline processes frames via `createTrainedPipeline()`.

## Dependencies

- Camera, pipeline, training store components
