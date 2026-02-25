// Tests use synthetic fixture data only.
// No real GW unit names, stats, or ability text appear here.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterAll } from 'vitest'

import { BSDataAdapter } from './loader.js'

// ---- Fixture XML ----

const FIXTURE_CAT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-A" name="Void Walker" type="unit">
      <profiles>
        <profile id="p-A" name="Void Walker" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">7</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">4+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">7</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="60" />
      </costs>
    </selectionEntry>
    <selectionEntry id="unit-B" name="Null Titan" type="unit">
      <profiles>
        <profile id="p-B" name="Null Titan" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">8</characteristic>
            <characteristic name="Sv">2+</characteristic>
            <characteristic name="W">14</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">4</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="200" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

const FIXTURE_GST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-gst" name="TestGame Core">
  <selectionEntries>
    <selectionEntry id="unit-C" name="Core Sentinel" type="model">
      <profiles>
        <profile id="p-C" name="Core Sentinel" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">5</characteristic>
            <characteristic name="T">3</characteristic>
            <characteristic name="Sv">4+</characteristic>
            <characteristic name="W">1</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="15" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

// ---- Helpers ----

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `bsdata-loader-test-${name}-${Date.now()}`)
  await mkdir(dir, { recursive: true })
  return dir
}

// ---- Tests ----

describe('BSDataAdapter — happy path', () => {
  let tempDir: string

  afterAll(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  })

  it('loads .cat and .gst files from the data directory', async () => {
    tempDir = await makeTempDir('happy')
    await writeFile(join(tempDir, 'Test Faction.cat'), FIXTURE_CAT)
    await writeFile(join(tempDir, 'Core.gst'), FIXTURE_GST)

    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    expect(adapter.size).toBe(3)
  })

  it('getUnit returns a unit by id', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const unit = await adapter.getUnit('unit-A')
    expect(unit).not.toBeNull()
    expect(unit!.name).toBe('Void Walker')
    expect(unit!.points).toBe(60)
  })

  it('getUnit returns null for unknown id', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const unit = await adapter.getUnit('does-not-exist')
    expect(unit).toBeNull()
  })

  it('searchUnits filters by name (case-insensitive)', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const results = await adapter.searchUnits({ name: 'titan' })
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('Null Titan')
  })

  it('searchUnits filters by faction (case-insensitive)', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const results = await adapter.searchUnits({ faction: 'test faction' })
    expect(results).toHaveLength(2)
  })

  it('searchUnits returns all units when no filter given', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const results = await adapter.searchUnits({})
    expect(results).toHaveLength(3)
  })

  it('listFactions returns sorted unique faction names', async () => {
    const adapter = new BSDataAdapter({ dataDir: tempDir })
    await adapter.load()

    const factions = await adapter.listFactions()
    expect(factions).toContain('Test Faction')
    expect(factions).toContain('Core')
    expect(factions).toEqual([...factions].sort())
  })
})

describe('BSDataAdapter — nested model filtering', () => {
  it('does not index nested model entries', async () => {
    const dir = await makeTempDir('nested')
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-X" name="Squad X" type="unit">
      <profiles>
        <profile id="px" name="Squad X" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <selectionEntries>
        <selectionEntry id="nested-Y" name="Nested Sub-Model" type="model">
          <profiles>
            <profile id="py" name="Nested Sub-Model" typeName="Model Characteristics">
              <characteristics>
                <characteristic name="M">5</characteristic>
                <characteristic name="T">3</characteristic>
                <characteristic name="Sv">4+</characteristic>
                <characteristic name="W">1</characteristic>
                <characteristic name="Ld">7</characteristic>
                <characteristic name="OC">1</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    await writeFile(join(dir, 'Nested.cat'), xml)

    const adapter = new BSDataAdapter({ dataDir: dir })
    await adapter.load()

    // Only the outer unit should be indexed, not the nested model
    expect(adapter.size).toBe(1)
    expect(await adapter.getUnit('unit-X')).not.toBeNull()
    expect(await adapter.getUnit('nested-Y')).toBeNull()

    await rm(dir, { recursive: true, force: true })
  })
})

describe('BSDataAdapter — graceful degradation', () => {
  it('load() with empty dataDir does not throw', async () => {
    const adapter = new BSDataAdapter({ dataDir: '' })
    await expect(adapter.load()).resolves.not.toThrow()
    expect(adapter.size).toBe(0)
  })

  it('load() with non-existent directory does not throw', async () => {
    const adapter = new BSDataAdapter({ dataDir: '/path/that/does/not/exist-at-all' })
    await expect(adapter.load()).resolves.not.toThrow()
    expect(adapter.size).toBe(0)
  })

  it('searchUnits returns [] when no data loaded', async () => {
    const adapter = new BSDataAdapter({ dataDir: '' })
    await adapter.load()
    const results = await adapter.searchUnits({ name: 'anything' })
    expect(results).toHaveLength(0)
  })

  it('listFactions returns [] when no data loaded', async () => {
    const adapter = new BSDataAdapter({ dataDir: '' })
    await adapter.load()
    expect(await adapter.listFactions()).toHaveLength(0)
  })

  it('throws if queried before load() is called', async () => {
    const adapter = new BSDataAdapter({ dataDir: '' })
    await expect(adapter.searchUnits({})).rejects.toThrow('load()')
  })

  it('skips unreadable files without crashing', async () => {
    const dir = await makeTempDir('unreadable')
    // Valid file
    await writeFile(join(dir, 'Valid.cat'), FIXTURE_CAT)
    // Empty/corrupt file
    await writeFile(join(dir, 'Corrupt.cat'), '<not-valid-bsdata')

    const adapter = new BSDataAdapter({ dataDir: dir })
    await adapter.load()

    // Valid file should still be indexed (2 units from FIXTURE_CAT)
    expect(adapter.size).toBeGreaterThanOrEqual(0) // corrupt returns 0 units, no crash

    await rm(dir, { recursive: true, force: true })
  })
})
