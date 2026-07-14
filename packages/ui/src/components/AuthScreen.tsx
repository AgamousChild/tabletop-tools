import { useState } from 'react'

type AuthResult = {
  error?: { message?: string; code?: string; status?: number } | null
}

type AuthClient = {
  signIn: {
    email: (opts: { email: string; password: string }) => Promise<AuthResult>
  }
  signUp: {
    email: (opts: { email: string; password: string; name: string }) => Promise<AuthResult>
  }
  sendVerificationEmail?: (opts: { email: string }) => Promise<AuthResult>
}

type AuthScreenProps = {
  title: string
  subtitle?: string
  onAuthenticated: () => void
  authClient: AuthClient
}

/**
 * Better Auth surfaces "please verify your email first" as one of a handful
 * of shapes across versions (code, status, message text). Normalize to a
 * single check so both signup (auto-signed in only when verification is off)
 * and login (blocked if unverified) route to the "check your inbox" screen.
 */
function isEmailVerificationError(err: AuthResult['error']): boolean {
  if (!err) return false
  if (err.status === 403 && /verif/i.test(err.message ?? '')) return true
  if (err.code && /email.*verif/i.test(err.code)) return true
  if (err.message && /verif.*email|email.*verif/i.test(err.message)) return true
  return false
}

export function AuthScreen({ title, subtitle, onAuthenticated, authClient }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleResend() {
    if (!authClient.sendVerificationEmail || !awaitingVerification) return
    setResendStatus('sending')
    try {
      const result = await authClient.sendVerificationEmail({ email: awaitingVerification })
      setResendStatus(result.error ? 'error' : 'sent')
    } catch {
      setResendStatus('error')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          if (isEmailVerificationError(result.error)) {
            setAwaitingVerification(email)
            return
          }
          setError(result.error.message ?? 'Login failed')
          return
        }
      } else {
        const result = await authClient.signUp.email({ email, password, name })
        if (result.error) {
          setError(result.error.message ?? 'Registration failed')
          return
        }
        // With email verification enabled, Better Auth returns success but
        // does not create a session — the user has to click the link first.
        // Show the "check your inbox" state; the server decides whether
        // verification is on based on whether an email sender is configured.
        if (authClient.sendVerificationEmail) {
          setAwaitingVerification(email)
          return
        }
      }
      onAuthenticated()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (awaitingVerification) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-4xl font-bold text-accent mb-1">{title}</h1>
          {subtitle && <p className="text-foreground-subtle mb-8">{subtitle}</p>}
          <h2 className="text-xl font-semibold mb-3">Check your inbox</h2>
          <p className="text-foreground-subtle mb-6">
            We sent a verification link to{' '}
            <span className="text-foreground font-medium">{awaitingVerification}</span>. Click the
            link to activate your account, then come back and sign in.
          </p>
          {authClient.sendVerificationEmail && (
            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
              className="text-accent hover:underline disabled:opacity-50"
            >
              {resendStatus === 'sending' && 'Resending…'}
              {resendStatus === 'sent' && 'Sent — check your inbox again'}
              {resendStatus === 'error' && 'Resend failed — try again'}
              {resendStatus === 'idle' && "Didn't get it? Resend"}
            </button>
          )}
          <p className="text-foreground-subtle text-sm mt-6">
            <button
              onClick={() => {
                setAwaitingVerification(null)
                setResendStatus('idle')
                setMode('login')
              }}
              className="text-accent hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-accent mb-1 text-center">{title}</h1>
        {subtitle && <p className="text-foreground-subtle text-center mb-8">{subtitle}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              required
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground placeholder-foreground-faint focus:outline-none focus:border-accent"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground placeholder-foreground-faint focus:outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground placeholder-foreground-faint focus:outline-none focus:border-accent"
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-accent text-background font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-foreground-subtle text-center mt-4 text-sm">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button
                onClick={() => {
                  setMode('register')
                  setError(null)
                }}
                className="text-accent hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="text-accent hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
