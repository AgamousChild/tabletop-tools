# CLAUDE.md — packages/auth

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The shared authentication package for the entire Tabletop Tools platform. One login
across all apps. Provides:

- `createAuth(db, baseURL?, trustedOrigins?, secret?, basePath?)` — Better Auth instance
  factory for the auth Worker
- `validateSession(db, headers, secret?)` — session validation, called by `server-core`
  middleware (reads cookie, verifies HMAC, checks DB). Apps never call this directly.
- `User` type — canonical user type for all tRPC contexts
- Test helpers — shared HTTP request mocks for app integration tests

Auth runs as a standalone Cloudflare Worker on `tabletop-tools.net/auth/*`. App Workers
never run Better Auth themselves — they only call `validateSession` to check the cookie.

---

## Architecture

### How Auth Flows

```
Browser ──cookie──> App Worker ──server-core──validateSession()──> Turso DB
                                    │
                                    ├─ 1. Extract cookie (check __Secure- and plain prefixes)
                                    ├─ 2. Split token.signature (verify HMAC if secret provided)
                                    ├─ 3. Query session table by token
                                    ├─ 4. Check expiry
                                    └─ 5. Return User | null
```

### Cookie Format

Better Auth signs cookies as `{token}.{base64_signature}`. The cookie name depends on protocol:

| Environment | Cookie Name |
|---|---|
| Production (HTTPS) | `__Secure-better-auth.session_token` |
| Development (HTTP) | `better-auth.session_token` |

`validateSession` checks both prefixes — whichever is present wins.

### Custom Scrypt Parameters

Cloudflare Workers have a 30ms CPU budget. Standard scrypt params (N=32768) exceed this.
Custom params: `N=16384, r=8, p=1, dkLen=64` — fits within the budget while maintaining
adequate security for a hobby platform.

### Security Features

**HMAC signature verification:** `validateSession` requires a `secret` parameter and always
verifies the HMAC signature using the Web Crypto API (`crypto.subtle.sign` with HMAC-SHA256)
before the DB lookup. Uses a custom `timingSafeEqual` function for constant-time comparison.

**Timing-safe password comparison:** The custom scrypt `verifyPassword` function uses
`timingSafeEqual` (bitwise OR accumulator, no early exit) instead of `===` for comparing
derived key bytes against stored key bytes.

---

## File Structure

```
packages/auth/
  src/
    index.ts          <- createAuth() + validateSession() + User type + security helpers
    auth.test.ts      <- 17 tests (session lifecycle, HMAC verification, timing-safe comparison)
    test-helpers.ts   <- setupAuthTables(), createRequestHelper(), authCookie()
  package.json
  tsconfig.json
```

### Key Exports

| Export | Used By | Purpose |
|---|---|---|
| `createAuth()` | Auth Worker only | Creates Better Auth instance with Drizzle adapter |
| `validateSession()` | `server-core` only | Cookie -> User resolution (with optional HMAC) |
| `User` type | All app `trpc.ts` files | Canonical user type for tRPC context |
| `setupAuthTables()` | All app `server.test.ts` | Creates auth tables + test users in test SQLite DB |
| `createRequestHelper()` | All app `server.test.ts` | Builds mock HTTP requests for Hono apps |
| `authCookie()` | All app `server.test.ts` | Generates `better-auth.session_token=TOKEN` cookie |
| `TEST_USER` / `TEST_USER_2` | All app tests | Pre-defined test user objects |
| `TEST_TOKEN` / `EXPIRED_TOKEN` | All app tests | Pre-defined session tokens |

### User Type

```typescript
export type User = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}
```

---

## Testing

**17 tests** in `auth.test.ts`:
- register: creates user + returns token, rejects duplicate email
- login: valid credentials, wrong password rejection, unknown email rejection
- getSession: valid session, invalid token
- validateSession: valid session, invalid token, missing cookie
- HMAC verification (5 tests): valid signed cookie, tampered signature, no separator,
  wrong secret, fallback when no secret provided
- User shape: validates all canonical fields returned

```bash
cd packages/auth && pnpm test
```

### Test Helpers

`test-helpers.ts` provides shared test infrastructure used by all 7 app `server.test.ts` files:

```typescript
await setupAuthTables(client)                      // Creates auth tables + inserts test users
const request = createRequestHelper(appFactory)     // HTTP request builder for Hono apps
const cookie = authCookie()                         // Returns 'better-auth.session_token=test-session-token-abc123'
```
