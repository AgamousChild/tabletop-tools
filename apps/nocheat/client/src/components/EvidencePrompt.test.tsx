import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidencePrompt } from './EvidencePrompt'

describe('EvidencePrompt', () => {
  it('shows the loaded verdict', () => {
    render(<EvidencePrompt isLoaded={true} zScore={2.84} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/loaded dice/i)).toBeInTheDocument()
    expect(screen.getByText(/2\.84/)).toBeInTheDocument()
  })

  it('shows the fair verdict', () => {
    render(<EvidencePrompt isLoaded={false} zScore={0.42} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/fair/i)).toBeInTheDocument()
  })

  it('shows Save Evidence and Dismiss buttons when loaded', () => {
    render(<EvidencePrompt isLoaded={true} zScore={2.84} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: /save evidence/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('shows only Dismiss when not loaded', () => {
    render(<EvidencePrompt isLoaded={false} zScore={0.42} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /save evidence/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('calls onDismiss when the Dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<EvidencePrompt isLoaded={true} zScore={2.84} onSavePhoto={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onSavePhoto when the Save Evidence button is clicked', () => {
    const onSavePhoto = vi.fn()
    render(<EvidencePrompt isLoaded={true} zScore={2.84} onSavePhoto={onSavePhoto} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /save evidence/i }))
    expect(onSavePhoto).toHaveBeenCalled()
  })
})
