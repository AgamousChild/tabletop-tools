import { describe, expect, it } from 'vitest'

import { validateAttachment } from './list-attachment'

const canLeadRecords = [
  {
    leaderDatasheetId: 'ds-captain',
    bodyguardDatasheetId: 'ds-marines',
    role: 'leader' as const,
  },
  {
    leaderDatasheetId: 'ds-apoth',
    bodyguardDatasheetId: 'ds-marines',
    role: 'support' as const,
  },
]

describe('validateAttachment', () => {
  it('allows valid leader attachment', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-captain',
      characterDatasheetId: 'ds-captain',
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'leader',
      existingAttachments: [],
      canLeadRecords,
    })
    expect(result.valid).toBe(true)
  })

  it('allows valid support attachment alongside a leader', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-apoth',
      characterDatasheetId: 'ds-apoth',
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'support',
      existingAttachments: [{ characterUnitId: 'unit-captain', attachRole: 'leader' }],
      canLeadRecords,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects when leader slot already filled', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-captain-2',
      characterDatasheetId: 'ds-captain',
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'leader',
      existingAttachments: [{ characterUnitId: 'unit-captain', attachRole: 'leader' }],
      canLeadRecords,
    })
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/leader.*already/i)
  })

  it('rejects when support slot already filled', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-apoth-2',
      characterDatasheetId: 'ds-apoth',
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'support',
      existingAttachments: [{ characterUnitId: 'unit-apoth', attachRole: 'support' }],
      canLeadRecords,
    })
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/support.*already/i)
  })

  it('rejects character not in can_lead for that bodyguard', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-librarian',
      characterDatasheetId: 'ds-librarian', // not in canLeadRecords for ds-marines
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'leader',
      existingAttachments: [],
      canLeadRecords,
    })
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/cannot lead/i)
  })

  it('rejects self-attachment', () => {
    const result = validateAttachment({
      characterUnitId: 'unit-marines',
      characterDatasheetId: 'ds-captain',
      bodyguardUnitId: 'unit-marines',
      bodyguardDatasheetId: 'ds-marines',
      proposedRole: 'leader',
      existingAttachments: [],
      canLeadRecords,
    })
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toMatch(/self/i)
  })
})
