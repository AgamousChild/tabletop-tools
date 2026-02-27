import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CollapsibleSection } from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders the title', () => {
    render(
      <CollapsibleSection title="Abilities">
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Abilities')).toBeInTheDocument()
  })

  it('is collapsed by default', () => {
    render(
      <CollapsibleSection title="Abilities">
        <p>Hidden content</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('expands when clicked', () => {
    render(
      <CollapsibleSection title="Abilities">
        <p>Revealed content</p>
      </CollapsibleSection>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Revealed content')).toBeInTheDocument()
  })

  it('shows count when provided', () => {
    render(
      <CollapsibleSection title="Keywords" count={5}>
        <p>Items</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('(5)')).toBeInTheDocument()
  })

  it('can start open with defaultOpen', () => {
    render(
      <CollapsibleSection title="Open" defaultOpen>
        <p>Visible content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Visible content')).toBeInTheDocument()
  })
})
