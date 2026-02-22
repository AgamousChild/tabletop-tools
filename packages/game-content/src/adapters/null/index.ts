import type { GameContentAdapter, UnitProfile } from '../../types.js'

/**
 * NullAdapter — returns empty results for all queries.
 *
 * Used when no BSDATA_DIR is configured. The server starts normally;
 * unit searches return empty arrays rather than crashing.
 */
export class NullAdapter implements GameContentAdapter {
  async getUnit(_id: string): Promise<UnitProfile | null> {
    return null
  }

  async searchUnits(_query: { faction?: string; name?: string }): Promise<UnitProfile[]> {
    return []
  }

  async listFactions(): Promise<string[]> {
    return []
  }
}
