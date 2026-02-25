// Tests use synthetic fixture data only.
// No real GW unit names, stats, or ability text appear here.

import { describe, expect, it } from 'vitest'

import { parseBSDataXml } from './parser.js'

// ---- Fixtures ----

const SINGLE_UNIT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-001" name="Iron Warrior" type="unit">
      <profiles>
        <profile id="p1" name="Iron Warrior" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w1" name="Bolt Launcher" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">-</characteristic>
          </characteristics>
        </profile>
        <profile id="w2" name="Combat Blade" typeName="Melee Weapons">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">3</characteristic>
            <characteristic name="WS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="75" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

const UNIT_WITH_ABILITIES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-002" name="Storm Hulk" type="unit">
      <profiles>
        <profile id="p2" name="Storm Hulk" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">8</characteristic>
            <characteristic name="T">9</characteristic>
            <characteristic name="Sv">2+</characteristic>
            <characteristic name="W">10</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">3</characteristic>
          </characteristics>
        </profile>
        <profile id="w3" name="Scatter Cannon" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">30</characteristic>
            <characteristic name="A">D6</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">7</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">2</characteristic>
            <characteristic name="Abilities">Blast, Sustained Hits 1</characteristic>
          </characteristics>
        </profile>
        <profile id="ab1" name="Heavy Armour" typeName="Abilities">
          <characteristics>
            <characteristic name="Description">Reduce damage by 1.</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="130" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

const NON_UNIT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="eq-001" name="Plasma Pistol" type="upgrade">
      <profiles>
        <profile id="w5" name="Plasma Pistol" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">12</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

// ---- Tests ----

describe('parseBSDataXml — basic unit', () => {
  it('returns one unit from a single-unit fixture', () => {
    const { units, errors } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    expect(errors).toHaveLength(0)
    expect(units).toHaveLength(1)
  })

  it('correctly parses unit identity fields', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    const unit = units[0]!
    expect(unit.id).toBe('unit-001')
    expect(unit.name).toBe('Iron Warrior')
    expect(unit.faction).toBe('Test Faction')
  })

  it('correctly parses characteristic stats', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    const unit = units[0]!
    expect(unit.move).toBe(6)
    expect(unit.toughness).toBe(4)
    expect(unit.save).toBe(3)   // "3+" → 3
    expect(unit.wounds).toBe(2)
    expect(unit.leadership).toBe(6)
    expect(unit.oc).toBe(1)
  })

  it('extracts points cost', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    expect(units[0]!.points).toBe(75)
  })

  it('extracts ranged weapon with correct stats', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    const ranged = units[0]!.weapons.find((w) => w.name === 'Bolt Launcher')
    expect(ranged).toBeDefined()
    expect(ranged!.range).toBe(24)
    expect(ranged!.attacks).toBe(2)
    expect(ranged!.strength).toBe(4)
    expect(ranged!.ap).toBe(-1)
    expect(ranged!.damage).toBe(1)
  })

  it('identifies melee weapons', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    const melee = units[0]!.weapons.find((w) => w.name === 'Combat Blade')
    expect(melee).toBeDefined()
    expect(melee!.range).toBe('melee')
  })
})

describe('parseBSDataXml — abilities', () => {
  it('parses dice-notation attacks', () => {
    const { units } = parseBSDataXml(UNIT_WITH_ABILITIES_XML, 'Test Faction')
    const cannon = units[0]!.weapons.find((w) => w.name === 'Scatter Cannon')
    expect(cannon).toBeDefined()
    expect(cannon!.attacks).toBe('D6')
  })

  it('maps Blast ability', () => {
    const { units } = parseBSDataXml(UNIT_WITH_ABILITIES_XML, 'Test Faction')
    const cannon = units[0]!.weapons.find((w) => w.name === 'Scatter Cannon')
    expect(cannon!.abilities).toContainEqual({ type: 'BLAST' })
  })

  it('maps Sustained Hits ability with value', () => {
    const { units } = parseBSDataXml(UNIT_WITH_ABILITIES_XML, 'Test Faction')
    const cannon = units[0]!.weapons.find((w) => w.name === 'Scatter Cannon')
    expect(cannon!.abilities).toContainEqual({ type: 'SUSTAINED_HITS', value: 1 })
  })

  it('extracts ability profile names', () => {
    const { units } = parseBSDataXml(UNIT_WITH_ABILITIES_XML, 'Test Faction')
    expect(units[0]!.abilities).toContain('Heavy Armour')
  })
})

describe('parseBSDataXml — non-unit entries', () => {
  it('skips entries that are not type "unit" or "model"', () => {
    const { units } = parseBSDataXml(NON_UNIT_XML, 'Test Faction')
    expect(units).toHaveLength(0)
  })
})

describe('parseBSDataXml — nested selectionEntry', () => {
  const NESTED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-outer" name="Outer Squad" type="unit">
      <profiles>
        <profile id="p-outer" name="Outer Squad" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-outer" name="Outer Rifle" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <selectionEntries>
        <selectionEntry id="inner-model" name="Inner Model" type="model">
          <profiles>
            <profile id="p-inner" name="Inner Model" typeName="Model Characteristics">
              <characteristics>
                <characteristic name="M">5</characteristic>
                <characteristic name="T">3</characteristic>
                <characteristic name="Sv">4+</characteristic>
                <characteristic name="W">1</characteristic>
                <characteristic name="Ld">7</characteristic>
                <characteristic name="OC">1</characteristic>
              </characteristics>
            </profile>
            <profile id="w-inner" name="Inner Pistol" typeName="Ranged Weapons">
              <characteristics>
                <characteristic name="Range">12</characteristic>
                <characteristic name="A">1</characteristic>
                <characteristic name="BS">4+</characteristic>
                <characteristic name="S">3</characteristic>
                <characteristic name="AP">0</characteristic>
                <characteristic name="D">1</characteristic>
                <characteristic name="Abilities">-</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
      <costs>
        <cost name="pts" typeId="points" value="90" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

  it('excludes nested type="model" entries from output', () => {
    const { units, errors } = parseBSDataXml(NESTED_XML, 'Test Faction')
    expect(errors).toHaveLength(0)
    expect(units).toHaveLength(1)
    expect(units[0]!.id).toBe('unit-outer')
  })

  it('correctly parses the outer unit', () => {
    const { units } = parseBSDataXml(NESTED_XML, 'Test Faction')
    const outer = units[0]!
    expect(outer.name).toBe('Outer Squad')
    expect(outer.points).toBe(90)
  })

  it('outer unit weapons do not include nested model weapons', () => {
    const { units } = parseBSDataXml(NESTED_XML, 'Test Faction')
    const outer = units[0]!
    const weaponNames = outer.weapons.map((w) => w.name)
    expect(weaponNames).toContain('Outer Rifle')
    expect(weaponNames).not.toContain('Inner Pistol')
  })

  it('keeps a top-level type="model" as a standalone unit', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="char-001" name="Iron Father" type="model">
      <profiles>
        <profile id="pc1" name="Iron Father" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">5</characteristic>
            <characteristic name="T">5</characteristic>
            <characteristic name="Sv">2+</characteristic>
            <characteristic name="W">5</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="100" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test Faction')
    expect(errors).toHaveLength(0)
    expect(units).toHaveLength(1)
    expect(units[0]!.name).toBe('Iron Father')
  })

  it('mixed top-level units/models + nested models yields correct count', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="u1" name="Squad Alpha" type="unit">
      <profiles>
        <profile id="p1" name="Squad Alpha" typeName="Unit Characteristics">
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
        <selectionEntry id="nested-m1" name="Nested Marine" type="model">
          <profiles>
            <profile id="pn1" name="Nested Marine" typeName="Model Characteristics">
              <characteristics>
                <characteristic name="M">6</characteristic>
                <characteristic name="T">4</characteristic>
                <characteristic name="Sv">3+</characteristic>
                <characteristic name="W">1</characteristic>
                <characteristic name="Ld">6</characteristic>
                <characteristic name="OC">1</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
    <selectionEntry id="m1" name="Standalone Character" type="model">
      <profiles>
        <profile id="pm1" name="Standalone Character" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">5</characteristic>
            <characteristic name="T">5</characteristic>
            <characteristic name="Sv">2+</characteristic>
            <characteristic name="W">5</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units } = parseBSDataXml(xml, 'Test Faction')
    // Should have: Squad Alpha + Standalone Character = 2, NOT Nested Marine
    expect(units).toHaveLength(2)
    expect(units.map((u) => u.name).sort()).toEqual(['Squad Alpha', 'Standalone Character'])
  })
})

describe('parseBSDataXml — empty / malformed input', () => {
  it('returns empty results for empty string', () => {
    const { units, errors } = parseBSDataXml('', 'Test Faction')
    expect(units).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('returns empty results for non-XML input', () => {
    const { units } = parseBSDataXml('not xml at all', 'Test Faction')
    expect(units).toHaveLength(0)
  })
})
