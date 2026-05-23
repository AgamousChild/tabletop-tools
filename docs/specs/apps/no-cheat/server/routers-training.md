# apps/no-cheat/server/src/routers/training.ts

> ML training data management — save/list/delete training examples and YOLO bounding box frames.

## Prompt

Write a tRPC router `trainingRouter` for managing computer vision training data. All endpoints protected.

### Training examples (per-ROI kNN data)

**`saveExamples`:** Accept `{ diceSetId, examples: [{label (0-6), guess?, confidence?, features: number[], imageBase64}] }`. Max 20 per call. Verify dice set ownership. For each example: decode base64 → upload ROI image to R2 as PNG → insert into `trainingExamples` with userId, diceSetId, label, guess, confidence, features (JSON), imageUrl, isCorrect (1 if label===guess, 0 if not, null if no guess). Return count saved.

**`list`:** Accept optional filters: `diceSetId`, `myOnly` (boolean), `label` (int 0-6), `limit` (1-100, default 50), `offset` (default 0). Build dynamic WHERE conditions. Order by createdAt desc. Return `{ examples }`.

**`getStats`:** Accept `{ diceSetId }`. Query all examples for that dice set. Compute: total count, correct count (isCorrect===1), accuracy (correct/total), per-label distribution. Return `{ total, correct, accuracy, perLabel: Record<number, number> }`.

**`delete`:** Accept `{ id }`. Verify example belongs to user. Delete.

### Training frames (full-frame YOLO data)

**`saveFrame`:** Accept `{ diceSetId, imageBase64, frameWidth, frameHeight, boxes: [{x, y, w, h, label (1-6)}] }`. Boxes are normalized 0-1. Upload frame image to R2 as PNG. Insert into `trainingFrames` with boxesJson (JSON of boxes array).

**`listFrames`:** Accept optional `diceSetId`, `limit` (1-500, default 50), `offset`. Parse boxesJson from each row. Return `{ frames }`.

**`exportDataset`:** Accept optional `diceSetId`. Query all frames. Map to YOLO format: `classId = label - 1` (pip 1 → class 0). Return `{ dataset, classNames: {0:'1', 1:'2', ...5:'6'}, totalFrames }`.

**`deleteFrame`:** Accept `{ id }`. Verify ownership. Delete.

## Dependencies

- `@tabletop-tools/db` — `diceSets`, `trainingExamples`, `trainingFrames`
- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `and`, `count`, `desc`, `eq`, `sql`
- `zod` — `z`
- `../trpc` — `protectedProcedure`, `router`
