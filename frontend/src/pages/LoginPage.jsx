import { useState } from 'react'
import { apiJSON } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useT } from '../contexts/I18nContext'

export default function LoginPage({ companyName = 'SafeVision PPE' }) {
  const { login } = useAuth()
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiJSON('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      login(data.token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #030712 0%, #0f172a 50%, #030712 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4
                          bg-orange-600/10 border-2 border-orange-500/50 backdrop-blur-sm">
            <svg className="w-8 h-8 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">{companyName}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        {/* Frosted glass card */}
        <form onSubmit={handleSubmit}
          className="rounded-2xl p-8 space-y-5 border backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(17,24,39,0.85)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold text-white">{t('login.title')}</h2>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t('login.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg px-4 py-2.5 text-white placeholder-gray-500
                         focus:outline-none transition-colors"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              placeholder="admin"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-white placeholder-gray-500
                         focus:outline-none transition-colors"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold py-2.5 rounded-lg transition-colors cursor-pointer
                       disabled:opacity-50 disabled:cursor-not-allowed text-white"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = 'var(--accent-hover)' }}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
            {loading ? t('login.loading') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
