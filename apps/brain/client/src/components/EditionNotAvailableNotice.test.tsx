import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditionNotAvailableNotice } from './EditionNotAvailableNotice'

describe('EditionNotAvailableNotice', () => {
  it('suggests the available edition and labels the switch button', () => {
    render(
      <EditionNotAvailableNotice
        requested="11th"
        available={['10th']}
        subject="This unit"
        onSwitch={() => {}}
      />,
    )
    expect(screen.getByText(/This unit exists in 10th edition\. View it\?/)).toBeInTheDocument()
    expect(screen.getByTestId('edition-switch-button')).toHaveTextContent(/Switch to 10th/)
  })

  it('returns null when available is empty', () => {
    const { container } = render(
      <EditionNotAvailableNotice requested="11th" available={[]} onSwitch={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onSwitch with the target edition when the button is clicked', () => {
    const onSwitch = vi.fn()
    render(<EditionNotAvailableNotice requested="11th" available={['10th']} onSwitch={onSwitch} />)
    fireEvent.click(screen.getByTestId('edition-switch-button'))
    expect(onSwitch).toHaveBeenCalledWith('10th')
  })

  it('prefers an available edition different from the requested one', () => {
    // Defensive: the server should never advertise the requested edition,
    // but if it does we should still pick something else when possible.
    render(
      <EditionNotAvailableNotice
        requested="11th"
        available={['11th', '10th']}
        onSwitch={() => {}}
      />,
    )
    expect(screen.getByTestId('edition-switch-button')).toHaveTextContent(/Switch to 10th/)
  })

  it('falls back to the only available edition even if it matches the requested', () => {
    render(<EditionNotAvailableNotice requested="11th" available={['11th']} onSwitch={() => {}} />)
    expect(screen.getByTestId('edition-switch-button')).toHaveTextContent(/Switch to 11th/)
  })
})
