# apps/no-cheat/server/src/routers/index.ts

> Root router — health + diceSet + session + training.

## Prompt

Mount `diceSetRouter`, `sessionRouter`, `trainingRouter` under their respective namespaces plus a `health` public query. Import from local `../trpc`.
