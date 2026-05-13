import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { prepareForImport, generateSummaryCSV } from './import'
import type { TournamentRecord } from './event-parser'

// Temp directory per test run to avoid collisions
const TMP_BASE = path.join(import.meta.dirname ?? __dirname, '__tmp_import_test__')

function makeDirs(): { dataDir: string; outputDir: string } {
  const dataDir = path.join(TMP_BASE, 'data')
  const outputDir = path.join(TMP_BASE, 'output')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(outputDir, { recursive: true })
  return { dataDir, outputDir }
}

function writeTournament(dir: string, filename: string, record: TournamentRecord): void {
  writeFileSync(path.join(dir, filename), JSON.stringify(record))
}

const validRecord: TournamentRecord = {
  eventName: 'GT Test',
  eventDate: '2025-05-04',
  format: 'GT',
  players: [
    {
      name: 'Alice',
      placement: 1,
      faction: 'Space Marines',
      wins: 5,
      losses: 0,
      draws: 0,
      points: 100,
    },
  ],
}

const emptyPlayersRecord: TournamentRecord = {
  eventName: 'Empty Event',
  eventDate: '2025-06-01',
  format: 'RTT',
  players: [],
}

beforeEach(() => {
  mkdirSync(TMP_BASE, { recursive: true })
})

afterEach(() => {
  rmSync(TMP_BASE, { recursive: true, force: true })
})

describe('prepareForImport', () => {
  it('reads JSON files from input dir and writes them to output dir', async () => {
    const { dataDir, outputDir } = makeDirs()
    writeTournament(dataDir, 'abc123.json', validRecord)

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)

    const outputFiles = readdirSync(outputDir)
    expect(outputFiles).toContain('abc123.json')
  })

  it('skips events.json (the event list index file)', async () => {
    const { dataDir, outputDir } = makeDirs()
    writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify([]))
    writeTournament(dataDir, 'abc123.json', validRecord)

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.imported).toBe(1)
    const outputFiles = readdirSync(outputDir)
    expect(outputFiles).not.toContain('events.json')
  })

  it('skips records with no players', async () => {
    const { dataDir, outputDir } = makeDirs()
    writeTournament(dataDir, 'empty.json', emptyPlayersRecord)

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.skipped).toBe(1)
    expect(result.imported).toBe(0)
    const outputFiles = readdirSync(outputDir)
    expect(outputFiles).toHaveLength(0)
  })

  it('skips records with no eventName', async () => {
    const { dataDir, outputDir } = makeDirs()
    const noName = { ...validRecord, eventName: '' }
    writeTournament(dataDir, 'noname.json', noName as TournamentRecord)

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.skipped).toBe(1)
    expect(result.imported).toBe(0)
  })

  it('counts errors for invalid JSON files', async () => {
    const { dataDir, outputDir } = makeDirs()
    writeFileSync(path.join(dataDir, 'broken.json'), 'not valid json {{')

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.errors).toBe(1)
    expect(result.imported).toBe(0)
  })

  it('handles a mix of valid, skipped, and errored files', async () => {
    const { dataDir, outputDir } = makeDirs()
    writeTournament(dataDir, 'good.json', validRecord)
    writeTournament(dataDir, 'empty.json', emptyPlayersRecord)
    writeFileSync(path.join(dataDir, 'broken.json'), 'not valid {{')

    const result = await prepareForImport(dataDir, outputDir)

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('creates the output directory if it does not exist', async () => {
    const { dataDir } = makeDirs()
    const newOutputDir = path.join(TMP_BASE, 'new-output-dir')
    writeTournament(dataDir, 'abc123.json', validRecord)

    // newOutputDir does not exist yet
    const result = await prepareForImport(dataDir, newOutputDir)

    expect(result.imported).toBe(1)
    const outputFiles = readdirSync(newOutputDir)
    expect(outputFiles).toContain('abc123.json')
  })
})

describe('generateSummaryCSV', () => {
  it('produces a valid CSV with a header row', () => {
    const csv = generateSummaryCSV([validRecord])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Event Name,Date,Format,Players,Top Faction,Top Player')
    expect(lines).toHaveLength(2)
  })

  it('includes the correct data for a single record', () => {
    const csv = generateSummaryCSV([validRecord])
    const row = csv.split('\n')[1]!
    expect(row).toContain('"GT Test"')
    expect(row).toContain('2025-05-04')
    expect(row).toContain('GT')
    expect(row).toContain('1') // player count
    expect(row).toContain('Space Marines')
    expect(row).toContain('Alice')
  })

  it('handles multiple records', () => {
    const second: TournamentRecord = {
      eventName: 'Major Clash',
      eventDate: '2025-07-12',
      format: 'Major',
      players: [
        { name: 'Bob', placement: 1, faction: 'Orks', wins: 5, losses: 0, draws: 0, points: 95 },
      ],
    }
    const csv = generateSummaryCSV([validRecord, second])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain('"Major Clash"')
  })

  it('returns just the header for an empty records array', () => {
    const csv = generateSummaryCSV([])
    expect(csv).toBe('Event Name,Date,Format,Players,Top Faction,Top Player')
  })

  it('handles records with no players gracefully (empty top player fields)', () => {
    const csv = generateSummaryCSV([emptyPlayersRecord])
    const row = csv.split('\n')[1]!
    // player count = 0, faction and name = empty
    expect(row).toContain('0')
  })

  it('quotes event names to handle commas within names', () => {
    const withComma: TournamentRecord = {
      ...validRecord,
      eventName: 'Heat 1, Sheffield',
    }
    const csv = generateSummaryCSV([withComma])
    expect(csv).toContain('"Heat 1, Sheffield"')
  })
})
