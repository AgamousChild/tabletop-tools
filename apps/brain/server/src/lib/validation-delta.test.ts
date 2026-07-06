import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetFactionCodes } from './faction-codes'
import type { Node } from './model'
import {
  _primeFactionCodesForTesting,
  runValidationDelta,
  summarizeByFaction,
} from './validation-delta'

let tmpRoot: string
let packDir: string
let brainNodesDir: string

beforeAll(() => {
  _primeFactionCodesForTesting(
    new Map<string, string>([
      ['space-marines', 'space-marines'],
      ['blood-angels', 'blood-angels'],
    ]),
    new Set(['space-marines', 'blood-angels']),
  )

  tmpRoot = mkdtempSync(join(tmpdir(), 'brain-validation-delta-'))
  packDir = join(tmpRoot, 'packs')
  brainNodesDir = join(tmpRoot, 'brain', 'nodes')
  mkdirSync(packDir, { recursive: true })
  mkdirSync(brainNodesDir, { recursive: true })

  // Synthetic faction pack — emits a detachment-rule + a stratagem under the
  // CERAMITE SENTINELS detachment with CP cost 2.
  const factionPack = `
## CERAMITE SENTINELS

##### DETACHMENT RULE

##### ADAPTIVE DEFENCE

These warriors fight from defensive positions.

*CERAMITE SENTINELS — BATTLE TACTIC STRATAGEM*

A measured volley.

**WHEN:** Your Shooting phase.

**TARGET:** One Space Marines unit from your army.

**EFFECT:** 2 CP. Improve the AP of melee attacks by 1.
`.trim()
  writeFileSync(join(packDir, 'faction-pack-space-marines.md'), factionPack)

  // Synthetic 10e cache — same detachment + same faction-ability (ADAPTIVE
  // DEFENCE) with different content. The delta should report the content
  // delta on the faction-ability match.
  const tenthNodes: Node[] = [
    {
      id: 'det:space-marines:ceramite-sentinels',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'CERAMITE SENTINELS',
      content: 'These warriors fight from a fortified position.', // different content
      summary: 'CERAMITE SENTINELS — These warriors fight from a fortified position.',
      factionId: 'space-marines',
      sources: [{ type: 'pdf', title: 'SM 10e', retrievedAt: '2025-01-01T00:00:00Z' }],
      refs: [],
      version: 1,
      keywords: [],
      edition: '10th',
    },
    {
      id: 'det:space-marines:ceramite-sentinels:adaptive-defence',
      layer: 'faction',
      category: 'faction-ability',
      title: 'ADAPTIVE DEFENCE',
      content: 'Re-roll a Hit roll of 1 within a terrain feature.', // 10e content
      summary: 'ADAPTIVE DEFENCE — Re-roll a Hit roll of 1.',
      factionId: 'space-marines',
      sources: [{ type: 'pdf', title: 'SM 10e', retrievedAt: '2025-01-01T00:00:00Z' }],
      refs: [],
      version: 1,
      keywords: [],
      edition: '10th',
    },
  ]
  writeFileSync(
    join(brainNodesDir, 'faction-space-marines.json'),
    JSON.stringify(tenthNodes, null, 2),
  )
})

afterAll(() => {
  resetFactionCodes()
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
})

describe('runValidationDelta', () => {
  it('finds 10e nodes that have a matching 11e parser output', () => {
    const deltas = runValidationDelta({ packDir, brainNodesDir })
    expect(deltas.length).toBeGreaterThan(0)
    const det = deltas.find((d) => d.title === 'Ceramite Sentinels')
    expect(det).toBeDefined()
    expect(det!.tenthEditionNodeId).toBe('det:space-marines:ceramite-sentinels')
    expect(det!.factionId).toBe('space-marines')
    expect(det!.category).toBe('detachment-rule')
  })

  it('lists field-level deltas where the 10e and 11e values differ', () => {
    const deltas = runValidationDelta({ packDir, brainNodesDir })
    const ability = deltas.find((d) => d.title === 'ADAPTIVE DEFENCE')
    expect(ability).toBeDefined()
    // content text differs between the 10e cache and the 11e parser output.
    expect(ability!.deltaFields).toContain('content')
  })

  it('writes a JSON file when outputPath is set', () => {
    const outPath = join(tmpRoot, 'deltas.json')
    runValidationDelta({ packDir, brainNodesDir, outputPath: outPath })
    const written = JSON.parse(readFileSync(outPath, 'utf-8'))
    expect(Array.isArray(written)).toBe(true)
    expect(written.length).toBeGreaterThan(0)
  })

  it('summarizeByFaction groups deltas by factionId', () => {
    const deltas = runValidationDelta({ packDir, brainNodesDir })
    const summary = summarizeByFaction(deltas)
    expect(summary.length).toBeGreaterThan(0)
    const sm = summary.find((s) => s.factionId === 'space-marines')
    expect(sm).toBeDefined()
    expect(sm!.totalMatched).toBeGreaterThan(0)
  })

  it('throws when the brain nodes dir does not exist', () => {
    expect(() =>
      runValidationDelta({
        packDir,
        brainNodesDir: join(tmpRoot, 'missing-dir'),
      }),
    ).toThrow(/Brain nodes directory not found/)
  })
})
