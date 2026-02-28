import { trpc } from '../lib/trpc'
import { StatCard } from '../components/StatCard'

export function Dashboard() {
  const { data, isLoading, error } = trpc.stats.overview.useQuery()
  const bsdata = trpc.stats.bsdataVersion.useQuery()
  const matchResults = trpc.stats.matchResults.useQuery()
  const topFactions = trpc.stats.topFactions.useQuery({ limit: 10 })

  if (isLoading) {
    return <p className="text-slate-400">Loading stats...</p>
  }

  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-slate-100">Platform Overview</h2>
      <p className="text-xs text-slate-500">
        Aggregate stats across all platform apps. Use the navigation tabs above to drill into users, sessions, activity, or import history.
      </p>

      {/* Users & Sessions */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Users & Sessions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={data.users.total} sub={`${data.users.recent} in last 7 days`} />
          <StatCard label="Active Sessions" value={data.sessions.active} sub={`${data.sessions.total} total`} />
          <StatCard label="ELO Players" value={data.elo.players} />
          <StatCard label="Glicko Players" value={data.newMeta.glickoPlayers} />
        </div>
      </section>

      {/* App Stats */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">App Usage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Versus Simulations" value={data.versus.simulations} />
          <StatCard label="Games Tracked" value={data.gameTracker.matches} sub={`${data.gameTracker.turns} turns`} />
          <StatCard label="Tournaments" value={data.tournament.tournaments} sub={`${data.tournament.players} players`} />
          <StatCard label="Lists Built" value={data.listBuilder.lists} sub={`${data.listBuilder.units} units`} />
          <StatCard label="Dice Sets" value={data.noCheat.diceSets} sub={`${data.noCheat.rollingSessions} sessions, ${data.noCheat.totalRolls} rolls`} />
          <StatCard label="Meta Imports" value={data.newMeta.imports} />
        </div>
      </section>

      {/* Match Results */}
      {matchResults.data && (
        <section>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Match Results</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Wins" value={matchResults.data.wins} />
            <StatCard label="Losses" value={matchResults.data.losses} />
            <StatCard label="Draws" value={matchResults.data.draws} />
            <StatCard label="In Progress" value={matchResults.data.inProgress} />
            <StatCard label="Total Matches" value={matchResults.data.total} />
          </div>
        </section>
      )}

      {/* BSData & Top Factions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BSData Version */}
        <section>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">BSData (wh40k-10e)</h3>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            {bsdata.isLoading && <p className="text-slate-400 text-sm">Checking GitHub...</p>}
            {bsdata.data?.error && <p className="text-red-400 text-sm">{bsdata.data.error}</p>}
            {bsdata.data?.sha && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Latest commit:</span>
                  <span className="font-mono text-sm text-amber-400">{bsdata.data.sha}</span>
                </div>
                {bsdata.data.date && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">Date:</span>
                    <span className="text-sm text-slate-100">
                      {new Date(bsdata.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                {bsdata.data.message && (
                  <p className="text-sm text-slate-300 mt-1 truncate">{bsdata.data.message}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Top Factions */}
        <section>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Top Factions (Tournaments)</h3>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            {topFactions.isLoading && <p className="text-slate-400 text-sm">Loading...</p>}
            {topFactions.data && topFactions.data.length === 0 && (
              <p className="text-slate-500 text-sm">No tournament data yet.</p>
            )}
            {topFactions.data && topFactions.data.length > 0 && (
              <div className="space-y-2">
                {topFactions.data.map((f, i) => (
                  <div key={f.faction} className="flex items-center justify-between">
                    <span className="text-sm text-slate-100">
                      <span className="text-slate-500 mr-2">{i + 1}.</span>
                      {f.faction}
                    </span>
                    <span className="text-sm text-amber-400 font-mono">{f.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
