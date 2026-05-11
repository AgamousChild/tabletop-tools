import { describe, it, expect, vi } from 'vitest'
import { authenticateBcp } from './cognito'

describe('authenticateBcp', () => {
  it('calls Cognito InitiateAuth and returns access token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        AuthenticationResult: {
          AccessToken: 'test-token-123',
          ExpiresIn: 3600,
        },
      }),
    })

    const token = await authenticateBcp({
      email: 'test@example.com',
      password: 'testpass',
      fetch: mockFetch,
    })

    expect(token).toBe('test-token-123')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toContain('cognito-idp.us-east-1.amazonaws.com')
    expect(opts.method).toBe('POST')

    const body = JSON.parse(opts.body)
    expect(body.AuthFlow).toBe('USER_PASSWORD_AUTH')
    expect(body.AuthParameters.USERNAME).toBe('test@example.com')
    expect(body.AuthParameters.PASSWORD).toBe('testpass')
    expect(body.ClientId).toBe('5083iih0nitpn5enl02fkpr9bc')
  })

  it('throws on auth failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ __type: 'NotAuthorizedException', message: 'Bad creds' }),
    })

    await expect(authenticateBcp({
      email: 'bad@example.com',
      password: 'wrong',
      fetch: mockFetch,
    })).rejects.toThrow('BCP auth failed')
  })
})
