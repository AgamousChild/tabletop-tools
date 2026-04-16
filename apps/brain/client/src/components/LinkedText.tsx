import { linkEntities, type EntityMap } from '../lib/entity-linker'

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
            className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => onEntityClick(segment.text, segment.entity!.type, segment.entity!.nodeId)}
          >
            {segment.text}
          </button>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  )
}
