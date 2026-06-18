# apps/bcp-scraper/server/src/lib/cognito.ts

> BCP OAuth2 authentication — authorization code flow.

## Prompt

Export `authenticateBcp(opts: AuthOptions): Promise<string>` that returns an access token.

Two-step OAuth2 flow against BCP's auth endpoints:

**Step 1 — Get authorization code**: `GET /oauth/authorize` with Basic auth (base64 email:password), query params for response_type=code, redirect_uri, and state (base64 JSON with redirect_uri, client_id, salt). Returns `{ code }` or `{ authorizationCode }`.

**Step 2 — Exchange code for token**: `POST /oauth/token` with JSON body (redirect_uri, code, grant_type=authorization_code). Returns `{ accessToken }` or `{ access_token }`.

Throw descriptive errors at each step. Accept optional `fetch` function for testability.

## Dependencies

None (uses global `fetch` and `btoa`).

## Contracts

- BCP API: `https://newprod-api.bestcoastpairings.com`
- Redirect URI: `https://www.bestcoastpairings.com/login`
- Client ID: `web-app`
- Headers include `client-id: web-app` and `content-type: application/json`
