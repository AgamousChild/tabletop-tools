import { useState } from 'react'
import { useMissions } from '@tabletop-tools/game-data-store'

const FALLBACK_MISSIONS = [
  'Take and Hold',
  'Supply Drop',
  'Scorched Earth',
  'The Ritual',
  'Priority Targets',
  'Linchpin',
  'Purge the Foe',
]

const DEPLOYMENT_ZONES = [
  'Tipping Point',
  'Hammer and Anvil',
  'Search and Destroy',
  'Crucible of Battle',
  'Sweeping Engagement',
  'Dawn of War',
]

const TERRAIN_LAYOUTS = [
  'Layout 1',
  'Layout 2',
  'Layout 3',
  'Layout 4',
  'Layout 5',
  'Layout 6',
  'Layout 7',
  'Layout 8',
]

type MissionSetupData = {
  mission: string
  deploymentZone: string
  terrainLayout: string
  includeTwists: boolean
  includeChallenger: boolean
  requirePhotos: boolean
}

type Props = {
  onNext: (data: MissionSetupData) => void
  onBack: () => void
}

export type { MissionSetupData }

export function MissionSetupScreen({ onNext, onBack }: Props) {
  const [mission, setMission] = useState('')
  const [deploymentZone, setDeploymentZone] = useState('')
  const [terrainLayout, setTerrainLayout] = useState('')
  const [includeTwists, setIncludeTwists] = useState(false)
  const [includeChallenger, setIncludeChallenger] = useState(false)
  const [requirePhotos, setRequirePhotos] = useState(false)

  const { data: indexedMissions = [] } = useMissions()
  const primaryMissions = indexedMissions.filter((m) => m.type === 'primary')
  // Use data-driven missions when available, fall back to hardcoded list
  const missionNames = primaryMissions.length > 0
    ? primaryMissions.map((m) => m.name)
    : FALLBACK_MISSIONS

  const canProceed = mission !== ''

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <h1 className="text-xl font-bold text-amber-400">Mission Setup</h1>
      </header>

      <div className="p-6 space-y-5 max-w-md mx-auto">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Primary Mission</label>
          <select
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            aria-label="Select mission"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
          >
            <option value="">Select mission...</option>
            {missionNames.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Deployment Zone</label>
          <select
            value={deploymentZone}
            onChange={(e) => setDeploymentZone(e.target.value)}
            aria-label="Select deployment zone"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
          >
            <option value="">Select deployment zone...</option>
            {DEPLOYMENT_ZONES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Terrain Layout</label>
          <select
            value={terrainLayout}
            onChange={(e) => setTerrainLayout(e.target.value)}
            aria-label="Select terrain layout"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
          >
            <option value="">Select terrain layout...</option>
            {TERRAIN_LAYOUTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTwists}
              onChange={(e) => setIncludeTwists(e.target.checked)}
              aria-label="Include Twist Cards"
              className="w-5 h-5 rounded border-slate-800 bg-slate-900 text-amber-400 focus:ring-amber-400"
            />
            <span className="text-slate-100">Include Twist Cards</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChallenger}
              onChange={(e) => setIncludeChallenger(e.target.checked)}
              aria-label="Include Challenger Cards"
              className="w-5 h-5 rounded border-slate-800 bg-slate-900 text-amber-400 focus:ring-amber-400"
            />
            <span className="text-slate-100">Include Challenger Cards</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requirePhotos}
              onChange={(e) => setRequirePhotos(e.target.checked)}
              aria-label="Require Photos"
              className="w-5 h-5 rounded border-slate-800 bg-slate-900 text-amber-400 focus:ring-amber-400"
            />
            <span className="text-slate-100">Require Photos</span>
          </label>
        </div>

        <button
          onClick={() => {
            if (!canProceed) return
            onNext({
              mission,
              deploymentZone,
              terrainLayout,
              includeTwists,
              includeChallenger,
              requirePhotos,
            })
          }}
          disabled={!canProceed}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
