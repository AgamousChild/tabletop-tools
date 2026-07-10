/**
 * Fixture data for `player.seedTestPlayers`. Test/dev-only — the mutation that
 * consumes this is gated to reject in production (see routers/player.ts).
 *
 * Rule 7 (no test data in production): this file is not imported by anything
 * that runs in a production request path other than the gated mutation, which
 * throws FORBIDDEN before ever reading `TEST_PLAYERS` when ctx.environment
 * is 'production'.
 */
export const TEST_PLAYERS = [
  { name: 'Alex Ironforge', faction: 'Space Marines', detachment: 'Gladius Task Force' },
  { name: 'Sam Greenskin', faction: 'Orks', detachment: 'Waaagh! Tribe' },
  { name: 'Jordan Cryptek', faction: 'Necrons', detachment: 'Awakened Dynasty' },
  { name: 'Morgan Shas', faction: "T'au Empire", detachment: 'Kauyon' },
  {
    name: 'Riley Warpsmith',
    faction: 'Chaos Space Marines',
    detachment: 'Pactbound Zealots',
  },
  { name: 'Casey Farstrider', faction: 'Aeldari', detachment: 'Battle Host' },
  { name: 'Taylor Canticles', faction: 'Adeptus Mechanicus', detachment: 'Rad-Zone Corps' },
  { name: 'Jamie Terminator', faction: 'Grey Knights', detachment: 'Teleport Strike Force' },
  { name: 'Pat Shadowkeeper', faction: 'Adeptus Custodes', detachment: 'Shield Host' },
  { name: 'Drew Lictor', faction: 'Tyranids', detachment: 'Invasion Fleet' },
  { name: 'Charlie Bloodletter', faction: 'Chaos Daemons', detachment: 'Daemonic Incursion' },
  { name: 'Avery Commissar', faction: 'Astra Militarum', detachment: 'Combined Regiment' },
  { name: 'Quinn Plague', faction: 'Death Guard', detachment: 'Plague Company' },
  { name: 'Robin Hexfire', faction: 'Thousand Sons', detachment: 'Cult of Magic' },
  {
    name: 'Blair Skitarii',
    faction: 'Adeptus Mechanicus',
    detachment: 'Skitarii Hunter Cohort',
  },
  { name: 'Kai Wychking', faction: 'Drukhari', detachment: 'Realspace Raiders' },
] as const
