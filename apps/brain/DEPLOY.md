# Brain Deploy Steps

Every change to the brain requires ALL of these steps. Don't skip any.

## 1. Test
```bash
cd apps/brain/server && pnpm test
cd apps/brain/client && pnpm test
```

## 2. Build graph data
```bash
cd apps/brain/server && npx tsx src/build-graph.ts
```

## 3. Upload graph to R2
```bash
cd apps/brain/server && npx tsx src/upload-graph.ts
```

## 4. Deploy Worker
```bash
cd apps/brain/server && npx wrangler deploy
```

## 5. Re-index vectors (if node data changed)
```bash
# Index all factions
for file in nodes/core.json nodes/errata.json nodes/balance.json nodes/community.json; do
  curl -s -X POST "https://tabletop-tools-brain.micah-ec2.workers.dev/index-vectors?file=$file" \
    -H "Authorization: Bearer brain-sync-secret-2026"
done

# Index each faction (these are big, do them one at a time)
for faction in adepta-sororitas adeptus-custodes adeptus-mechanicus adeptus-titanicus aeldari astra-militarum black-templars blood-angels chaos-daemons chaos-knights chaos-space-marines dark-angels death-guard deathwatch drukhari emperors-children genestealer-cults grey-knights imperial-agents imperial-knights leagues-of-votann necrons orks space-marines space-wolves t-au-empire thousand-sons tyranids world-eaters; do
  curl -s -X POST "https://tabletop-tools-brain.micah-ec2.workers.dev/index-vectors?file=nodes/faction-${faction}.json" \
    -H "Authorization: Bearer brain-sync-secret-2026"
done
```

## 6. Build and deploy client + gateway
```bash
cd apps/brain/client && npx vite build
cd apps/gateway && rm -rf dist && bash build.sh
cd apps/gateway && npx wrangler pages deploy dist --project-name tabletop-tools
```

## Quick deploy (Worker only, no data changes)
```bash
cd apps/brain/server && pnpm test && npx wrangler deploy
```

## Quick deploy (client only)
```bash
# IMPORTANT: clean tsc cache to prevent stale builds
cd apps/brain/client && rm -f tsconfig.tsbuildinfo && rm -rf node_modules/.vite && npx vite build
cd apps/gateway && rm -rf dist && bash build.sh && npx wrangler pages deploy dist --project-name tabletop-tools --commit-dirty=true
```

## Full deploy (everything)
```bash
cd apps/brain/server && pnpm test
cd apps/brain/server && npx tsx src/build-graph.ts
cd apps/brain/server && npx tsx src/upload-graph.ts
cd apps/brain/server && npx wrangler deploy
# re-index vectors as needed
cd apps/brain/client && npx vite build
cd apps/gateway && rm -rf dist && bash build.sh
cd apps/gateway && npx wrangler pages deploy dist --project-name tabletop-tools
```
