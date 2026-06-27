import { Chip } from 'primereact/chip'
import { InputNumber } from 'primereact/inputnumber'
import { Slider } from 'primereact/slider'
import { useState } from 'react'

import { Compare } from '../lib/Compare'
import { FACTIONS } from '../lib/fixtures'

// LEFT — extracted from:
//   - apps/game-tracker/client/src/components/battle/VpStepper.tsx
//       (-/value/+ buttons, min/max, used for VP and CP)
//   - apps/no-cheat/client/src/* (native <input type="range"> for d20/d6 rolls)
//   - apps/list-builder + apps/tournament chip pills (faction/role bg-color-coded
//     pill spans; never reusable, always inline)

export function NumberPage() {
  return (
    <Compare
      pageTitle="InputNumber + Slider + Chip"
      pageSubtitle="Three smaller widgets that show up across the platform in hand-rolled form. The lab page shows each side-by-side."
      left={{
        title: '-/value/+ stepper, native range, color-coded pill span',
        body: <CurrentNumber />,
        caption: {
          swap: 'VpStepper-style steppers (game-tracker uses 6+), no-cheat dice sliders, all inline chip spans.',
          keep: 'VpStepper if we keep it as the wrapper component — its API is fine, just swap internals.',
          notes:
            "The stepper has no keyboard arrow-key support today. Native range has zero styling integration. Chips are not a component, they're inline JSX repeated everywhere.",
        },
      }}
      right={{
        title: 'InputNumber + Slider + Chip',
        body: <PrimeNumber />,
        caption: {
          swap: 'Steppers → InputNumber with showButtons. Range inputs → Slider. Pill spans → Chip with `removable` for filter pills.',
          keep: 'Same min/max/value semantics. Click handlers translate directly.',
          notes:
            'InputNumber gives free typing + arrow keys + min/max clamping. Slider supports range mode (two thumbs) which we already wanted for the new-meta date window. Chip just removes the duplication.',
        },
      }}
    />
  )
}

// ---- LEFT — current pattern ----
function CurrentNumber() {
  const [vp, setVp] = useState(3)
  const [range, setRange] = useState(50)
  const [selectedFactions, setSelectedFactions] = useState<string[]>([
    FACTIONS[0]!.id,
    FACTIONS[1]!.id,
  ])
  const min = 0
  const max = 20

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500 mb-2">VpStepper (game-tracker):</p>
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs text-slate-400">Primary VP</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVp(Math.max(min, vp - 1))}
              disabled={vp <= min}
              aria-label="Decrease Primary VP"
              className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold disabled:opacity-30 hover:bg-slate-700"
            >
              -
            </button>
            <span className="text-xl font-bold text-amber-400 w-8 text-center">{vp}</span>
            <button
              onClick={() => setVp(Math.min(max, vp + 1))}
              disabled={vp >= max}
              aria-label="Increase Primary VP"
              className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold disabled:opacity-30 hover:bg-slate-700"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 mb-2">Native range input (no-cheat):</p>
        <input
          type="range"
          min={0}
          max={100}
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-sm text-slate-300 mt-1">{range}</p>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 mb-2">Inline chip spans (every app):</p>
        <div className="flex flex-wrap gap-1">
          {FACTIONS.slice(0, 8).map((f) => {
            const selected = selectedFactions.includes(f.id)
            return (
              <button
                key={f.id}
                onClick={() =>
                  setSelectedFactions(
                    selected
                      ? selectedFactions.filter((id) => id !== f.id)
                      : [...selectedFactions, f.id],
                  )
                }
                className={`text-xs px-2 py-0.5 rounded ${
                  selected
                    ? 'bg-amber-400/20 text-amber-400'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {f.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- RIGHT — PrimeReact ----
function PrimeNumber() {
  const [vp, setVp] = useState<number | null>(3)
  const [range, setRange] = useState(50)
  const [selectedFactions, setSelectedFactions] = useState<string[]>([
    FACTIONS[0]!.id,
    FACTIONS[1]!.id,
  ])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500 mb-2">InputNumber w/ buttons:</p>
        <InputNumber
          value={vp}
          onValueChange={(e) => setVp(e.value ?? 0)}
          showButtons
          min={0}
          max={20}
          buttonLayout="horizontal"
          decrementButtonClassName="p-button-secondary"
          incrementButtonClassName="p-button-secondary"
          inputClassName="w-16 text-center"
        />
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 mb-2">Slider:</p>
        <Slider value={range} onChange={(e) => setRange(e.value as number)} />
        <p className="text-sm text-slate-300 mt-2">{range}</p>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 mb-2">Chip (removable filter pills):</p>
        <div className="flex flex-wrap gap-1.5">
          {FACTIONS.slice(0, 8).map((f) => {
            const selected = selectedFactions.includes(f.id)
            return selected ? (
              <Chip
                key={f.id}
                label={f.name}
                removable
                onRemove={() => {
                  setSelectedFactions(selectedFactions.filter((id) => id !== f.id))
                  return true
                }}
              />
            ) : (
              <button
                key={f.id}
                onClick={() => setSelectedFactions([...selectedFactions, f.id])}
                className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:bg-slate-700"
              >
                + {f.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
