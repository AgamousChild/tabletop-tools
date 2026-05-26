import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { BrainNode } from '../lib/store'
import { NodeCard } from './NodeCard'

const testNode: BrainNode = {
  id: 'core:wound-roll',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Wound Roll',
  content: 'Compare Strength to Toughness to determine the wound roll required.',
  summary: 'How to resolve wound rolls.',
  sources: [{ type: 'pdf', title: 'Core Rules v1.0', page: 22, retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: ['wound', 'roll'],
}

describe('NodeCard', () => {
  it('renders the node title', () => {
    render(<NodeCard node={testNode} />)
    expect(screen.getByText('Wound Roll')).toBeInTheDocument()
  })

  it('renders the layer badge', () => {
    render(<NodeCard node={testNode} />)
    expect(screen.getByText('core')).toBeInTheDocument()
  })

  it('renders the category', () => {
    render(<NodeCard node={testNode} />)
    expect(screen.getByText('core-mechanic')).toBeInTheDocument()
  })

  it('renders source attribution', () => {
    render(<NodeCard node={testNode} />)
    expect(screen.getByText(/Core Rules v1.0 p.22/)).toBeInTheDocument()
  })

  it('renders node content', () => {
    render(<NodeCard node={testNode} />)
    expect(screen.getByText(/Compare Strength to Toughness/)).toBeInTheDocument()
  })

  it('renders phase when present', () => {
    const nodeWithPhase = { ...testNode, phase: 'shooting' }
    render(<NodeCard node={nodeWithPhase} />)
    expect(screen.getByText('(shooting)')).toBeInTheDocument()
  })
})
