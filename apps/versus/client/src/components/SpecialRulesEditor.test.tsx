import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SpecialRulesEditor } from './SpecialRulesEditor'

describe('SpecialRulesEditor', () => {
  it('renders the header', () => {
    render(
      <SpecialRulesEditor rules={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.getByText('Additional Rules')).toBeInTheDocument()
  })

  it('shows add rule button', () => {
    render(
      <SpecialRulesEditor rules={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.getByText('+ Add Rule')).toBeInTheDocument()
  })

  it('opens dropdown when add rule is clicked', () => {
    render(
      <SpecialRulesEditor rules={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('+ Add Rule'))
    expect(screen.getByText('Sustained Hits 1')).toBeInTheDocument()
    expect(screen.getByText('Lethal Hits')).toBeInTheDocument()
    expect(screen.getByText('Devastating Wounds')).toBeInTheDocument()
  })

  it('calls onAdd with the correct rule when a dropdown option is clicked', () => {
    const onAdd = vi.fn()
    render(
      <SpecialRulesEditor rules={[]} onAdd={onAdd} onRemove={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('+ Add Rule'))
    fireEvent.click(screen.getByText('Lethal Hits'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'LETHAL_HITS' })
  })

  it('displays active rules as chips', () => {
    render(
      <SpecialRulesEditor
        rules={[
          { type: 'LETHAL_HITS' },
          { type: 'SUSTAINED_HITS', value: 1 },
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('Lethal Hits')).toBeInTheDocument()
    expect(screen.getByText('Sustained Hits 1')).toBeInTheDocument()
  })

  it('calls onRemove when chip dismiss is clicked', () => {
    const onRemove = vi.fn()
    render(
      <SpecialRulesEditor
        rules={[{ type: 'LETHAL_HITS' }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    )
    // Find the dismiss button ('x') within the chip
    const dismissButtons = screen.getAllByRole('button', { name: /x/i })
    fireEvent.click(dismissButtons[0])
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('closes dropdown after selecting a rule', () => {
    render(
      <SpecialRulesEditor rules={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('+ Add Rule'))
    expect(screen.getByText('Lethal Hits')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Lethal Hits'))
    // The dropdown should be closed now — rule options list should be gone
    expect(screen.queryByText('Devastating Wounds')).not.toBeInTheDocument()
  })

  it('shows data-driven weapon abilities when provided', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        weaponAbilities={['Sustained Hits 1', 'Lethal Hits']}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('From weapon data')).toBeInTheDocument()
    // Abilities appear as read-only chips
    expect(screen.getByText('Sustained Hits 1')).toBeInTheDocument()
    expect(screen.getByText('Lethal Hits')).toBeInTheDocument()
  })

  it('deduplicates weapon abilities', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        weaponAbilities={['Lethal Hits', 'Lethal Hits', 'Blast']}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    // Should show each unique ability once
    const chips = screen.getAllByText('Lethal Hits')
    expect(chips).toHaveLength(1)
    expect(screen.getByText('Blast')).toBeInTheDocument()
  })

  it('shows leader rules section when leaderRules are provided', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        leaderRules={[
          { rule: { type: 'REROLL_HITS' }, source: 'Rites of Battle' },
          { rule: { type: 'WOUND_MOD', value: 1 }, source: 'Tactical Precision' },
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('From leader')).toBeInTheDocument()
    expect(screen.getByText('Re-roll all hits')).toBeInTheDocument()
    expect(screen.getByText('+1 to wound')).toBeInTheDocument()
  })

  it('does not show leader rules section when leaderRules is empty', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        leaderRules={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.queryByText('From leader')).not.toBeInTheDocument()
  })

  it('leader rule chips have title attribute with source ability name', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        leaderRules={[
          { rule: { type: 'LETHAL_HITS' }, source: 'Oath of Moment' },
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const chip = screen.getByText('Lethal Hits')
    expect(chip.closest('[title]')).toHaveAttribute('title', 'Oath of Moment')
  })

  it('leader rules are read-only (no dismiss button)', () => {
    render(
      <SpecialRulesEditor
        rules={[]}
        leaderRules={[
          { rule: { type: 'REROLL_HITS' }, source: 'Rites of Battle' },
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    // Leader rules should not have any dismiss 'x' buttons
    const leaderSection = screen.getByText('From leader').parentElement!
    const dismissButtons = leaderSection.querySelectorAll('button')
    expect(dismissButtons).toHaveLength(0)
  })
})
