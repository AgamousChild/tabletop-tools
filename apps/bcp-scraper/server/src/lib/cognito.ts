const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/'
const CLIENT_ID = '5083iih0nitpn5enl02fkpr9bc'

interface AuthOptions {
  email: string
  password: string
  fetch?: typeof globalThis.fetch
}

export async function authenticateBcp(opts: AuthOptions): Promise<string> {
  const f = opts.fetch ?? globalThis.fetch

  const resp = await f(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: opts.email,
        PASSWORD: opts.password,
      },
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`BCP auth failed: ${(err as any).message || resp.status}`)
  }

  const data = await resp.json() as { AuthenticationResult: { AccessToken: string } }
  return data.AuthenticationResult.AccessToken
}
