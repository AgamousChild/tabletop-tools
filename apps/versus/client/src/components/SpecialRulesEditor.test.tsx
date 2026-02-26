import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SpecialRulesEditor } from './SpecialRulesEditor'

describe('SpecialRulesEditor', () => {
  it('renders the header', () => {
    render(
      <SpecialRulesEditor rules={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.getByText('Special Rules')).toBeInTheDocument()
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
})
