import { describe, expect, it, vi } from 'vitest'

import { authenticateBcp } from './cognito'

describe('authenticateBcp', () => {
  it('calls BCP OAuth authorize + token exchange and returns access token', async () => {
    const mockFetch = vi
      .fn()
      // Step 1: authorize returns code
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 'bcpauth_test123' }),
      })
      // Step 2: token exchange returns access token
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accessToken: 'test-token-123' }),
      })

    const token = await authenticateBcp({
      email: 'test@example.com',
      password: 'testpass',
      fetch: mockFetch,
    })

    expect(token).toBe('test-token-123')
    expect(mockFetch).toHaveBeenCalledTimes(2)

    // Verify authorize call
    const [authorizeUrl, authorizeOpts] = mockFetch.mock.calls[0]!
    expect(authorizeUrl).toContain('/oauth/authorize')
    expect(authorizeUrl).toContain('response_type=code')
    expect(authorizeOpts.headers['authorization']).toBe(
      `Basic ${btoa('test@example.com:testpass')}`,
    )
    expect(authorizeOpts.headers['client-id']).toBe('web-app')

    // Verify token call
    const [tokenUrl, tokenOpts] = mockFetch.mock.calls[1]!
    expect(tokenUrl).toContain('/oauth/token')
    expect(tokenOpts.method).toBe('POST')
    const body = JSON.parse(tokenOpts.body)
    expect(body.code).toBe('bcpauth_test123')
    expect(body.grant_type).toBe('authorization_code')
  })

  it('throws on authorize failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    await expect(
      authenticateBcp({
        email: 'bad@example.com',
        password: 'wrong',
        fetch: mockFetch,
      }),
    ).rejects.toThrow('BCP auth failed')
  })

  it('throws on token exchange failure', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 'bcpauth_test123' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
      })

    await expect(
      authenticateBcp({
        email: 'test@example.com',
        password: 'testpass',
        fetch: mockFetch,
      }),
    ).rejects.toThrow('BCP auth failed: token exchange')
  })
})
