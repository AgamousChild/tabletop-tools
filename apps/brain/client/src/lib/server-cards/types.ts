/**
 * Re-export all card layout types from the shared module.
 *
 * The shared module lives at apps/brain/shared/card-layout-types.ts and is
 * safe to import from both the Cloudflare Worker (server) and Vite (client).
 *
 * Consumers within the client should import from here, not from the shared
 * path directly, so that the import path stays stable if we ever move the
 * shared module.
 */
export type {
  AbilityNode,
  BoxNode,
  CardLayout,
  CardLayoutNode,
  DividerNode,
  HeaderNode,
  HeadingNode,
  KeyValueNode,
  PillListNode,
  StatBarNode,
  TableNode,
  TextNode,
} from '../../../../shared/card-layout-types'
