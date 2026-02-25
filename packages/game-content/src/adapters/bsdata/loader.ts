import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { GameContentAdapter, UnitProfile } from '../../types.js'
import { parseBSDataXml } from './parser.js'

// ============================================================
// BSDataLoader — reads .cat/.gst files from BSDATA_DIR
//
// The operator runs:
//   git clone https://github.com/BSData/wh40k-10e
//   export BSDATA_DIR=/path/to/wh40k-10e
//
// The loader reads those files at server startup and builds an
// in-memory index. Nothing is written to the platform DB.
// ============================================================

export interface BSDataAdapterOptions {
  dataDir: string
}

export class BSDataAdapter implements GameContentAdapter {
  private readonly dataDir: string
  private unitIndex: Map<string, UnitProfile> = new Map()
  private loaded = false

  constructor(options: BSDataAdapterOptions) {
    this.dataDir = options.dataDir
  }

  /**
   * Load all .cat and .gst files from dataDir.
   * Must be called once at server startup before any queries.
   * No-ops (returns empty index) if dataDir is empty or missing.
   */
  async load(): Promise<void> {
    if (!this.dataDir) {
      this.loaded = true
      return
    }

    let files: string[]
    try {
      files = await readdir(this.dataDir)
    } catch {
      // Directory doesn't exist or isn't readable — graceful degradation
      this.loaded = true
      return
    }

    const contentFiles = files.filter((f) => f.endsWith('.cat') || f.endsWith('.gst'))

    for (const file of contentFiles) {
      // Use filename (without extension) as faction hint.
      // Real BSData filenames are like "Space Marines.cat" — the faction
      // is overridden by the per-entry faction attribute in the XML if present.
      const factionHint = file.replace(/\.(cat|gst)$/, '')
      const filePath = join(this.dataDir, file)

      try {
        const xml = await readFile(filePath, 'utf-8')
        const { units } = parseBSDataXml(xml, factionHint)
        for (const unit of units) {
          this.unitIndex.set(unit.id, unit)
        }
      } catch {
        // Skip unreadable files — don't crash the server
      }
    }

    this.loaded = true
  }

  async getUnit(id: string): Promise<UnitProfile | null> {
    this.assertLoaded()
    return this.unitIndex.get(id) ?? null
  }

  async searchUnits(query: { faction?: string; name?: string }): Promise<UnitProfile[]> {
    this.assertLoaded()

    const faction = query.faction?.toLowerCase()
    const name = query.name?.toLowerCase()

    const results: UnitProfile[] = []
    for (const unit of this.unitIndex.values()) {
      if (faction && !unit.faction.toLowerCase().includes(faction)) continue
      if (name && !unit.name.toLowerCase().includes(name)) continue
      results.push(unit)
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  async listFactions(): Promise<string[]> {
    this.assertLoaded()

    const factions = new Set<string>()
    for (const unit of this.unitIndex.values()) {
      factions.add(unit.faction)
    }
    return [...factions].sort()
  }

  private assertLoaded(): void {
    if (!this.loaded) {
      throw new Error('BSDataAdapter: call load() before querying')
    }
  }

  /** Exposed for tests — number of units indexed */
  get size(): number {
    return this.unitIndex.size
  }
}
