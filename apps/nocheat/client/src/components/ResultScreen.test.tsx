import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultScreen } from './ResultScreen'

const loadedResult = {
  zScore: 2.84,
  isLoaded: true,
  outlierFace: 6,
  observedRate: 0.342,
  rollCount: 24,
}

const fairResult = {
  zScore: 0.42,
  isLoaded: false,
  outlierFace: 3,
  observedRate: 0.18,
  rollCount: 24,
}

describe('ResultScreen — loaded verdict', () => {
  it('shows LOADED DICE in red', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/loaded dice/i)).toBeInTheDocument()
  })

  it('displays the z-score', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/2\.84/)).toBeInTheDocument()
  })

  it('shows expected frequency (16.7%)', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/16\.7%/)).toBeInTheDocument()
  })

  it('shows observed frequency and which face', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/34\.2%/)).toBeInTheDocument()
    expect(screen.getByText(/6s/i)).toBeInTheDocument()
  })

  it('shows the roll count', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/24/)).toBeInTheDocument()
  })

  it('shows Save Evidence and Dismiss buttons', () => {
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: /save evidence/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('calls onSavePhoto when Save Evidence is clicked', () => {
    const onSavePhoto = vi.fn()
    render(<ResultScreen result={loadedResult} onSavePhoto={onSavePhoto} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /save evidence/i }))
    expect(onSavePhoto).toHaveBeenCalled()
  })

  it('calls onDismiss when Dismiss is clicked', () => {
    const onDismiss = vi.fn()
    render(<ResultScreen result={loadedResult} onSavePhoto={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('ResultScreen — fair verdict', () => {
  it('shows FAIR DICE in green', () => {
    render(<ResultScreen result={fairResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/fair dice/i)).toBeInTheDocument()
  })

  it('does not show Save Evidence button', () => {
    render(<ResultScreen result={fairResult} onSavePhoto={() => {}} onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /save evidence/i })).not.toBeInTheDocument()
  })
})
