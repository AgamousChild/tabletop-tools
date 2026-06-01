/**
 * Attachment-constraint engine for list_unit.
 * Enforces the 11th-edition rule: a bodyguard unit may have ≤1 Leader and ≤1 Support attached.
 * Gated by can_lead content refs (which characters may lead which units).
 *
 * See docs/superpowers/specs/2026-05-26-list-data-model-design.md §5
 */

/** Which characters may lead/support which bodyguard units (from content_entity). */
export interface CanLeadRecord {
  leaderDatasheetId: string
  bodyguardDatasheetId: string
  role: 'leader' | 'support'
}

/** An existing attachment on a bodyguard (from the current list_unit rows). */
export interface ExistingAttachment {
  characterUnitId: string
  attachRole: 'leader' | 'support'
}

/** Full input to validate a proposed attachment. */
export interface AttachmentValidationInput {
  characterUnitId: string
  characterDatasheetId: string
  bodyguardUnitId: string
  bodyguardDatasheetId: string
  proposedRole: 'leader' | 'support'
  /** Current attachments on this bodyguard (both leader and support slots). */
  existingAttachments: ExistingAttachment[]
  canLeadRecords: CanLeadRecord[]
}

export type AttachmentResult = { valid: true } | { valid: false; reason: string }

/**
 * Validate a proposed attachment.
 *
 * Checks (in order):
 * 1. Self-attachment is forbidden.
 * 2. The character's datasheet must be in can_lead for this bodyguard + role.
 * 3. The role slot must not already be filled on the bodyguard.
 */
export function validateAttachment(input: AttachmentValidationInput): AttachmentResult {
  const {
    characterUnitId,
    characterDatasheetId,
    bodyguardUnitId,
    bodyguardDatasheetId,
    proposedRole,
    existingAttachments,
    canLeadRecords,
  } = input

  if (characterUnitId === bodyguardUnitId) {
    return { valid: false, reason: 'Self-attachment is not allowed' }
  }

  const allowed = canLeadRecords.find(
    (r) =>
      r.leaderDatasheetId === characterDatasheetId &&
      r.bodyguardDatasheetId === bodyguardDatasheetId &&
      r.role === proposedRole,
  )
  if (!allowed) {
    return {
      valid: false,
      reason: `Cannot lead: ${characterDatasheetId} cannot ${proposedRole} ${bodyguardDatasheetId}`,
    }
  }

  const slotTaken = existingAttachments.some((a) => a.attachRole === proposedRole)
  if (slotTaken) {
    const capitalized = proposedRole.charAt(0).toUpperCase() + proposedRole.slice(1)
    return {
      valid: false,
      reason: `${capitalized} slot already filled for this unit`,
    }
  }

  return { valid: true }
}
