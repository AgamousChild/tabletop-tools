import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinkedText } from './LinkedText'
import type { EntityMap } from '../lib/entity-linker'

const entities: EntityMap = new Map([
  ['infernus squad', { type: 'unit' as const, nodeId: '000000126' }],
  ['devastating wounds', { type: 'mechanic' as const, nodeId: 'core:devastating-wounds' }],
  ['torrent', { type: 'mechanic' as const, nodeId: 'core:torrent' }],
])

describe('LinkedText', () => {
  it('renders plain text normally when no entities in map', () => {
    const emptyEntities: EntityMap = new Map()
    render(
      <LinkedText
        text="This is plain text with no entities."
        entities={emptyEntities}
        onEntityClick={vi.fn()}
      />
    )
    expect(screen.getByText('This is plain text with no entities.')).toBeInTheDocument()
  })

  it('renders entity name as an amber-colored clickable button', () => {
    render(
      <LinkedText
        text="The Infernus Squad is a unit."
        entities={entities}
        onEntityClick={vi.fn()}
      />
    )
    const link = screen.getByRole('button', { name: /Infernus Squad/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveClass('text-amber-400')
  })

  it('calls onEntityClick with correct name, type, nodeId when clicked', () => {
    const onEntityClick = vi.fn()
    render(
      <LinkedText
        text="The Infernus Squad is a unit."
        entities={entities}
        onEntityClick={onEntityClick}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Infernus Squad/i }))
    expect(onEntityClick).toHaveBeenCalledOnce()
    expect(onEntityClick).toHaveBeenCalledWith('Infernus Squad', 'unit', '000000126')
  })

  it('renders multiple entities in one string', () => {
    render(
      <LinkedText
        text="Infernus Squad has [TORRENT] and [DEVASTATING WOUNDS]."
        entities={entities}
        onEntityClick={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Infernus Squad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '[TORRENT]' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '[DEVASTATING WOUNDS]' })).toBeInTheDocument()
  })

  it('renders [TORRENT] style tags as clickable', () => {
    const onEntityClick = vi.fn()
    render(
      <LinkedText
        text="This weapon has [TORRENT]."
        entities={entities}
        onEntityClick={onEntityClick}
      />
    )
    const btn = screen.getByRole('button', { name: '[TORRENT]' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onEntityClick).toHaveBeenCalledWith('[TORRENT]', 'mechanic', 'core:torrent')
  })

  it('preserves original text casing for entity segments', () => {
    render(
      <LinkedText
        text="Use INFERNUS SQUAD carefully."
        entities={entities}
        onEntityClick={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'INFERNUS SQUAD' })).toBeInTheDocument()
  })

  it('renders non-entity text as plain spans', () => {
    const { container } = render(
      <LinkedText
        text="The Infernus Squad is a unit."
        entities={entities}
        onEntityClick={vi.fn()}
      />
    )
    // "The " should be plain text, not a button
    expect(screen.queryByRole('button', { name: /^The / })).not.toBeInTheDocument()
    // Plain text segments are rendered as spans
    const spans = container.querySelectorAll('span')
    const spanTexts = Array.from(spans).map(s => s.textContent)
    expect(spanTexts).toContain('The ')
  })
})
