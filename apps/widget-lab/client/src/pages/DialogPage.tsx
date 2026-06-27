import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Dialog } from 'primereact/dialog'
import { useState } from 'react'

import { Compare } from '../lib/Compare'

// LEFT — extracted from:
//   - apps/brain/client/src/components/Overlay.tsx (fixed-position div modal,
//     backdrop click to dismiss, no focus trap, no ESC handling)
//   - apps/admin/client/src/pages/UsersPage.tsx L53-71 (inline "Confirm?/Yes/No"
//     that takes over the row's actions column)

export function DialogPage() {
  return (
    <Compare
      pageTitle="Dialog + Confirm"
      pageSubtitle="Brain's Overlay is a fixed div with backdrop click. Admin's delete confirm is an inline row swap. Neither traps focus, neither responds to ESC."
      left={{
        title: 'Fixed-div modal + inline confirm',
        body: <CurrentDialogs />,
        caption: {
          swap: "Overlay everywhere (it's used in brain for all card detail views), inline confirms in admin and list-builder.",
          keep: 'transient inline confirms make sense for table-row-action confirms when the action is cheap to undo (drop a player). For destructive actions we want the real Dialog.',
          notes:
            "Brain's Overlay has zero a11y. Tab order leaks to background. Screen readers don't know modal opened.",
        },
      }}
      right={{
        title: 'Dialog + ConfirmDialog',
        body: <PrimeDialogs />,
        caption: {
          swap: 'Overlay → Dialog. inline confirms → ConfirmDialog (singleton service, fire-and-forget).',
          keep: 'Backdrop-click-to-dismiss matches today. Same children API on Dialog.',
          notes:
            'Focus trap, ESC, ARIA roles, returns focus to trigger on close — all default. confirmDialog() function form means no per-component state plumbing.',
        },
      }}
    />
  )
}

// ---- LEFT — current pattern ----
function CurrentDialogs() {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => setOverlayOpen(true)}
          className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm"
        >
          Open Overlay
        </button>
        {/* Inlined from apps/brain/client/src/components/Overlay.tsx */}
        {overlayOpen && (
          <div
            data-testid="overlay-backdrop"
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto"
            onClick={() => setOverlayOpen(false)}
          >
            <div
              className="relative w-full md:max-w-md md:mx-4 my-8 bg-slate-900 border border-slate-800 rounded-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-amber-400 mb-2">Overlay modal</h3>
              <p className="text-sm text-slate-400 mb-4">
                Try pressing ESC. Try tabbing — focus escapes to the background. No screen-reader
                announcement.
              </p>
              <button
                onClick={() => setOverlayOpen(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-200 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 pt-5">
        <p className="text-xs text-slate-500 mb-2">Inline confirm (admin pattern):</p>
        <div className="bg-slate-900 border border-slate-800 rounded p-3 flex items-center justify-between text-sm">
          <span className="text-slate-100">Some Player</span>
          {confirmId === 'p1' ? (
            <span className="flex gap-2 items-center">
              <span className="text-red-400 text-xs">Confirm?</span>
              <button
                onClick={() => {
                  setConfirmId(null)
                  alert('deleted')
                }}
                className="text-xs px-2 py-1 rounded bg-red-400/20 text-red-400 hover:bg-red-400/30"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="text-xs px-2 py-1 text-slate-400"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmId('p1')}
              className="text-xs px-2 py-1 rounded bg-red-400/20 text-red-400 hover:bg-red-400/30"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- RIGHT — PrimeReact ----
function PrimeDialogs() {
  const [open, setOpen] = useState(false)

  const ask = () => {
    confirmDialog({
      message: 'Delete this player? This cannot be undone.',
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => alert('deleted'),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Button label="Open Dialog" onClick={() => setOpen(true)} />
        <Dialog
          header="Dialog modal"
          visible={open}
          onHide={() => setOpen(false)}
          dismissableMask
          style={{ width: '420px' }}
        >
          <p className="text-sm text-slate-400">
            Press ESC. Tab — focus stays inside. role="dialog" + aria-modal="true" set
            automatically. Returns focus to the trigger button on close.
          </p>
        </Dialog>
      </div>

      <div className="border-t border-slate-800 pt-5">
        <p className="text-xs text-slate-500 mb-2">ConfirmDialog (singleton):</p>
        <Button label="Delete" severity="danger" onClick={ask} />
        <ConfirmDialog />
      </div>
    </div>
  )
}
