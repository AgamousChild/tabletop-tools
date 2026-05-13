# Game Simulator — Design Spec

## Overview

Two simulation modes for Warhammer 40K: a fast code-based simulator for bulk analysis, and a TTS-integrated simulator for visual single-game playthrough. Both use the same core engine, different output targets.

---

## Mode 1: Code Simulation (Batch Analytics)

### Goal
Run thousands of full 5-turn games programmatically to answer: "What strategy beats what army at what win rate?"

### Architecture

```
Inputs:
  Army A (list + playbook)
  Army B (list + playbook)
  Mission (primary + secondaries)
  Deployment type + terrain layout

Engine:
  Turn 0: Deployment algorithm places both armies
  Turn 1-5: Each turn runs 5 phases per player
    Command Phase → score VP, select abilities
    Movement Phase → playbook decides where each unit moves
    Shooting Phase → versus pipeline resolves all shooting
    Charge Phase → playbook decides charges, dice resolve distance
    Fight Phase → versus pipeline resolves melee

Output:
  Win/loss/draw result
  VP per turn per player
  Units destroyed per turn
  Key moments (what swung the game)
  
Batch:
  Run N games (100-10,000)
  Return: win rate, avg VP differential, most impactful units/decisions
```

### Core Components

**1. Game State**
```typescript
interface GameState {
  turn: number
  phase: Phase
  activePlayer: 'A' | 'B'
  
  armies: {
    A: ArmyState
    B: ArmyState
  }
  
  objectives: ObjectiveState[]
  vpScores: { A: number; B: number }
  
  battlefield: {
    terrain: TerrainPiece[]
    width: number
    depth: number
  }
}

interface ArmyState {
  units: UnitState[]
  cp: number
  stratagems: string[]         // available stratagems
  armyRule: string             // active army rule
  miracleDice?: number[]       // faction-specific resources
}

interface UnitState {
  id: string
  name: string
  position: Point              // current center position
  models: ModelState[]          // individual models with wounds
  morale: 'steady' | 'battle-shocked'
  hasActed: boolean            // this phase
  hasMoved: boolean
  hasShot: boolean
  hasFought: boolean
  hasCharged: boolean
  advancedThisTurn: boolean
  fellBackThisTurn: boolean
  isInReserves: boolean
  isDestroyed: boolean
  isWithinEngagement: boolean  // within 1" of enemy
  objectivesControlled: string[]
}

interface ModelState {
  woundsRemaining: number
  isDestroyed: boolean
}
```

**2. Phase Engine**

Each phase is a function: `(state: GameState, playbook: Playbook) => GameState`

```
commandPhase(state, playbook)
  → Check battle-shock for damaged units
  → Score primary mission VP
  → Select abilities (army rules, detachment rules)
  → Gain CP

movementPhase(state, playbook) 
  → For each unit, playbook decides: stay, move, advance, fall back
  → Movement uses pathfinding around terrain
  → Reserves arrive (turn 2+)
  → Deep strike placement

shootingPhase(state, playbook)
  → For each unit, playbook decides target
  → Resolve using versus pipeline (hit → wound → save → damage)
  → Apply weapon abilities (sustained hits, lethal hits, etc.)
  → Remove casualties

chargePhase(state, playbook)
  → For each unit, playbook decides whether to charge and target
  → Roll 2D6 for charge distance
  → Move charging unit into engagement range
  → Overwatch (if opponent uses stratagem)

fightPhase(state, playbook)
  → Alternate activations: charging units first
  → For each fighting unit, playbook decides target
  → Resolve melee via versus pipeline
  → Pile in (3") and consolidate (3")
  → Remove casualties

moralPhase(state)
  → Battle-shock tests for units below half strength
```

**3. Playbook Decision Engine**

The playbook is the condensed tactical knowledge from the content ingestor + deployment algorithm lessons.

```typescript
interface Playbook {
  faction: string
  detachment: string
  
  // Deployment (handled by deployment algorithm)
  deployment: DeploymentPlan
  
  // Per-phase decision rules
  rules: DecisionRule[]
}

interface DecisionRule {
  phase: Phase
  trigger: string              // condition expression
  action: string               // what to do
  priority: number             // higher = more important
  unitFilter?: string          // which units this applies to
}

// Example rules:
// { phase: 'movement', trigger: 'turn == 1 && unit.role == "transport"', action: 'advance toward nearest center objective', priority: 10 }
// { phase: 'shooting', trigger: 'target.isCharacter && !target.isLoneOperative', action: 'prioritize target', priority: 8 }
// { phase: 'charge', trigger: 'unit.role == "hammer" && target.woundsRemaining < target.woundsMax * 0.5', action: 'charge weakened target', priority: 9 }
```

**4. Versus Pipeline Integration**

The existing `apps/versus/client/src/lib/rules/pipeline.ts` resolves individual attack sequences. The simulator calls it for each shooting/melee activation:

```
resolveAttacks(attackerWeapon, defenderProfile, modifiers)
  → Expected hits, wounds, unsaved wounds, damage
  → Apply to ModelState wound tracking
  → Remove destroyed models
```

For simulation speed, use expected values (averages) not dice rolls. For variance analysis, use Monte Carlo (actual dice rolls).

**5. Batch Runner**

```typescript
interface SimulationConfig {
  armyA: ArmyList
  playbookA: Playbook
  armyB: ArmyList
  playbookB: Playbook
  mission: Mission
  terrain: TerrainLayout
  games: number               // how many to simulate
  mode: 'expected' | 'monte-carlo'
}

interface SimulationResults {
  gamesPlayed: number
  winsA: number
  winsB: number
  draws: number
  winRateA: number
  avgVpA: number
  avgVpB: number
  avgTurnGameDecided: number   // when the outcome became clear
  
  // Per-unit analytics
  unitPerformance: Array<{
    unitName: string
    avgKills: number
    avgSurvivalTurns: number
    avgVpContribution: number
  }>
  
  // Decision analytics
  keyDecisions: Array<{
    turn: number
    phase: string
    description: string
    impactOnWinRate: number   // how much this decision swung the game
  }>
}
```

### Testing
- Unit test each phase function independently
- Integration test: run a full 5-turn game and verify VP is calculated
- Validate against known tournament results: do strong lists beat weak lists?

---

## Mode 2: TTS Simulation (Visual Single Game)

### Goal
Watch an AI agent play a full game on the TTS table, making decisions from the playbook in real time.

### Architecture

```
TTS Table State (MCP) 
  ↕ read positions, move models
Agent Loop:
  1. Read board state from TTS
  2. Convert to GameState
  3. Run phase engine with playbook
  4. Convert decisions to TTS model movements
  5. Execute via TTS Lua
  6. Wait for opponent (human or second agent)
  7. Repeat
```

### Components

**1. TTS ↔ GameState Bridge**

```typescript
// Read TTS table into GameState
async function readBoardState(tts: TTSClient): Promise<GameState>
  → Get all objects, positions, names
  → Map TTS GUIDs to unit IDs
  → Calculate which units are in engagement range
  → Determine objective control
  → Return structured GameState

// Apply a decision to TTS
async function executeDecision(decision: Decision, tts: TTSClient): Promise<void>
  → Move models to new positions via Lua
  → Roll dice (use TTS dice roller)
  → Remove destroyed models
  → Update wound counters
```

**2. Agent Loop**

```typescript
async function playTurn(
  gameState: GameState,
  playbook: Playbook,
  tts: TTSClient,
): Promise<void> {
  // Command Phase
  const cpDecisions = commandPhase(gameState, playbook)
  await executeDecisions(cpDecisions, tts)
  
  // Movement Phase  
  const moveDecisions = movementPhase(gameState, playbook)
  for (const move of moveDecisions) {
    await executeDecision(move, tts)
    await sleep(500)  // visual pacing
  }
  
  // Shooting Phase
  const shootDecisions = shootingPhase(gameState, playbook)
  for (const shot of shootDecisions) {
    await executeDecision(shot, tts)
    // Roll dice visually in TTS
    await rollDiceInTTS(shot.diceCount, tts)
    await sleep(1000)
  }
  
  // Charge + Fight similarly
}
```

**3. Opponent Modes**

- **Agent vs Agent**: Both sides run playbooks. Full automated game.
- **Agent vs Human**: Agent plays one side, human plays the other through TTS normally. Agent waits for human to finish their turn.
- **Coach mode**: Agent watches human play, suggests better moves from the playbook. Doesn't execute — just advises.

**4. Visual Feedback**

The TTS agent can use the existing TTS mod features:
- Dice roller for attack resolution
- Wound counters on models
- Objective control markers
- Movement measurement tools
- Battle-shock tokens

### Key Differences from Code Sim

| Aspect | Code Sim | TTS Sim |
|---|---|---|
| Speed | 1000 games/minute | 1 game/hour |
| Purpose | Win rate analysis | Learning/demonstration |
| Movement | Instant position changes | Visual model movement |
| Dice | Expected values or fast RNG | Physical TTS dice rolls |
| Terrain | Abstract rectangles | Actual 3D terrain |
| Output | Statistics | Watchable game |
| LOS | Geometric calculation | TTS LOS tools |

---

## Shared Components

Both modes share:
- **Game state types** (`packages/game-sim/src/types.ts`)
- **Phase logic** (`packages/game-sim/src/phases/`)
- **Playbook engine** (`packages/game-sim/src/playbook/`)
- **Versus pipeline** (imported from `apps/versus/client/src/lib/rules/pipeline.ts`)
- **Deployment algorithm** (imported from `packages/deployment/`)

### Package Structure

```
packages/game-sim/
  src/
    types.ts                    — GameState, UnitState, Decision, etc.
    
    phases/
      command.ts                — Command phase logic
      movement.ts               — Movement + pathfinding
      shooting.ts               — Target selection + versus pipeline
      charge.ts                 — Charge decisions + dice
      fight.ts                  — Melee resolution
      morale.ts                 — Battle-shock tests
    
    playbook/
      engine.ts                 — Match triggers to rules, select actions
      loader.ts                 — Load playbook from brain community nodes
      generator.ts              — Generate playbook from matchup + mission
    
    simulation/
      runner.ts                 — Single game loop
      batch.ts                  — Run N games, collect stats
      results.ts                — Aggregate and analyze results
    
    tts/
      bridge.ts                 — TTS ↔ GameState conversion
      executor.ts               — Execute decisions as TTS Lua commands
      agent.ts                  — Full TTS agent loop

    index.ts
  
  package.json
  vitest.config.ts
```

---

## Data Flow

```
Content Ingestor (YouTube, articles)
  → Extracted tactics (Llama 3.1)
    → Validated tactics (Gemma 2 review)
      → Structured decision rules (third pass)
        → Playbook generator (per matchup)
          ↓                          ↓
    Code Simulator              TTS Agent
    (batch analytics)        (visual gameplay)
          ↓                          ↓
    Win rate reports          Watchable games
    Unit performance          Coach mode
    Strategy optimization     Learning tool
```

---

## MVP Path

1. **Phase 1**: Game state types + command/movement phases (no combat)
2. **Phase 2**: Shooting phase using versus pipeline
3. **Phase 3**: Charge + fight phases
4. **Phase 4**: Playbook engine (hardcoded rules first)
5. **Phase 5**: Batch runner + results aggregation
6. **Phase 6**: Playbook loader from brain community nodes
7. **Phase 7**: TTS bridge + basic agent
8. **Phase 8**: Full TTS agent with visual dice rolls
9. **Phase 9**: Coach mode
10. **Phase 10**: Playbook generator from matchup analysis

---

## Dependencies

- `packages/deployment/` — deployment algorithm (turn 0)
- `apps/versus/client/src/lib/rules/pipeline.ts` — combat resolution
- `packages/game-content/` — unit profiles, weapon stats
- `apps/brain/` — community tactical knowledge for playbook generation
- `mcp/tts-client/` — TTS integration for visual mode
