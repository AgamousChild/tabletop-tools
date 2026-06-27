import { useState } from 'react'

type AuthClient = {
  signIn: {
    email: (opts: {
      email: string
      password: string
    }) => Promise<{ error?: { message?: string } | null }>
  }
  signUp: {
    email: (opts: {
      email: string
      password: string
      name: string
    }) => Promise<{ error?: { message?: string } | null }>
  }
}

type AuthScreenProps = {
  title: string
  subtitle?: string
  onAuthenticated: () => void
  authClient: AuthClient
}

export function AuthScreen({ title, subtitle, onAuthenticated, authClient }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          setError(result.error.message ?? 'Login failed')
          return
        }
      } else {
        const result = await authClient.signUp.email({ email, password, name })
        if (result.error) {
          setError(result.error.message ?? 'Registration failed')
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
