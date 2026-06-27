import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { useRef, useState } from 'react'

import { Compare } from '../lib/Compare'

// LEFT — the platform has NO toast/notification system. The way feedback is
// surfaced today is an actionResult state string near the button. Patterns
// seen in:
//   - apps/admin (deleteUser onSuccess: refetch — no user feedback at all)
//   - apps/tournament/client/src/components/ManageTournament.tsx (issueCard
//     mutation onSuccess clears form, no toast)
//   - apps/data-import/client/src/* (sync buttons set a local "Synced!" text)
// The lab inlines that string-near-button shape because it's what we'd be
// replacing.

export function ToastPage() {
  return (
    <Compare
      pageTitle="Toast / Messages"
      pageSubtitle="The platform has no toast system. Today, button success/error is communicated via a string of text near the button — or not at all."
      left={{
        title: 'actionResult-string-near-button',
        body: <CurrentToast />,
        caption: {
          swap: 'every "show feedback after a mutation" — most tRPC onSuccess handlers today either silently refetch or set a local message string.',
          keep: 'inline form-validation errors (those belong on the field, not in a toast).',
          notes:
            "There's no single notification surface — every component reinvents it. The result-string pattern means feedback disappears the moment the user navigates away.",
        },
      }}
      right={{
        title: 'Toast (global)',
        body: <PrimeToast />,
        caption: {
          swap: 'introduce one global Toast in main.tsx (PrimeReactProvider compatible). Replace every actionResult string with toast.show().',
          keep: 'tRPC onSuccess/onError handlers — they just call toast.show() instead of setting local state.',
          notes:
            'Severity types (success / info / warn / error) cover everything we need. Position top-right matches the platform aesthetic.',
        },
      }}
    />
  )
}

// ---- LEFT — current pattern ----
function CurrentToast() {
  const [result, setResult] = useState<string | null>(null)

  function fakeMutate(kind: 'ok' | 'fail') {
    setResult(kind === 'ok' ? 'Saved!' : 'Failed to save.')
    setTimeout(() => setResult(null), 3000)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        The current pattern: a string near the button. Disappears on navigation. No history. No
        stacking. No screen reader announcement.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fakeMutate('ok')}
          className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm"
        >
          Save
        </button>
        <button
          onClick={() => fakeMutate('fail')}
          className="px-4 py-2 rounded bg-red-400/20 text-red-400 text-sm border border-red-400/30"
        >
          Trigger Failure
        </button>
        {result && (
          <span
            className={`text-sm ${result.startsWith('Saved') ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {result}
          </span>
        )}
      </div>
    </div>
  )
}

// ---- RIGHT — PrimeReact ----
function PrimeToast() {
  const toast = useRef<Toast>(null)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        One global Toast, four severities, auto-dismiss, ARIA live region built in.
      </p>
      <Toast ref={toast} position="top-right" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          label="Success"
          severity="success"
          onClick={() =>
            toast.current?.show({ severity: 'success', summary: 'Saved', detail: 'List saved.' })
          }
        />
        <Button
          label="Info"
          severity="info"
          onClick={() =>
            toast.current?.show({
              severity: 'info',
              summary: 'Heads up',
              detail: 'Round 2 pairings posted.',
            })
          }
        />
        <Button
          label="Warn"
          severity="warning"
          onClick={() =>
            toast.current?.show({
              severity: 'warn',
              summary: 'Locked',
              detail: 'List edits closed at check-in.',
            })
          }
        />
        <Button
          label="Error"
          severity="danger"
          onClick={() =>
            toast.current?.show({
              severity: 'error',
              summary: 'Failed',
              detail: 'Could not reach server.',
            })
          }
        />
      </div>
    </div>
  )
}
