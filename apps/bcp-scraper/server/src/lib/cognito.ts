const BCP_API = 'https://newprod-api.bestcoastpairings.com'
const REDIRECT_URI = 'https://www.bestcoastpairings.com/login'

interface AuthOptions {
  email: string
  password: string
  fetch?: typeof globalThis.fetch
}

/**
 * Authenticate with BCP using their OAuth2 authorization code flow:
 * 1. GET /oauth/authorize with Basic auth → returns authorization code
 * 2. POST /oauth/token with code → returns access token
 */
export async function authenticateBcp(opts: AuthOptions): Promise<string> {
  const f = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const basicAuth = btoa(`${opts.email}:${opts.password}`)

  // Step 1: Get authorization code
  const state = btoa(
    JSON.stringify({
      redirect_uri: REDIRECT_URI,
      client_id: 'web-app',
      salt: 'scraper',
    }),
  )

  const authorizeUrl = `${BCP_API}/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`

  const authResp = await f(authorizeUrl, {
    headers: {
      authorization: `Basic ${basicAuth}`,
      'client-id': 'web-app',
      'content-type': 'application/json',
    },
  })

  if (!authResp.ok) {
    throw new Error(`BCP auth failed: authorize returned ${authResp.status}`)
  }

  const authData = (await authResp.json()) as { code?: string; authorizationCode?: string }
  const code = authData.code || authData.authorizationCode
  if (!code) {
    throw new Error('BCP auth failed: no authorization code returned')
  }

  // Step 2: Exchange code for tokens
  const tokenResp = await f(`${BCP_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'client-id': 'web-app',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      redirect_uri: REDIRECT_URI,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResp.ok) {
    throw new Error(`BCP auth failed: token exchange returned ${tokenResp.status}`)
  }

  const tokenData = (await tokenResp.json()) as { accessToken?: string; access_token?: string }
  const token = tokenData.accessToken || tokenData.access_token
  if (!token) {
    throw new Error('BCP auth failed: no access token returned')
  }

  return token
}
