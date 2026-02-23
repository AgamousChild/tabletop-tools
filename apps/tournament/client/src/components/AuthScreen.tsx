import { useState } from 'react'
import { authClient } from '../lib/auth'

type Props = { onAuthenticated: () => void }

export function AuthScreen({ onAuthenticated }: Props) {
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
        const res = await authClient.signIn.email({ email, password })
        if (res.error) throw new Error(res.error.message ?? 'Login failed')
      } else {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) throw new Error(res.error.message ?? 'Registration failed')
      }
      onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-100">Tournament</h1>
          <p className="text-slate-400 mt-1">Run events. Play Swiss. Track ELO.</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:border-amber-400"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:border-amber-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:border-amber-400"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-slate-400 text-sm hover:text-slate-200"
        >
          {mode === 'login' ? 'No account? Register' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
