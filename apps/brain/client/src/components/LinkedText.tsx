import { type EntityMap, linkEntities } from '../lib/entity-linker'

interface LinkedTextProps {
  text: string
  entities: EntityMap
  onEntityClick: (name: string, type: string, nodeId: string) => void
}

export function LinkedText({ text, entities, onEntityClick }: LinkedTextProps) {
  const segments = linkEntities(text, entities)

  return (
    <>
      {segments.map((segment, i) =>
        segment.entity ? (
          <button
            key={i}
            // `brain-entity-link` carries the canonical underline/hover styling
            // shared with the server-rendered markdown link path so every
            // matched entity reads the same.
            className="brain-entity-link"
            role="button"
            tabIndex={0}
            onClick={() =>
              onEntityClick(segment.text, segment.entity!.type, segment.entity!.nodeId)
            }
          >
            {segment.text}
          </button>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}
