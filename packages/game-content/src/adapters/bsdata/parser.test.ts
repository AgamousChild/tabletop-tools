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
    expect(unit.save).toBe(3) // "3+" → 3
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

describe('parseBSDataXml — faction-specific ability typeNames', () => {
  const FACTION_ABILITY_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-faction" name="Faction Caster" type="unit">
      <profiles>
        <profile id="p" name="Faction Caster" typeName="Unit">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w" name="Knife" typeName="Melee Weapons">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="WS">3+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">-</characteristic>
          </characteristics>
        </profile>
        <profile id="ab1" name="Order: Stand Firm" typeName="Orders">
          <characteristics>
            <characteristic name="Description">Hold ground.</characteristic>
          </characteristics>
        </profile>
        <profile id="ab2" name="C&apos;tan Power: Time&apos;s Arrow" typeName="C&apos;tan Powers">
          <characteristics>
            <characteristic name="Description">Erase a target.</characteristic>
          </characteristics>
        </profile>
        <profile id="ab3" name="Paragon of Hatred" typeName="Warmaster">
          <characteristics>
            <characteristic name="Ability">Re-roll a hit roll.</characteristic>
          </characteristics>
        </profile>
        <profile id="d1" name="Battles Survived" typeName="Deed">
          <characteristics>
            <characteristic name="Description">Crusade tracking.</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="100" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

  it('extracts ability with typeName="Orders"', () => {
    const { units } = parseBSDataXml(FACTION_ABILITY_XML, 'Test')
    expect(units[0]!.abilities).toContain('Order: Stand Firm')
  })

  it('extracts ability with typeName="C\'tan Powers" and decodes XML entities', () => {
    const { units } = parseBSDataXml(FACTION_ABILITY_XML, 'Test')
    expect(units[0]!.abilities).toContain("C'tan Power: Time's Arrow")
  })

  it('extracts ability description from characteristic name="Ability" (Warmaster)', () => {
    const { units } = parseBSDataXml(FACTION_ABILITY_XML, 'Test')
    expect(units[0]!.abilities).toContain('Paragon of Hatred')
    expect(units[0]!.abilityDescriptions?.['Paragon of Hatred']).toBe('Re-roll a hit roll.')
  })

  it('excludes Crusade Deed/Quality/Threat from abilities', () => {
    const { units } = parseBSDataXml(FACTION_ABILITY_XML, 'Test')
    expect(units[0]!.abilities).not.toContain('Battles Survived')
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

  it('outer unit weapons include nested model weapons', () => {
    const { units } = parseBSDataXml(NESTED_XML, 'Test Faction')
    const outer = units[0]!
    const weaponNames = outer.weapons.map((w) => w.name)
    expect(weaponNames).toContain('Outer Rifle')
    expect(weaponNames).toContain('Inner Pistol')
  })

  it('deduplicates weapons by name across nested models', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-dup" name="Dup Squad" type="unit">
      <profiles>
        <profile id="p-dup" name="Dup Squad" typeName="Unit Characteristics">
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
        <selectionEntry id="m1" name="Marine A" type="model">
          <profiles>
            <profile id="w-a" name="Bolt Rifle" typeName="Ranged Weapons">
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
          </profiles>
        </selectionEntry>
        <selectionEntry id="m2" name="Marine B" type="model">
          <profiles>
            <profile id="w-b" name="Bolt Rifle" typeName="Ranged Weapons">
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
          </profiles>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units } = parseBSDataXml(xml, 'Test Faction')
    const weaponNames = units[0]!.weapons.map((w) => w.name)
    expect(weaponNames).toEqual(['Bolt Rifle']) // deduplicated
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
    // Standalone character with no weapons gets a warning
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('No weapons found')
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

  it('extracts characteristics from nested model entries (real BSData format)', () => {
    // In real BSData XML, many units have their characteristic profile ONLY inside
    // a nested <selectionEntry type="model">, not at the outer unit level.
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="u1" name="Intercessor Squad" type="unit">
      <selectionEntries>
        <selectionEntry id="m1" name="Intercessor" type="model">
          <profiles>
            <profile id="p1" name="Intercessor" typeName="Unit">
              <characteristics>
                <characteristic name="M">6"</characteristic>
                <characteristic name="T">4</characteristic>
                <characteristic name="SV">3+</characteristic>
                <characteristic name="W">2</characteristic>
                <characteristic name="LD">6+</characteristic>
                <characteristic name="OC">2</characteristic>
              </characteristics>
            </profile>
            <profile id="w1" name="Bolt Rifle" typeName="Ranged Weapons">
              <characteristics>
                <characteristic name="Range">30"</characteristic>
                <characteristic name="A">2</characteristic>
                <characteristic name="BS">3+</characteristic>
                <characteristic name="S">4</characteristic>
                <characteristic name="AP">-1</characteristic>
                <characteristic name="D">1</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test Faction')
    expect(units).toHaveLength(1)
    const unit = units[0]!
    expect(unit.name).toBe('Intercessor Squad')
    expect(unit.toughness).toBe(4)
    expect(unit.save).toBe(3)
    expect(unit.wounds).toBe(2)
    expect(unit.weapons).toHaveLength(1)
    expect(unit.weapons[0]!.name).toBe('Bolt Rifle')
    // No warnings about missing characteristics
    expect(errors.filter((e) => e.includes('missing characteristic data'))).toHaveLength(0)
  })
})

describe('parseBSDataXml — additional weapon abilities', () => {
  const WEAPON_ABILITIES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-ab" name="Ability Test Unit" type="unit">
      <profiles>
        <profile id="p-ab" name="Ability Test Unit" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-heavy" name="Heavy Bolter" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">36</characteristic>
            <characteristic name="A">3</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">5</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">2</characteristic>
            <characteristic name="Abilities">Heavy, Sustained Hits 1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-rapid" name="Rapid Rifle" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">Rapid Fire 1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-lance" name="Power Lance" typeName="Melee Weapons">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">4</characteristic>
            <characteristic name="WS">3+</characteristic>
            <characteristic name="S">5</characteristic>
            <characteristic name="AP">-2</characteristic>
            <characteristic name="D">2</characteristic>
            <characteristic name="Abilities">Lance</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

  it('maps Heavy to HIT_MOD +1', () => {
    const { units } = parseBSDataXml(WEAPON_ABILITIES_XML, 'Test Faction')
    const weapon = units[0]!.weapons.find((w) => w.name === 'Heavy Bolter')
    expect(weapon!.abilities).toContainEqual({ type: 'HIT_MOD', value: 1 })
  })

  it('maps Rapid Fire 1 to ATTACKS_MOD +1', () => {
    const { units } = parseBSDataXml(WEAPON_ABILITIES_XML, 'Test Faction')
    const weapon = units[0]!.weapons.find((w) => w.name === 'Rapid Rifle')
    expect(weapon!.abilities).toContainEqual({ type: 'ATTACKS_MOD', value: 1 })
  })

  it('maps Lance to WOUND_MOD +1', () => {
    const { units } = parseBSDataXml(WEAPON_ABILITIES_XML, 'Test Faction')
    const weapon = units[0]!.weapons.find((w) => w.name === 'Power Lance')
    expect(weapon!.abilities).toContainEqual({ type: 'WOUND_MOD', value: 1 })
  })

  it('Heavy Bolter has both HIT_MOD and SUSTAINED_HITS', () => {
    const { units } = parseBSDataXml(WEAPON_ABILITIES_XML, 'Test Faction')
    const weapon = units[0]!.weapons.find((w) => w.name === 'Heavy Bolter')
    expect(weapon!.abilities).toHaveLength(2)
    expect(weapon!.abilities).toContainEqual({ type: 'HIT_MOD', value: 1 })
    expect(weapon!.abilities).toContainEqual({ type: 'SUSTAINED_HITS', value: 1 })
  })
})

describe('parseBSDataXml — invulnerable save and FNP', () => {
  const INVULN_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-inv" name="Shielded Warrior" type="unit">
      <profiles>
        <profile id="p-inv" name="Shielded Warrior" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">3</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="inv1" name="Shielded Warrior" typeName="Invulnerable Save">
          <characteristics>
            <characteristic name="Invulnerable Save">4+</characteristic>
          </characteristics>
        </profile>
        <profile id="ab-fnp" name="Resilient" typeName="Abilities">
          <characteristics>
            <characteristic name="Description">This model has a feel no pain 5+ save.</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

  it('extracts invulnerable save from dedicated profile', () => {
    const { units } = parseBSDataXml(INVULN_XML, 'Test Faction')
    expect(units[0]!.invulnSave).toBe(4)
  })

  it('extracts feel no pain from ability description', () => {
    const { units } = parseBSDataXml(INVULN_XML, 'Test Faction')
    expect(units[0]!.fnp).toBe(5)
  })

  it('extracts ability descriptions', () => {
    const { units } = parseBSDataXml(INVULN_XML, 'Test Faction')
    expect(units[0]!.abilityDescriptions).toBeDefined()
    expect(units[0]!.abilityDescriptions!['Resilient']).toBe(
      'This model has a feel no pain 5+ save.',
    )
  })

  it('unit without invuln has undefined invulnSave', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    expect(units[0]!.invulnSave).toBeUndefined()
  })

  it('unit without FNP has undefined fnp', () => {
    const { units } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    expect(units[0]!.fnp).toBeUndefined()
  })
})

describe('parseBSDataXml — ability descriptions from existing fixture', () => {
  it('extracts description from abilities profile', () => {
    const { units } = parseBSDataXml(UNIT_WITH_ABILITIES_XML, 'Test Faction')
    expect(units[0]!.abilityDescriptions).toBeDefined()
    expect(units[0]!.abilityDescriptions!['Heavy Armour']).toBe('Reduce damage by 1.')
  })
})

describe('parseBSDataXml — new weapon ability patterns', () => {
  function makeWeaponXml(abilities: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-new" name="Test Unit" type="unit">
      <profiles>
        <profile id="p-new" name="Test Unit" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-new" name="Test Weapon" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">8</characteristic>
            <characteristic name="AP">-4</characteristic>
            <characteristic name="D">D6</characteristic>
            <characteristic name="Abilities">${abilities}</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
  }

  it('maps Anti-Infantry 4+ to ANTI ability', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Anti-Infantry 4+'), 'Test')
    const w = units[0]!.weapons[0]!
    expect(w.abilities).toContainEqual({ type: 'ANTI', keyword: 'Infantry', value: 4 })
  })

  it('maps Anti-Vehicle 2+ to ANTI ability', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Anti-Vehicle 2+'), 'Test')
    const w = units[0]!.weapons[0]!
    expect(w.abilities).toContainEqual({ type: 'ANTI', keyword: 'Vehicle', value: 2 })
  })

  it('maps Melta 2 to MELTA ability', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Melta 2'), 'Test')
    const w = units[0]!.weapons[0]!
    expect(w.abilities).toContainEqual({ type: 'MELTA', value: 2 })
  })

  it('maps Ignores Cover', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Ignores Cover'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'IGNORES_COVER' })
  })

  it('maps Hazardous', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Hazardous'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'HAZARDOUS' })
  })

  it('maps Precision', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Precision'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'PRECISION' })
  })

  it('maps Indirect Fire', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Indirect Fire'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'INDIRECT_FIRE' })
  })

  it('maps Assault', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Assault'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'ASSAULT' })
  })

  it('maps Pistol', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Pistol'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'PISTOL' })
  })

  it('maps One Shot', () => {
    const { units } = parseBSDataXml(makeWeaponXml('One Shot'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'ONE_SHOT' })
  })

  it('maps Psychic', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Psychic'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'PSYCHIC' })
  })

  it('parses combined abilities: Anti-Infantry 4+, Melta 2, Ignores Cover', () => {
    const { units } = parseBSDataXml(
      makeWeaponXml('Anti-Infantry 4+, Melta 2, Ignores Cover'),
      'Test',
    )
    const w = units[0]!.weapons[0]!
    expect(w.abilities).toHaveLength(3)
    expect(w.abilities).toContainEqual({ type: 'ANTI', keyword: 'Infantry', value: 4 })
    expect(w.abilities).toContainEqual({ type: 'MELTA', value: 2 })
    expect(w.abilities).toContainEqual({ type: 'IGNORES_COVER' })
  })
})

describe('parseBSDataXml — parenthesized ability values', () => {
  function makeWeaponXml(abilities: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-paren" name="Paren Test Unit" type="unit">
      <profiles>
        <profile id="p-paren" name="Paren Test Unit" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-paren" name="Paren Weapon" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Abilities">${abilities}</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
  }

  it('handles "Sustained Hits (1)" with parentheses', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Sustained Hits (1)'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'SUSTAINED_HITS', value: 1 })
  })

  it('handles "Rapid Fire (2)" with parentheses', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Rapid Fire (2)'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'ATTACKS_MOD', value: 2 })
  })

  it('handles "Anti-Infantry (4+)" with parenthesized value', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Anti-Infantry (4+)'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({
      type: 'ANTI',
      keyword: 'Infantry',
      value: 4,
    })
  })

  it('handles "Melta (2)" with parentheses', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Melta (2)'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'MELTA', value: 2 })
  })

  it('filters dash-only ability text', () => {
    const { units } = parseBSDataXml(makeWeaponXml('-'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toHaveLength(0)
  })

  it('filters em-dash ability text', () => {
    const { units } = parseBSDataXml(makeWeaponXml('—'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toHaveLength(0)
  })

  it('handles bracketed ability text [TORRENT]', () => {
    const { units } = parseBSDataXml(makeWeaponXml('[TORRENT]'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'TORRENT' })
  })

  it('handles ability text with trailing period', () => {
    const { units } = parseBSDataXml(makeWeaponXml('Lethal Hits.'), 'Test')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'LETHAL_HITS' })
  })

  it('handles mixed brackets and periods', () => {
    const { units } = parseBSDataXml(makeWeaponXml('[BLAST], Sustained Hits 1.'), 'Test')
    const w = units[0]!.weapons[0]!
    expect(w.abilities).toContainEqual({ type: 'BLAST' })
    expect(w.abilities).toContainEqual({ type: 'SUSTAINED_HITS', value: 1 })
  })
})

describe('parseBSDataXml — validation warnings', () => {
  it('warns when unit has toughness 0', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-t0" name="Ghost Unit" type="unit">
      <profiles>
        <profile id="p-t0" name="Ghost Unit" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test')
    expect(units).toHaveLength(1)
    expect(units[0]!.toughness).toBe(0)
    expect(errors.some((e) => e.includes('Toughness is 0'))).toBe(true)
  })

  it('warns when unit has no weapons', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-nw" name="Unarmed Unit" type="unit">
      <profiles>
        <profile id="p-nw" name="Unarmed Unit" typeName="Unit Characteristics">
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
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test')
    expect(units).toHaveLength(1)
    expect(errors.some((e) => e.includes('No weapons found'))).toBe(true)
  })

  it('warns when weapon has strength 0 (empty value)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-ws0" name="Weak Weapon Unit" type="unit">
      <profiles>
        <profile id="p-ws0" name="Weak Weapon Unit" typeName="Unit Characteristics">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">4</characteristic>
            <characteristic name="Sv">3+</characteristic>
            <characteristic name="W">2</characteristic>
            <characteristic name="Ld">6</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="w-ws0" name="Broken Gun" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S"></characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test')
    expect(units).toHaveLength(1)
    expect(errors.some((e) => e.includes('Strength 0'))).toBe(true)
  })

  it('no warnings for properly formed unit', () => {
    const { errors } = parseBSDataXml(SINGLE_UNIT_XML, 'Test Faction')
    expect(errors).toHaveLength(0)
  })
})

describe('parseBSDataXml — BSData 2025+ format (typeName="Unit", uppercase stat names)', () => {
  const BSDATA_NEW_FORMAT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="unit-new" name="Shield Guard" type="unit">
      <profiles>
        <profile id="p-new" name="Shield Guard" hidden="false" typeId="c547" typeName="Unit">
          <characteristics>
            <characteristic name="M" typeId="e703">6"</characteristic>
            <characteristic name="T" typeId="d29d">6</characteristic>
            <characteristic name="SV" typeId="450a">2+</characteristic>
            <characteristic name="W" typeId="750a">3</characteristic>
            <characteristic name="LD" typeId="58d2">6+</characteristic>
            <characteristic name="OC" typeId="bef7">2</characteristic>
          </characteristics>
        </profile>
        <profile id="w-new" name="Guardian Spear" hidden="false" typeId="f77d" typeName="Ranged Weapons">
          <characteristics>
            <characteristic name="Range" typeId="9896">24"</characteristic>
            <characteristic name="A" typeId="3bb0">2</characteristic>
            <characteristic name="BS" typeId="94d0">2+</characteristic>
            <characteristic name="S" typeId="2229">4</characteristic>
            <characteristic name="AP" typeId="9ead">-1</characteristic>
            <characteristic name="D" typeId="a354">2</characteristic>
            <characteristic name="Keywords" typeId="7f1b">Assault</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <costs>
        <cost name="pts" typeId="points" value="50" />
      </costs>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`

  it('parses typeName="Unit" (without "Characteristics" suffix)', () => {
    const { units, errors } = parseBSDataXml(BSDATA_NEW_FORMAT_XML, 'Test')
    expect(units).toHaveLength(1)
    expect(units[0]!.toughness).toBe(6)
    expect(units[0]!.save).toBe(2)
    expect(units[0]!.wounds).toBe(3)
    expect(units[0]!.leadership).toBe(6)
    expect(units[0]!.oc).toBe(2)
    // No validation warnings for T or Sv
    expect(errors.some((e) => e.includes('Toughness is 0'))).toBe(false)
    expect(errors.some((e) => e.includes('Save is 0'))).toBe(false)
  })

  it('handles uppercase characteristic names SV and LD', () => {
    const { units } = parseBSDataXml(BSDATA_NEW_FORMAT_XML, 'Test')
    expect(units[0]!.save).toBe(2)
    expect(units[0]!.leadership).toBe(6)
  })

  it('parses weapons with Keywords characteristic (not Abilities)', () => {
    const { units } = parseBSDataXml(BSDATA_NEW_FORMAT_XML, 'Test')
    expect(units[0]!.weapons).toHaveLength(1)
    expect(units[0]!.weapons[0]!.name).toBe('Guardian Spear')
    expect(units[0]!.weapons[0]!.abilities).toContainEqual({ type: 'ASSAULT' })
  })

  it('handles inch marks in stat values (6" → 6)', () => {
    const { units } = parseBSDataXml(BSDATA_NEW_FORMAT_XML, 'Test')
    expect(units[0]!.move).toBe(6)
  })

  it('parses typeName="Model" (without "Characteristics" suffix)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gameSystem id="test-sys" name="TestGame">
  <selectionEntries>
    <selectionEntry id="model-new" name="Lone Champion" type="model">
      <profiles>
        <profile id="pm" name="Lone Champion" typeName="Model">
          <characteristics>
            <characteristic name="M">8</characteristic>
            <characteristic name="T">5</characteristic>
            <characteristic name="SV">3+</characteristic>
            <characteristic name="W">4</characteristic>
            <characteristic name="LD">7+</characteristic>
            <characteristic name="OC">1</characteristic>
          </characteristics>
        </profile>
        <profile id="wm" name="Power Blade" typeName="Melee Weapons">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">4</characteristic>
            <characteristic name="WS">2+</characteristic>
            <characteristic name="S">5</characteristic>
            <characteristic name="AP">-2</characteristic>
            <characteristic name="D">2</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </selectionEntries>
</gameSystem>`
    const { units, errors } = parseBSDataXml(xml, 'Test')
    expect(units).toHaveLength(1)
    expect(units[0]!.toughness).toBe(5)
    expect(units[0]!.save).toBe(3)
    expect(units[0]!.leadership).toBe(7)
    expect(errors.some((e) => e.includes('Toughness is 0'))).toBe(false)
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

// ---- Link resolution tests ----
// BSData XML uses <infoLink> and <entryLink> to reference shared definitions.
// These tests verify that the parser resolves these references correctly.

const INFOLINK_PROFILE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test" name="Test">
  <sharedSelectionEntries>
    <selectionEntry type="unit" import="true" name="Alpha Squad" hidden="false" id="unit-alpha">
      <selectionEntries>
        <selectionEntry type="model" name="Alpha Trooper" id="model-alpha">
          <infoLinks>
            <infoLink name="Alpha Trooper" hidden="false" type="profile" id="il-1" targetId="profile-alpha"/>
          </infoLinks>
          <entryLinks>
            <entryLink import="true" name="Pulse Rifle" hidden="false" type="selectionEntry" id="el-1" targetId="weapon-pulse"/>
            <entryLink import="true" name="Combat Blade" hidden="false" type="selectionEntry" id="el-2" targetId="weapon-blade"/>
          </entryLinks>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
    <selectionEntry type="upgrade" name="Pulse Rifle" id="weapon-pulse">
      <profiles>
        <profile name="Pulse Rifle" typeName="Ranged Weapons" hidden="false" id="wp-pulse">
          <characteristics>
            <characteristic name="Range">30</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">5</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">Rapid Fire 1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry type="upgrade" name="Combat Blade" id="weapon-blade">
      <profiles>
        <profile name="Combat Blade" typeName="Melee Weapons" hidden="false" id="wp-blade">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">3</characteristic>
            <characteristic name="WS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
  <sharedProfiles>
    <profile name="Alpha Trooper" typeId="c547" typeName="Unit" hidden="false" id="profile-alpha">
      <characteristics>
        <characteristic name="M">6"</characteristic>
        <characteristic name="T">3</characteristic>
        <characteristic name="SV">5+</characteristic>
        <characteristic name="W">1</characteristic>
        <characteristic name="LD">7+</characteristic>
        <characteristic name="OC">2</characteristic>
      </characteristics>
    </profile>
  </sharedProfiles>
</catalogue>`

const ENTRYLINK_MODEL_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test" name="Test">
  <selectionEntries>
    <selectionEntry type="unit" import="true" name="Bravo Team" hidden="false" id="unit-bravo">
      <costs>
        <cost name="pts" typeId="pts" value="65"/>
      </costs>
      <profiles>
        <profile name="Resilience" typeName="Abilities" hidden="false" id="abil-1">
          <characteristics>
            <characteristic name="Description">Objective Secured</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <selectionEntryGroups>
        <selectionEntryGroup name="Unit Composition" hidden="false" id="seg-1">
          <entryLinks>
            <entryLink import="true" name="Bravo Sergeant" hidden="false" type="selectionEntry" id="el-sgt" targetId="model-sgt"/>
            <entryLink import="true" name="Bravo Trooper" hidden="false" type="selectionEntry" id="el-trp" targetId="model-trp"/>
          </entryLinks>
        </selectionEntryGroup>
      </selectionEntryGroups>
    </selectionEntry>
  </selectionEntries>
  <sharedSelectionEntries>
    <selectionEntry type="model" name="Bravo Trooper" id="model-trp">
      <infoLinks>
        <infoLink name="Bravo Trooper" type="profile" id="il-trp" targetId="profile-bravo"/>
      </infoLinks>
      <entryLinks>
        <entryLink import="true" name="Autogun" type="selectionEntry" id="el-auto" targetId="weapon-auto"/>
        <entryLink import="true" name="Bayonet" type="selectionEntry" id="el-bayo" targetId="weapon-bayo"/>
      </entryLinks>
    </selectionEntry>
    <selectionEntry type="model" name="Bravo Sergeant" id="model-sgt">
      <infoLinks>
        <infoLink name="Bravo Sergeant" type="profile" id="il-sgt" targetId="profile-bravo"/>
      </infoLinks>
      <entryLinks>
        <entryLink import="true" name="Pistol" type="selectionEntry" id="el-pist" targetId="weapon-pistol"/>
        <entryLink import="true" name="Bayonet" type="selectionEntry" id="el-bayo2" targetId="weapon-bayo"/>
      </entryLinks>
    </selectionEntry>
    <selectionEntry type="upgrade" name="Autogun" id="weapon-auto">
      <profiles>
        <profile name="Autogun" typeName="Ranged Weapons" hidden="false" id="wp-auto">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">Rapid Fire 1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry type="upgrade" name="Pistol" id="weapon-pistol">
      <profiles>
        <profile name="Pistol" typeName="Ranged Weapons" hidden="false" id="wp-pistol">
          <characteristics>
            <characteristic name="Range">12</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">Pistol</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry type="upgrade" name="Bayonet" id="weapon-bayo">
      <profiles>
        <profile name="Bayonet" typeName="Melee Weapons" hidden="false" id="wp-bayo">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="WS">4+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
  <sharedProfiles>
    <profile name="Bravo Trooper" typeName="Unit" hidden="false" id="profile-bravo">
      <characteristics>
        <characteristic name="M">6"</characteristic>
        <characteristic name="T">3</characteristic>
        <characteristic name="SV">5+</characteristic>
        <characteristic name="W">1</characteristic>
        <characteristic name="LD">7+</characteristic>
        <characteristic name="OC">2</characteristic>
      </characteristics>
    </profile>
  </sharedProfiles>
</catalogue>`

describe('parseBSDataXml — infoLink/entryLink resolution', () => {
  it('resolves infoLink to shared profile for characteristics', () => {
    const { units, errors } = parseBSDataXml(INFOLINK_PROFILE_XML, 'Test')
    const unit = units.find((u) => u.name === 'Alpha Squad')
    expect(unit).toBeDefined()
    expect(unit!.toughness).toBe(3)
    expect(unit!.save).toBe(5)
    expect(unit!.wounds).toBe(1)
    expect(unit!.leadership).toBe(7)
    expect(unit!.oc).toBe(2)
    // Should not have toughness/save warnings
    const charErrors = errors.filter(
      (e) => e.includes('Alpha Squad') && e.includes('missing characteristic'),
    )
    expect(charErrors).toHaveLength(0)
  })

  it('resolves entryLink to shared weapon definitions', () => {
    const { units, errors } = parseBSDataXml(INFOLINK_PROFILE_XML, 'Test')
    const unit = units.find((u) => u.name === 'Alpha Squad')
    expect(unit).toBeDefined()
    expect(unit!.weapons.length).toBeGreaterThanOrEqual(2)
    const pulse = unit!.weapons.find((w) => w.name === 'Pulse Rifle')
    expect(pulse).toBeDefined()
    expect(pulse!.strength).toBe(5)
    expect(pulse!.range).toBe(30)
    const blade = unit!.weapons.find((w) => w.name === 'Combat Blade')
    expect(blade).toBeDefined()
    expect(blade!.range).toBe('melee')
    // Should not have "no weapons" warning for this unit
    const weaponErrors = errors.filter((e) => e.includes('Alpha Squad') && e.includes('No weapons'))
    expect(weaponErrors).toHaveLength(0)
  })

  it('resolves nested entryLink → model → infoLink → profile chain', () => {
    const { units, errors } = parseBSDataXml(ENTRYLINK_MODEL_XML, 'Test')
    const unit = units.find((u) => u.name === 'Bravo Team')
    expect(unit).toBeDefined()
    // Characteristics resolved via: unit → entryLink(model) → infoLink(profile) → shared profile
    expect(unit!.toughness).toBe(3)
    expect(unit!.save).toBe(5)
    const charErrors = errors.filter(
      (e) => e.includes('Bravo Team') && e.includes('missing characteristic'),
    )
    expect(charErrors).toHaveLength(0)
  })

  it('resolves weapons from entryLink → model → entryLink → weapon chain', () => {
    const { units, errors } = parseBSDataXml(ENTRYLINK_MODEL_XML, 'Test')
    const unit = units.find((u) => u.name === 'Bravo Team')
    expect(unit).toBeDefined()
    // Weapons resolved via: unit → entryLink(model) → entryLink(weapon) → profile
    const autogun = unit!.weapons.find((w) => w.name === 'Autogun')
    expect(autogun).toBeDefined()
    expect(autogun!.strength).toBe(3)
    const pistol = unit!.weapons.find((w) => w.name === 'Pistol')
    expect(pistol).toBeDefined()
    const bayonet = unit!.weapons.find((w) => w.name === 'Bayonet')
    expect(bayonet).toBeDefined()
    expect(bayonet!.range).toBe('melee')
    const weaponErrors = errors.filter((e) => e.includes('Bravo Team') && e.includes('No weapons'))
    expect(weaponErrors).toHaveLength(0)
  })

  it('deduplicates weapons referenced by multiple models', () => {
    const { units } = parseBSDataXml(ENTRYLINK_MODEL_XML, 'Test')
    const unit = units.find((u) => u.name === 'Bravo Team')
    expect(unit).toBeDefined()
    // Both Sergeant and Trooper reference Bayonet, but it should appear only once
    const bayonets = unit!.weapons.filter((w) => w.name === 'Bayonet')
    expect(bayonets).toHaveLength(1)
  })
})

describe('parseBSDataXml — selectionEntryGroup resolution', () => {
  // BSData XML commonly defines weapons inside <selectionEntryGroup> elements
  // in <sharedSelectionEntryGroups>, then references them via <entryLink type="selectionEntryGroup">.
  // This is how most real units (Space Marines, Orks, Tau, etc.) define their weapon options.
  const SEG_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test" name="Test">
  <selectionEntries>
    <selectionEntry type="unit" name="Vanguard Squad" id="unit-van">
      <selectionEntries>
        <selectionEntry type="model" name="Vanguard Trooper" id="model-van">
          <infoLinks>
            <infoLink name="Vanguard Trooper" type="profile" id="il-van" targetId="profile-van"/>
          </infoLinks>
          <entryLinks>
            <entryLink import="true" name="Ranged Weapons" type="selectionEntryGroup" id="el-seg1" targetId="seg-ranged"/>
            <entryLink import="true" name="Melee Weapons" type="selectionEntryGroup" id="el-seg2" targetId="seg-melee"/>
          </entryLinks>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </selectionEntries>
  <sharedSelectionEntryGroups>
    <selectionEntryGroup name="Ranged Weapons" id="seg-ranged">
      <selectionEntries>
        <selectionEntry type="upgrade" name="Plasma Gun" id="weapon-plasma-entry">
          <profiles>
            <profile name="Plasma Gun" typeName="Ranged Weapons" id="wp-plasma">
              <characteristics>
                <characteristic name="Range">24</characteristic>
                <characteristic name="A">2</characteristic>
                <characteristic name="BS">3+</characteristic>
                <characteristic name="S">7</characteristic>
                <characteristic name="AP">-2</characteristic>
                <characteristic name="D">1</characteristic>
                <characteristic name="Keywords">Rapid Fire 1</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
    </selectionEntryGroup>
    <selectionEntryGroup name="Melee Weapons" id="seg-melee">
      <entryLinks>
        <entryLink import="true" name="Chain Sword" type="selectionEntry" id="el-chain" targetId="weapon-chain"/>
      </entryLinks>
    </selectionEntryGroup>
  </sharedSelectionEntryGroups>
  <sharedSelectionEntries>
    <selectionEntry type="upgrade" name="Chain Sword" id="weapon-chain">
      <profiles>
        <profile name="Chain Sword" typeName="Melee Weapons" id="wp-chain">
          <characteristics>
            <characteristic name="Range">Melee</characteristic>
            <characteristic name="A">4</characteristic>
            <characteristic name="WS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
  <sharedProfiles>
    <profile name="Vanguard Trooper" typeName="Unit" id="profile-van">
      <characteristics>
        <characteristic name="M">6"</characteristic>
        <characteristic name="T">4</characteristic>
        <characteristic name="SV">3+</characteristic>
        <characteristic name="W">2</characteristic>
        <characteristic name="LD">6+</characteristic>
        <characteristic name="OC">2</characteristic>
      </characteristics>
    </profile>
  </sharedProfiles>
</catalogue>`

  it('resolves entryLink type="selectionEntryGroup" to find weapons in shared groups', () => {
    const { units, errors } = parseBSDataXml(SEG_XML, 'Test')
    const unit = units.find((u) => u.name === 'Vanguard Squad')
    expect(unit).toBeDefined()
    const plasma = unit!.weapons.find((w) => w.name === 'Plasma Gun')
    expect(plasma).toBeDefined()
    expect(plasma!.strength).toBe(7)
    expect(plasma!.ap).toBe(-2)
    const weaponErrors = errors.filter(
      (e) => e.includes('Vanguard Squad') && e.includes('No weapons'),
    )
    expect(weaponErrors).toHaveLength(0)
  })

  it('resolves nested entryLink inside selectionEntryGroup to shared weapon definitions', () => {
    const { units } = parseBSDataXml(SEG_XML, 'Test')
    const unit = units.find((u) => u.name === 'Vanguard Squad')
    expect(unit).toBeDefined()
    const chain = unit!.weapons.find((w) => w.name === 'Chain Sword')
    expect(chain).toBeDefined()
    expect(chain!.range).toBe('melee')
    expect(chain!.attacks).toBe(4)
  })

  it('resolves characteristics from shared profile via infoLink alongside selectionEntryGroup weapons', () => {
    const { units, errors } = parseBSDataXml(SEG_XML, 'Test')
    const unit = units.find((u) => u.name === 'Vanguard Squad')
    expect(unit).toBeDefined()
    expect(unit!.toughness).toBe(4)
    expect(unit!.save).toBe(3)
    const charErrors = errors.filter(
      (e) => e.includes('Vanguard Squad') && e.includes('missing characteristic'),
    )
    expect(charErrors).toHaveLength(0)
  })
})

describe('parseBSDataXml — infoGroup resolution', () => {
  // BSData XML sometimes defines unit characteristics inside an <infoGroup> in <sharedInfoGroups>,
  // then references it via <infoLink type="infoGroup">. The infoGroup may contain nested
  // <infoLink type="profile"> references that need further resolution.
  const INFOGROUP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test" name="Test">
  <selectionEntries>
    <selectionEntry type="unit" name="Echo Squad" id="unit-echo">
      <selectionEntries>
        <selectionEntry type="model" name="Echo Trooper" id="model-echo">
          <infoLinks>
            <infoLink name="Echo Stats" type="infoGroup" id="il-ig1" targetId="ig-echo"/>
          </infoLinks>
          <entryLinks>
            <entryLink import="true" name="Lasgun" type="selectionEntry" id="el-las" targetId="weapon-las"/>
          </entryLinks>
        </selectionEntry>
      </selectionEntries>
    </selectionEntry>
  </selectionEntries>
  <sharedInfoGroups>
    <infoGroup name="Echo Stats" id="ig-echo">
      <infoLinks>
        <infoLink name="Echo Trooper" type="profile" id="il-echo-prof" targetId="profile-echo"/>
      </infoLinks>
      <profiles>
        <profile name="Shield Wall" typeName="Abilities" id="ab-shield">
          <characteristics>
            <characteristic name="Description">+1 to save rolls.</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </infoGroup>
  </sharedInfoGroups>
  <sharedSelectionEntries>
    <selectionEntry type="upgrade" name="Lasgun" id="weapon-las">
      <profiles>
        <profile name="Lasgun" typeName="Ranged Weapons" id="wp-las">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">Rapid Fire 1</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
  <sharedProfiles>
    <profile name="Echo Trooper" typeName="Unit" id="profile-echo">
      <characteristics>
        <characteristic name="M">6"</characteristic>
        <characteristic name="T">3</characteristic>
        <characteristic name="SV">5+</characteristic>
        <characteristic name="W">1</characteristic>
        <characteristic name="LD">7+</characteristic>
        <characteristic name="OC">2</characteristic>
      </characteristics>
    </profile>
  </sharedProfiles>
</catalogue>`

  it('resolves infoLink type="infoGroup" → infoGroup → infoLink type="profile" for characteristics', () => {
    const { units, errors } = parseBSDataXml(INFOGROUP_XML, 'Test')
    const unit = units.find((u) => u.name === 'Echo Squad')
    expect(unit).toBeDefined()
    expect(unit!.toughness).toBe(3)
    expect(unit!.save).toBe(5)
    expect(unit!.wounds).toBe(1)
    const charErrors = errors.filter(
      (e) => e.includes('Echo Squad') && e.includes('missing characteristic'),
    )
    expect(charErrors).toHaveLength(0)
  })

  it('resolves abilities defined inline within the infoGroup', () => {
    const { units } = parseBSDataXml(INFOGROUP_XML, 'Test')
    const unit = units.find((u) => u.name === 'Echo Squad')
    expect(unit).toBeDefined()
    expect(unit!.abilities).toContain('Shield Wall')
  })

  it('resolves weapons alongside infoGroup-based characteristics', () => {
    const { units, errors } = parseBSDataXml(INFOGROUP_XML, 'Test')
    const unit = units.find((u) => u.name === 'Echo Squad')
    expect(unit).toBeDefined()
    const lasgun = unit!.weapons.find((w) => w.name === 'Lasgun')
    expect(lasgun).toBeDefined()
    expect(lasgun!.strength).toBe(3)
    const weaponErrors = errors.filter((e) => e.includes('Echo Squad') && e.includes('No weapons'))
    expect(weaponErrors).toHaveLength(0)
  })
})

describe('parseBSDataXml — shared sub-model filtering', () => {
  // In BSData XML, <sharedSelectionEntries> contains reusable sub-models (type="model")
  // that are referenced by units via <entryLink>. These should NOT be extracted as
  // standalone units — they produce false "No weapons"/"Toughness 0" validation errors.
  // However, type="unit" entries in shared sections ARE legitimate standalone units.
  const SHARED_MODEL_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test" name="Test">
  <selectionEntries>
    <selectionEntry type="unit" name="Foxtrot Squad" id="unit-fox">
      <entryLinks>
        <entryLink import="true" name="Foxtrot Trooper" type="selectionEntry" id="el-fox" targetId="model-fox"/>
      </entryLinks>
    </selectionEntry>
  </selectionEntries>
  <sharedSelectionEntries>
    <selectionEntry type="model" name="Foxtrot Trooper" id="model-fox">
      <profiles>
        <profile name="Foxtrot Trooper" typeName="Unit" id="prof-fox">
          <characteristics>
            <characteristic name="M">6</characteristic>
            <characteristic name="T">3</characteristic>
            <characteristic name="SV">5+</characteristic>
            <characteristic name="W">1</characteristic>
            <characteristic name="LD">7+</characteristic>
            <characteristic name="OC">2</characteristic>
          </characteristics>
        </profile>
        <profile name="Lasgun" typeName="Ranged Weapons" id="wp-fox-las">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">1</characteristic>
            <characteristic name="BS">4+</characteristic>
            <characteristic name="S">3</characteristic>
            <characteristic name="AP">0</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
    <selectionEntry type="unit" name="Shared Reusable Unit" id="shared-unit-1">
      <profiles>
        <profile name="Shared Reusable Unit" typeName="Unit" id="prof-shared">
          <characteristics>
            <characteristic name="M">8</characteristic>
            <characteristic name="T">5</characteristic>
            <characteristic name="SV">3+</characteristic>
            <characteristic name="W">4</characteristic>
            <characteristic name="LD">6+</characteristic>
            <characteristic name="OC">2</characteristic>
          </characteristics>
        </profile>
        <profile name="Bolt Rifle" typeName="Ranged Weapons" id="wp-shared-bolt">
          <characteristics>
            <characteristic name="Range">24</characteristic>
            <characteristic name="A">2</characteristic>
            <characteristic name="BS">3+</characteristic>
            <characteristic name="S">4</characteristic>
            <characteristic name="AP">-1</characteristic>
            <characteristic name="D">1</characteristic>
            <characteristic name="Keywords">-</characteristic>
          </characteristics>
        </profile>
      </profiles>
    </selectionEntry>
  </sharedSelectionEntries>
</catalogue>`

  it('does not extract type="model" entries from sharedSelectionEntries as standalone units', () => {
    const { units } = parseBSDataXml(SHARED_MODEL_XML, 'Test')
    const foxTrooper = units.find((u) => u.name === 'Foxtrot Trooper')
    expect(foxTrooper).toBeUndefined()
  })

  it('still extracts the parent unit that references the shared model', () => {
    const { units } = parseBSDataXml(SHARED_MODEL_XML, 'Test')
    const foxSquad = units.find((u) => u.name === 'Foxtrot Squad')
    expect(foxSquad).toBeDefined()
  })

  it('keeps type="unit" entries from sharedSelectionEntries as legitimate units', () => {
    const { units } = parseBSDataXml(SHARED_MODEL_XML, 'Test')
    const sharedUnit = units.find((u) => u.name === 'Shared Reusable Unit')
    expect(sharedUnit).toBeDefined()
    expect(sharedUnit!.toughness).toBe(5)
  })

  it('resolves weapons from shared model into parent unit via entryLink', () => {
    const { units } = parseBSDataXml(SHARED_MODEL_XML, 'Test')
    const foxSquad = units.find((u) => u.name === 'Foxtrot Squad')
    expect(foxSquad).toBeDefined()
    const lasgun = foxSquad!.weapons.find((w) => w.name === 'Lasgun')
    expect(lasgun).toBeDefined()
  })
})

describe('subfaction extraction', () => {
  const SUBFACTION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue id="test-cat" name="Test">
  <sharedSelectionEntryGroups>
    <selectionEntryGroup name="Chapter" id="grp-chapter" hidden="false">
      <selectionEntries>
        <selectionEntry type="upgrade" name="Iron Brothers" id="sf-iron-brothers" hidden="false"/>
        <selectionEntry type="upgrade" name="Crimson Knights" id="sf-crimson-knights" hidden="false"/>
      </selectionEntries>
    </selectionEntryGroup>
    <selectionEntryGroup name="Dynasty" id="grp-dynasty" hidden="false">
      <selectionEntries>
        <selectionEntry type="upgrade" name="Steel Dynasty" id="sf-steel" hidden="false"/>
      </selectionEntries>
    </selectionEntryGroup>
  </sharedSelectionEntryGroups>
</catalogue>`

  it('extracts subfactions from known group names with id + name + parent faction', () => {
    const { subfactions } = parseBSDataXml(SUBFACTION_XML, 'Test Faction')
    expect(subfactions).toHaveLength(3)
    const iron = subfactions.find((s) => s.id === 'sf-iron-brothers')
    expect(iron).toEqual({
      id: 'sf-iron-brothers',
      name: 'Iron Brothers',
      faction: 'Test Faction',
      groupName: 'Chapter',
    })
    const dyn = subfactions.find((s) => s.groupName === 'Dynasty')
    expect(dyn?.name).toBe('Steel Dynasty')
  })

  it('dedupes by id so a subfaction referenced from multiple groups counts once', () => {
    const xml = `<catalogue>
      <selectionEntryGroup name="Chapter" id="g1"><selectionEntries>
        <selectionEntry type="upgrade" name="X" id="dup-id"/>
      </selectionEntries></selectionEntryGroup>
      <selectionEntryGroup name="Chapter" id="g2"><selectionEntries>
        <selectionEntry type="upgrade" name="X" id="dup-id"/>
      </selectionEntries></selectionEntryGroup>
    </catalogue>`
    const { subfactions } = parseBSDataXml(xml, 'Test')
    expect(subfactions).toHaveLength(1)
  })

  it('ignores non-upgrade selectionEntries inside the group', () => {
    const xml = `<catalogue>
      <selectionEntryGroup name="Chapter" id="g1"><selectionEntries>
        <selectionEntry type="model" name="A model unit" id="not-a-subfaction"/>
        <selectionEntry type="upgrade" name="Real Subfaction" id="real"/>
      </selectionEntries></selectionEntryGroup>
    </catalogue>`
    const { subfactions } = parseBSDataXml(xml, 'Test')
    expect(subfactions).toHaveLength(1)
    expect(subfactions[0]?.id).toBe('real')
  })

  it('returns an empty array when no recognized group is present', () => {
    const xml = `<catalogue><selectionEntryGroup name="Random Group" id="g1"><selectionEntries>
      <selectionEntry type="upgrade" name="Not A Subfaction" id="x"/>
    </selectionEntries></selectionEntryGroup></catalogue>`
    const { subfactions } = parseBSDataXml(xml, 'Test')
    expect(subfactions).toEqual([])
  })
})
