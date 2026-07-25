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
   * Cloudflare account ID + gateway ID for AI Gateway routing. When both are
   * set alongside CF_AI_GATEWAY_TOKEN and ASK_MODEL, /ask routes the answer
   * generation through the CF AI Gateway's OpenAI-compatible endpoint:
   *   https://gateway.ai.cloudflare.com/v1/{ACCOUNT}/{GATEWAY}/compat/chat/completions
   * That endpoint fans out to any supported provider based on the `model`
   * field in the request body (e.g. `anthropic/claude-sonnet-4-5-20250929`,
   * `google-ai-studio/gemini-2.5-pro`). Swap models via one env var, no code.
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
