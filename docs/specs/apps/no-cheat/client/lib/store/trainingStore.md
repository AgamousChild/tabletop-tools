# apps/no-cheat/client/src/lib/store/trainingStore.ts

> Client-side IndexedDB store for k-NN training examples — separate from game-data-store.

## Prompt

Write a dedicated IndexedDB store for no-cheat's computer vision training data. This is separate from the main game-data-store because it has a different lifecycle and schema.

### Database

- Name: `no-cheat-training`
- Version: 1
- Stores: `examples` (keyPath: `id`, index: `diceSetId`), `stats` (keyPath: `diceSetId`)

### Types

**`StoredExample`**: `id`, `diceSetId`, `label` (1-6), `features: number[]`, `roiGray: Uint8Array` (raw grayscale pixels of the die face ROI), `roiWidth`, `roiHeight`, `createdAt`.

**`TrainingStats`**: `diceSetId`, `totalGuesses`, `correctGuesses`, `corrections`, `lastTrainedAt`.

### Functions

- `addExample(example: StoredExample): Promise<void>` — save one training example
- `getExamples(diceSetId: string): Promise<StoredExample[]>` — get all examples for a dice set
- `deleteExample(id: string): Promise<void>`
- `clearExamples(diceSetId: string): Promise<void>` — delete all for a dice set
- `getStats(diceSetId: string): Promise<TrainingStats | null>`
- `updateStats(stats: TrainingStats): Promise<void>`

### Why separate from game-data-store

Training data is specific to no-cheat's CV pipeline and includes binary image data (ROI pixels). Mixing it into the shared game-data-store would couple unrelated schemas and make version upgrades riskier.

## Dependencies

None — raw IndexedDB API.
