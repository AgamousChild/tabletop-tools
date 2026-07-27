/**
 * shapes/index.ts — Single import surface for all registered shapes.
 *
 * Import this module once (e.g. at the top of worker.ts) and every shape
 * registers itself via its side-effectful `register(...)` call.
 *
 * Adding a new shape:
 *   1. Create `shapes/my-shape.ts` and call `register(myShape)` at module scope.
 *   2. Add `import './my-shape'` below.
 */

import './list-review'
import './onboarding'
