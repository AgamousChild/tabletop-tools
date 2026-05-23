# packages/deployment/src/ — Deployment Solver Package

> 9-phase algorithm for optimal Warhammer 40K unit deployment.

## types.ts
Core types: `GameRulesConfig` (10e defaults: 9" deep strike/infiltrator exclusions, 2" coherency, charge/advance ranges), `Battlefield`, `Objective`, `DeploymentUnit` (with base size, weapons, keywords, abilities), `DeploymentPlan` (placements + reserves + score). `FormationType` enum: block, line, wide-line, dog-bone, blob.

## solver.ts
`solveDeployment(input)` — orchestrates 9 phases: compute zones → generate threat map → classify objectives → assign roles → compute drop order → greedily place each unit via position × formation scoring. Handles embarked units, infiltrators, scouts, deep-strike reserves.

## geometry/
- `point.ts` — distance, offset, midpoint (2D vectors)
- `circle.ts` — pointInCircle, pointInQuarterCircle (Search & Destroy quadrants)
- `polygon.ts` — pointInRect, rectsOverlap, pointInPolygon (ray-casting)
- `los.ts` — lineIntersectsRect, hasLOS, isHiddenFromAllPositions (terrain occlusion)

## zones/
- `deployment-zones.ts` — `computeDeploymentZone`/`computeEnemyZone` for Search & Destroy (quadrants with 9" arcs) and Dawn of War (24" strips with gap)
- `exclusion-zones.ts` — `canInfiltrate`, `canScoutMoveTo`, `canDeepStrike` (9" enemy exclusion checks)

## objectives/classify.ts
`classifyObjectives()` — partition into home/safe/expansion/center/enemy-home by zone distance.

## units/
- `role-assignment.ts` — `assignRoles()` — heuristics from stats/keywords/weapons to derive purpose (killing/holding/scoring) and role (holder/screen/gunline/hammer/etc.)
- `drop-order.ts` — `computeDropOrder()` — 10-tier priority (holders first, scouts last), cheaper within tier

## placement/
- `coherency.ts` — `isCoherent()` — validates neighbor counts within coherency distance (≥7 models need 2 neighbors)
- `formations.ts` — `generateFormations()` — 5 templates (block/line/wide-line/dog-bone/blob) with strict coherency
- `legal-check.ts` — `isLegalPlacement()` — zone containment + physical overlap + coherency + infiltrate restrictions
- `scoring.ts` — `scorePosition()` — 11-factor evaluation: cover, threat exposure, objective proximity, firing lanes, screen coverage, turn 1 survival, role fit

## threats/
- `threat-range.ts` — `maxShootingThreat`, `maxMeleeThreat` — from move + weapon + abilities
- `threat-map.ts` — `generateThreatMap()` — 2" resolution heatmap of enemy shooting + melee threat
- `los-analysis.ts` — `findHidingSpots`, `estimateTerrainCapacity` — LOS-blocking terrain identification

## index.ts
Barrel export of all public APIs.
