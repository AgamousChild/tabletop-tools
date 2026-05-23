# packages/auth/src/index.ts

> Central auth factory and session validation with HMAC verification.

## Prompt

**`createAuth(db, baseURL?, trustedOrigins?, secret?, basePath?)`** — wraps Better Auth with scrypt hashing (N=16384 for Workers CPU budget). Configures Drizzle adapter, cookie path, and basePath.

**`validateSession(db, headers, secret)`** — extracts signed cookies (`__Secure-better-auth.session_token` on HTTPS, `better-auth.session_token` on HTTP), verifies HMAC signature using Web Crypto API, queries DB for valid session token, returns `User` if valid or `null`.

**`timingSafeEqual(a, b)`** — constant-time string comparison for signature verification.

`User` type: `{ id, email, name }`.

## Dependencies

- `better-auth`, `better-auth/adapters/drizzle`
- `@tabletop-tools/db`

## Contracts

- Secret is required (no fallback) — called by server-core middleware only, never by apps directly
- Cookie checks both `__Secure-` and non-secure prefixes for dev/prod compatibility
- HMAC uses Web Crypto `crypto.subtle` (available in Workers + Node 18+)
