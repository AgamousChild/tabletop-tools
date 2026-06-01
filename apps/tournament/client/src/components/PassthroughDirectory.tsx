import { useState } from 'react'

import { trpc } from '../lib/trpc'

/**
 * Browsable directory of BCP passthrough events.
 * Data comes entirely from passthrough_event rows — no hardcoded event list.
 */
export function PassthroughDirectory() {
  const [search, setSearch] = useState('')

  const eventsQuery = trpc.passthrough.list.useQuery({
    search: search || undefined,
    limit: 25,
  })

  const events = eventsQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {eventsQuery.isLoading && <div className="text-slate-500 text-sm">Loading...</div>}

      {!eventsQuery.isLoading && events.length === 0 && (
        <div className="text-slate-500 text-sm">
          No events found{search ? ' matching your search' : ''}.
        </div>
      )}

      <div className="space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-slate-100">{event.name}</div>
              {event.playerCount && (
                <div className="text-xs text-slate-500 whitespace-nowrap">
                  {event.playerCount} players
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              {event.location && <span>{event.location}</span>}
              {event.eventDate && (
                <span>{new Date(event.eventDate * 1000).toLocaleDateString()}</span>
              )}
              {event.gameSystem && <span>{event.gameSystem}</span>}
            </div>
            {event.registrationUrl && (
              <a
                href={event.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                Register on BCP
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
