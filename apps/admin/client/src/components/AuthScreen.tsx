import { useState } from 'react'
import { signIn, signUp } from '../lib/auth'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (mode === 'register') {
        const res = await signUp.email({ email, password, name })
        if (res.error) {
          setError(res.error.message ?? 'Registration failed')
          return
        }
      } else {
        const res = await signIn.email({ email, password })
        if (res.error) {
          setError(res.error.message ?? 'Login failed')
          return
        }
      }
      onAuthenticated()
    } catch {
      setError('An unexpected error occurred')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-slate-900 border border-slate-800 rounded-xl">
        <h1 className="text-xl font-bold text-amber-400 mb-6">Admin Dashboard</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 bg-amber-400 text-slate-950 font-medium rounded-lg hover:bg-amber-300"
          >
            {mode === 'login' ? 'Sign in' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-400 text-center">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button onClick={() => setMode('register')} className="text-amber-400 hover:underline">
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button onClick={() => setMode('login')} className="text-amber-400 hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
