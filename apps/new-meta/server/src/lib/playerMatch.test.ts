import { describe, it, expect } from 'vitest'
import { matchPlayerName, batchMatchPlayerNames } from './playerMatch.js'
import type { UserRow } from './playerMatch.js'

const USERS: UserRow[] = [
  { id: 'user-1', username: 'alice',      displayUsername: 'Alice' },
  { id: 'user-2', username: 'bob_smith',  displayUsername: 'Bob Smith' },
  { id: 'user-3', username: null,         displayUsername: 'Carol Jones' },
  { id: 'user-4', username: 'dave',       displayUsername: null },
]

describe('matchPlayerName', () => {
  it('matches on username (case-insensitive)', () => {
    expect(matchPlayerName('alice', USERS)).toBe('user-1')
    expect(matchPlayerName('ALICE', USERS)).toBe('user-1')
    expect(matchPlayerName('Alice', USERS)).toBe('user-1')
  })

  it('matches on displayUsername (case-insensitive)', () => {
    expect(matchPlayerName('Bob Smith', USERS)).toBe('user-2')
    expect(matchPlayerName('bob smith', USERS)).toBe('user-2')
    expect(matchPlayerName('BOB SMITH', USERS)).toBe('user-2')
  })

  it('matches user with only displayUsername', () => {
    expect(matchPlayerName('Carol Jones', USERS)).toBe('user-3')
  })

  it('matches user with only username', () => {
    expect(matchPlayerName('dave', USERS)).toBe('user-4')
  })

  it('returns null for no match', () => {
    expect(matchPlayerName('nobody', USERS)).toBeNull()
    expect(matchPlayerName('unknown player', USERS)).toBeNull()
  })

  it('returns null for empty name', () => {
    expect(matchPlayerName('', USERS)).toBeNull()
    expect(matchPlayerName('   ', USERS)).toBeNull()
  })

  it('returns null for empty user list', () => {
    expect(matchPlayerName('alice', [])).toBeNull()
  })

  it('does not partial match', () => {
    // "ali" should NOT match "alice"
    expect(matchPlayerName('ali', USERS)).toBeNull()
    // "alice extra" should NOT match "alice"
    expect(matchPlayerName('alice extra', USERS)).toBeNull()
  })
})

describe('batchMatchPlayerNames', () => {
  it('resolves multiple names at once', () => {
    const result = batchMatchPlayerNames(['alice', 'nobody', 'Bob Smith'], USERS)
    expect(result.get('alice')).toBe('user-1')
    expect(result.get('nobody')).toBeNull()
    expect(result.get('Bob Smith')).toBe('user-2')
  })

  it('returns null for all unmatched names', () => {
    const result = batchMatchPlayerNames(['x', 'y', 'z'], USERS)
    expect(result.get('x')).toBeNull()
    expect(result.get('y')).toBeNull()
    expect(result.get('z')).toBeNull()
  })

  it('handles empty input', () => {
    const result = batchMatchPlayerNames([], USERS)
    expect(result.size).toBe(0)
  })
})
