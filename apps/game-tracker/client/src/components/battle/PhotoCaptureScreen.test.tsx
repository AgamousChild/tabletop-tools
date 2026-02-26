import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PhotoCaptureScreen } from './PhotoCaptureScreen'

describe('PhotoCaptureScreen', () => {
  it('shows label', () => {
    render(<PhotoCaptureScreen onCapture={vi.fn()} required={false} />)
    expect(screen.getByText('Board Photo')).toBeInTheDocument()
  })

  it('shows take photo button', () => {
    render(<PhotoCaptureScreen onCapture={vi.fn()} required={false} />)
    expect(screen.getByText('Tap to take photo')).toBeInTheDocument()
  })

  it('shows Skip Photo when not required', () => {
    render(<PhotoCaptureScreen onCapture={vi.fn()} required={false} />)
    expect(screen.getByText('Skip Photo')).toBeInTheDocument()
  })

  it('hides Skip Photo when required', () => {
    render(<PhotoCaptureScreen onCapture={vi.fn()} required={true} />)
    expect(screen.queryByText('Skip Photo')).not.toBeInTheDocument()
  })

  it('calls onCapture(null) when Skip clicked', () => {
    const onCapture = vi.fn()
    render(<PhotoCaptureScreen onCapture={onCapture} required={false} />)
    fireEvent.click(screen.getByText('Skip Photo'))
    expect(onCapture).toHaveBeenCalledWith(null)
  })

  it('accepts custom label', () => {
    render(<PhotoCaptureScreen onCapture={vi.fn()} required={false} label="Your Turn Photo" />)
    expect(screen.getByText('Your Turn Photo')).toBeInTheDocument()
  })
})
