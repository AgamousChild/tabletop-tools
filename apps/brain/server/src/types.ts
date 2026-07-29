export interface Env {
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
  SYNC_SECRET?: string
  CORS_ORIGIN?: string
  ANTHROPIC_API_KEY?: string
  GEMINI_API_KEY?: string
  BUILD_VERSION?: string
  /**
   * Default edition filter when a caller doesn't pass ?edition=.
   * Accepted: '11th' | '10th' | '9th' | 'any'. Unset → 'any' (preserves
   * historical behaviour; flip to '11th' once 11e coverage is good enough).
   */
  BRAIN_DEFAULT_EDITION?: string
  /**
   * Cloudflare AI Gateway routing. When all three are set alongside ASK_MODEL
   * (or ?model= with a `provider/name` value), /ask routes answer generation
   * through the gateway's OpenAI-compat endpoint:
   *   POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT}/{GATEWAY}/compat/chat/completions
   * Provider API keys live in the Gateway (BYOK); CF picks the right one from
   * the model prefix (`anthropic/*`, `google-ai-studio/*`, `workers-ai/*`).
   *
   * We tried the env.AI.run binding first — worked for Anthropic but 502'd
   * for every Google prefix regardless of request shape. Compat endpoint via
   * fetch works uniformly for all providers, so that's what we use.
   */
  CF_ACCOUNT_ID?: string
  CF_GATEWAY_ID?: string
  CF_AI_GATEWAY_TOKEN?: string
  /**
   * When set, /ask routes answer generation via AI Gateway using this model.
   * Format: `provider/model-name` per CF's compat endpoint. Unset → falls
   * back to the existing Claude / Llama branches.
   */
  ASK_MODEL?: string
}

export interface BrainManifest {
  version: number
  updatedAt: string
  files: Record<string, string> // filename -> sha256 hash
}
