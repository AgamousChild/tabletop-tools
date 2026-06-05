import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ZodForm } from './ZodForm'

// ── Sample schemas used across tests ──────────────────────────────────────

const textOnlySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
})

const mixedSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  count: z.number().min(0, 'Must be non-negative'),
  active: z.boolean(),
  mode: z.enum(['auto', 'manual', 'off']),
  notes: z.string().optional(),
})

const ingestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  type: z.enum(['youtube', 'web']),
})

// ── Field rendering ────────────────────────────────────────────────────────

describe('ZodForm — field rendering', () => {
  it('renders text inputs for string fields', () => {
    render(
      <ZodForm
        schema={textOnlySchema}
        defaultValues={{ title: '', description: undefined }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('renders all field types from a mixed schema', () => {
    render(
      <ZodForm
        schema={mixedSchema}
        defaultValues={{ name: '', count: 0, active: false, mode: 'auto', notes: undefined }}
        onSubmit={vi.fn()}
      />,
    )
    // string → text input
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument()
    // number → number input
    const countInput = screen.getByLabelText(/^count/i)
    expect(countInput).toHaveAttribute('type', 'number')
    // boolean → checkbox
    const activeInput = screen.getByLabelText(/^active/i)
    expect(activeInput).toHaveAttribute('type', 'checkbox')
    // enum → select
    const modeSelect = screen.getByLabelText(/^mode/i)
    expect(modeSelect.tagName).toBe('SELECT')
    // optional string → text input
    expect(screen.getByLabelText(/^notes/i)).toBeInTheDocument()
  })

  it('renders enum options in select', () => {
    render(
      <ZodForm
        schema={mixedSchema}
        defaultValues={{ name: '', count: 0, active: false, mode: 'auto', notes: undefined }}
        onSubmit={vi.fn()}
      />,
    )
    const options = screen.getAllByRole('option')
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(
      expect.arrayContaining(['auto', 'manual', 'off']),
    )
  })

  it('renders a submit button', () => {
    render(
      <ZodForm
        schema={textOnlySchema}
        defaultValues={{ title: '', description: undefined }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })

  it('respects custom submitLabel', () => {
    render(
      <ZodForm
        schema={textOnlySchema}
        defaultValues={{ title: '', description: undefined }}
        onSubmit={vi.fn()}
        submitLabel="Add Source"
      />,
    )
    expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument()
  })

  it('applies fieldConfig labels and placeholders', () => {
    render(
      <ZodForm
        schema={ingestSchema}
        defaultValues={{ name: '', url: '', type: 'youtube' }}
        onSubmit={vi.fn()}
        fieldConfig={{
          name: { label: 'Channel Name', placeholder: 'Enter channel name' },
          url: { label: 'Channel URL', placeholder: 'https://...' },
        }}
      />,
    )
    expect(screen.getByLabelText(/channel name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter channel name')).toBeInTheDocument()
    expect(screen.getByLabelText(/channel url/i)).toBeInTheDocument()
  })

  it('disables submit while isPending', () => {
    render(
      <ZodForm
        schema={textOnlySchema}
        defaultValues={{ title: 'hello', description: undefined }}
        onSubmit={vi.fn()}
        isPending
        submitLabel="Save"
      />,
    )
    const btn = screen.getByRole('button', { name: /saving/i })
    expect(btn).toBeDisabled()
  })
})

// ── Valid submission ────────────────────────────────────────────────────────

describe('ZodForm — valid submission', () => {
  it('calls onSubmit with parsed values on valid form', async () => {
    const onSubmit = vi.fn()
    render(
      <ZodForm
        schema={ingestSchema}
        defaultValues={{ name: '', url: '', type: 'youtube' }}
        onSubmit={onSubmit}
        submitLabel="Add"
      />,
    )

    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: 'Auspex Tactics' },
    })
    fireEvent.change(screen.getByLabelText(/^url/i), {
      target: { value: 'https://youtube.com/@AuspexTactics' },
    })
    // type is already 'youtube' (default) — no change needed

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Auspex Tactics',
        url: 'https://youtube.com/@AuspexTactics',
        type: 'youtube',
      })
    })
  })

  it('calls onSubmit with defaultValues when all defaults are valid', async () => {
    const alreadyValidSchema = z.object({ label: z.string().default('default') })
    const onSubmit = vi.fn()
    render(
      <ZodForm
        schema={alreadyValidSchema}
        defaultValues={{ label: 'prefilled' }}
        onSubmit={onSubmit}
        submitLabel="Go"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /go/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ label: 'prefilled' })
    })
  })
})

// ── Validation / invalid submission ────────────────────────────────────────

describe('ZodForm — validation', () => {
  it('shows field errors when required fields are empty on submit', async () => {
    render(
      <ZodForm
        schema={ingestSchema}
        defaultValues={{ name: '', url: '', type: 'youtube' }}
        onSubmit={vi.fn()}
        submitLabel="Add"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })

  it('does NOT call onSubmit when required fields are empty', async () => {
    const onSubmit = vi.fn()
    render(
      <ZodForm
        schema={ingestSchema}
        defaultValues={{ name: '', url: '', type: 'youtube' }}
        onSubmit={onSubmit}
        submitLabel="Add"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    // Give time for any async effects
    await new Promise((r) => setTimeout(r, 50))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows URL validation error for invalid URL', async () => {
    render(
      <ZodForm
        schema={ingestSchema}
        defaultValues={{ name: '', url: '', type: 'youtube' }}
        onSubmit={vi.fn()}
        submitLabel="Add"
      />,
    )

    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: 'Test Source' },
    })
    fireEvent.change(screen.getByLabelText(/^url/i), {
      target: { value: 'not-a-url' },
    })

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })
})
