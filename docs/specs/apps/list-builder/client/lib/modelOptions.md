# apps/list-builder/client/src/lib/modelOptions.ts

> Parse model count options from Wahapedia data — identical logic to versus/modelCount.ts.

## Prompt

Same as `versus/client/src/lib/modelCount.ts` but without the `parseModelCount` function. Only export `ModelOption` type and `parseModelOptions(compositions, costs)`.

Same `extractModelCount` helper, same cross-reference by `line` field, same sort by modelCount ascending.

## Dependencies

- `@tabletop-tools/game-data-store` — `UnitComposition`, `UnitCost` (types)
