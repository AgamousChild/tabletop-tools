# apps/no-cheat/client/src/components/TrainingScreen.tsx

> Training data management — view/delete training examples and frames, export YOLO dataset.

## Prompt

Write a screen for managing CV training data for a dice set. Shows training statistics (accuracy, per-label counts), lists training examples with ROI images, and provides buttons to export dataset for YOLO training or upload examples to the server.

Uses `trpc.training.list/getStats/saveExamples/delete/listFrames/exportDataset/deleteFrame` queries and mutations.
