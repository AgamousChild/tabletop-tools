import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders the app title', () => {
    render(
      <AppShell title="MyApp" onSignOut={vi.fn()}>
        <div>Content</div>
      </AppShell>,
    )
    expect(screen.getByText('MyApp')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <AppShell title="MyApp" onSignOut={vi.fn()}>
        <div>Child content</div>
      </AppShell>,
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders sign out button', () => {
    render(
      <AppShell title="MyApp" onSignOut={vi.fn()}>
        <div>Content</div>
      </AppShell>,
    )
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('calls onSignOut when sign out button is clicked', () => {
    const onSignOut = vi.fn()
    render(
      <AppShell title="MyApp" onSignOut={onSignOut}>
        <div>Content</div>
      </AppShell>,
    )
    fireEvent.click(screen.getByText('Sign out'))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders a home link', () => {
    render(
      <AppShell title="MyApp" onSignOut={vi.fn()}>
        <div>Content</div>
      </AppShell>,
    )
    const homeLink = screen.getByTitle('Back to Home')
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')
  })
})
