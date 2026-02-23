import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cluster } from '../lib/cv/cluster'
import { ClusterLabelingScreen } from './ClusterLabelingScreen'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(64 * 64 * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

function makeCluster(id: string, exemplarCount = 3): Cluster {
  return {
    id,
    pipValue: null,
    exemplars: Array.from({ length: exemplarCount }, () => new Uint8Array(64 * 64).fill(128)),
    updatedAt: Date.now(),
  }
}

describe('ClusterLabelingScreen', () => {
  it('shows pip buttons 1 through 6', () => {
    render(<ClusterLabelingScreen clusters={[makeCluster('c1')]} onComplete={vi.fn()} />)
    for (const pip of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByRole('button', { name: String(pip) })).toBeInTheDocument()
    }
  })

  it('shows cluster progress counter', () => {
    const clusters = [makeCluster('c1'), makeCluster('c2')]
    render(<ClusterLabelingScreen clusters={clusters} onComplete={vi.fn()} />)
    expect(screen.getByText(/cluster 1 of 2/i)).toBeInTheDocument()
  })

  it('advances to next cluster after labeling', async () => {
    const clusters = [makeCluster('c1'), makeCluster('c2')]
    render(<ClusterLabelingScreen clusters={clusters} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    await waitFor(() => expect(screen.getByText(/cluster 2 of 2/i)).toBeInTheDocument())
  })

  it('calls onComplete with all labels after the last cluster', async () => {
    const onComplete = vi.fn()
    const clusters = [makeCluster('c1'), makeCluster('c2')]
    render(<ClusterLabelingScreen clusters={clusters} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    await waitFor(() => screen.getByText(/cluster 2 of 2/i))
    fireEvent.click(screen.getByRole('button', { name: '6' }))
    expect(onComplete).toHaveBeenCalledWith(
      new Map([
        ['c1', 4],
        ['c2', 6],
      ]),
    )
  })

  it('calls onComplete immediately for a single cluster', () => {
    const onComplete = vi.fn()
    render(<ClusterLabelingScreen clusters={[makeCluster('c1')]} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onComplete).toHaveBeenCalledWith(new Map([['c1', 3]]))
  })
})
