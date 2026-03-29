import { useState } from 'react'
import { useT } from '../contexts/I18nContext'

const TIMEZONES = [
  'Europe/Warsaw',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Kiev',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
]

export default function SetupPage() {
  const t = useT()
  const [step, setStep] = useState(1)
  const TOTAL = 4

  const [companyName, setCompanyName] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [language, setLanguage] = useState('pl')
  const [timezone, setTimezone] = useState('Europe/Warsaw')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function canProceed() {
    if (step === 1) return companyName.trim().length > 0
    if (step === 2) {
      if (adminPassword.length < 8) return false
      if (adminPassword !== confirmPassword) return false
      return true
    }
    return true
  }

  async function handleFinish() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/setup/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          timezone,
          default_language: language,
          admin_password: adminPassword,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || t('common.error'))
        return
      }
      window.location.reload()
    } catch {
      setError('Backend nie odpowiada. Sprawdź czy serwer działa.')
    } finally {
      setLoading(false)
    }
  }

  function next() {
    if (step < TOTAL) setStep(s => s + 1)
    else handleFinish()
  }

  function prev() {
    if (step > 1) setStep(s => s - 1)
  }

  const stepTitles = [
    t('setup.step1Title'),
    t('setup.step2Title'),
    t('setup.step3Title'),
    t('setup.step4Title'),
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-orange-600/20 border-2 border-orange-500">
            <svg className="w-8 h-8 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">{t('setup.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('setup.subtitle')}</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-6">
          {Array.from({ length: TOTAL }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors
              ${i < step ? 'bg-orange-500' : 'bg-gray-700'}`} />
          ))}
        </div>
        <p className="text-xs text-gray-500 text-center mb-6">
          {t('setup.stepOf', { current: step, total: TOTAL })}
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">{stepTitles[step - 1]}</h2>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Company name */}
          {step === 1 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 uppercase tracking-wide">{t('setup.companyName')}</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                autoFocus
                placeholder="Acme Corp"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                           text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          )}

          {/* Step 2: Admin password */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t('setup.adminPassword')}</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  autoFocus
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                             text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <p className="text-xs text-gray-500">{t('setup.passwordMin')}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t('setup.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5
                             text-white placeholder-gray-500 focus:outline-none transition-colors
                             ${confirmPassword && adminPassword !== confirmPassword
                               ? 'border-red-600 focus:border-red-500'
                               : 'border-gray-700 focus:border-orange-500'}`}
                />
                {confirmPassword && adminPassword !== confirmPassword && (
                  <p className="text-xs text-red-400">{t('setup.passwordMismatch')}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Language */}
          {step === 3 && (
            <div className="space-y-3">
              <label className="text-xs text-gray-400 uppercase tracking-wide">{t('setup.language')}</label>
              <div className="grid grid-cols-2 gap-3">
                {[{ val: 'pl', label: 'Polski', flag: '🇵🇱' }, { val: 'en', label: 'English', flag: '🇬🇧' }].map(opt => (
                  <button key={opt.val} onClick={() => setLanguage(opt.val)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                      ${language === opt.val
                        ? 'border-orange-500 bg-orange-900/20 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    <span className="text-2xl">{opt.flag}</span>
                    <span className="font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Timezone */}
          {step === 4 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 uppercase tracking-wide">{t('setup.timezone')}</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                           text-white focus:outline-none focus:border-orange-500 transition-colors">
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button onClick={prev}
                className="px-4 py-2.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500
                           hover:text-white transition-colors text-sm font-medium cursor-pointer">
                {t('common.back')}
              </button>
            )}
            <button onClick={next}
              disabled={!canProceed() || loading}
              className="flex-1 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500
                         disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold
                         transition-colors text-sm cursor-pointer">
              {loading ? t('common.loading')
                : step === TOTAL ? t('setup.finish')
                : t('common.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
