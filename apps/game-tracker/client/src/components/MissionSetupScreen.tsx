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

const FALLBACK_DEPLOYMENT_ZONES = [
  'Tipping Point',
  'Hammer and Anvil',
  'Search and Destroy',
  'Crucible of Battle',
  'Sweeping Engagement',
  'Dawn of War',
]

const FALLBACK_TERRAIN_LAYOUTS = [
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
  twistCards: string[]
  includeChallenger: boolean
  challengerCards: string[]
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
  const [twistCards, setTwistCards] = useState<string[]>([])
  const [twistInput, setTwistInput] = useState('')
  const [includeChallenger, setIncludeChallenger] = useState(false)
  const [challengerCards, setChallengerCards] = useState<string[]>([])
  const [challengerInput, setChallengerInput] = useState('')
  const [requirePhotos, setRequirePhotos] = useState(false)

  const { data: indexedMissions = [] } = useMissions()
  const primaryMissions = indexedMissions.filter((m) => m.type === 'primary')
  const deploymentZoneMissions = indexedMissions.filter((m) => m.type === 'deployment_zone')
  // Use data-driven values when available, fall back to hardcoded lists
  const missionNames = primaryMissions.length > 0
    ? primaryMissions.map((m) => m.name)
    : FALLBACK_MISSIONS
  const deploymentZoneNames = deploymentZoneMissions.length > 0
    ? deploymentZoneMissions.map((m) => m.name)
    : FALLBACK_DEPLOYMENT_ZONES
  const terrainLayoutNames = FALLBACK_TERRAIN_LAYOUTS

  const addTwistCard = () => {
    const name = twistInput.trim()
    if (name && !twistCards.includes(name)) {
      setTwistCards([...twistCards, name])
      setTwistInput('')
    }
  }

  const removeTwistCard = (name: string) => {
    setTwistCards(twistCards.filter((c) => c !== name))
  }

  const addChallengerCard = () => {
    const name = challengerInput.trim()
    if (name && !challengerCards.includes(name)) {
      setChallengerCards([...challengerCards, name])
      setChallengerInput('')
    }
  }

  const removeChallengerCard = (name: string) => {
    setChallengerCards(challengerCards.filter((c) => c !== name))
  }

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
        <p className="text-xs text-slate-500 mb-4">Choose a primary mission, deployment zone, and terrain layout. Tap Next when ready, or Back to change match details.</p>
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
            {deploymentZoneNames.map((d) => (
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
            {terrainLayoutNames.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <div>
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
            {includeTwists && (
              <div className="mt-2 ml-8 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={twistInput}
                    onChange={(e) => setTwistInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTwistCard() } }}
                    placeholder="Enter twist card name..."
                    aria-label="Twist card name"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={addTwistCard}
                    disabled={!twistInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-sm font-medium hover:bg-amber-300 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                {twistCards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {twistCards.map((card) => (
                      <span key={card} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-xs text-slate-200">
                        {card}
                        <button
                          onClick={() => removeTwistCard(card)}
                          aria-label={`Remove ${card}`}
                          className="text-slate-500 hover:text-red-400"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
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
            {includeChallenger && (
              <div className="mt-2 ml-8 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={challengerInput}
                    onChange={(e) => setChallengerInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChallengerCard() } }}
                    placeholder="Enter challenger card name..."
                    aria-label="Challenger card name"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={addChallengerCard}
                    disabled={!challengerInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-sm font-medium hover:bg-amber-300 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                {challengerCards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {challengerCards.map((card) => (
                      <span key={card} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-xs text-slate-200">
                        {card}
                        <button
                          onClick={() => removeChallengerCard(card)}
                          aria-label={`Remove ${card}`}
                          className="text-slate-500 hover:text-red-400"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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
              twistCards,
              includeChallenger,
              challengerCards,
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
