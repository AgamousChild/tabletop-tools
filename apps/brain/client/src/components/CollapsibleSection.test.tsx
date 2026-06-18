import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CollapsibleSection } from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders collapsed by default — content not visible', () => {
    render(
      <CollapsibleSection title="Errata" count={3}>
        <p>Errata content</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('Errata content')).toBeNull()
    expect(screen.getByText('Errata')).toBeDefined()
  })

  it('expands on click — content becomes visible', () => {
    render(
      <CollapsibleSection title="Errata" count={3}>
        <p>Errata content</p>
      </CollapsibleSection>,
    )
    fireEvent.click(screen.getByText('Errata'))
    expect(screen.getByText('Errata content')).toBeDefined()
  })

  it('collapses again on second click', () => {
    render(
      <CollapsibleSection title="Errata" count={3}>
        <p>Errata content</p>
      </CollapsibleSection>,
    )
    fireEvent.click(screen.getByText('Errata'))
    expect(screen.getByText('Errata content')).toBeDefined()
    fireEvent.click(screen.getByText('Errata'))
    expect(screen.queryByText('Errata content')).toBeNull()
  })

  it('shows count badge in header', () => {
    render(
      <CollapsibleSection title="Errata" count={5}>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('5')).toBeDefined()
  })

  it('renders nothing when count is 0', () => {
    const { container } = render(
      <CollapsibleSection title="Errata" count={0}>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(container.innerHTML).toBe('')
  })
})
