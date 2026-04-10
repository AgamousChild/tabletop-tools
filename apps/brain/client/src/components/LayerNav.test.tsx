import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayerNav } from './LayerNav'

describe('LayerNav', () => {
  it('renders all layer options', () => {
    render(<LayerNav selectedLayer={null} onLayerSelect={() => {}} />)
    expect(screen.getByText('Core Rules')).toBeInTheDocument()
    expect(screen.getByText('Faction')).toBeInTheDocument()
    expect(screen.getByText('Errata')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getByText('Units')).toBeInTheDocument()
    expect(screen.getByText('Community')).toBeInTheDocument()
  })

  it('highlights the selected layer', () => {
    render(<LayerNav selectedLayer="core" onLayerSelect={() => {}} />)
    const coreButton = screen.getByText('Core Rules')
    expect(coreButton).toHaveClass('bg-amber-400')
  })

  it('does not highlight unselected layers', () => {
    render(<LayerNav selectedLayer="core" onLayerSelect={() => {}} />)
    const factionButton = screen.getByText('Faction')
    expect(factionButton).not.toHaveClass('bg-amber-400')
  })

  it('calls onLayerSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<LayerNav selectedLayer={null} onLayerSelect={onSelect} />)
    fireEvent.click(screen.getByText('Core Rules'))
    expect(onSelect).toHaveBeenCalledWith('core')
  })
})
