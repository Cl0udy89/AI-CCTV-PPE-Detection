import { useState, useEffect } from 'react'
import SourcePanel from './components/SourcePanel'
import DetectionPanel from './components/DetectionPanel'
import VideoFeed from './components/VideoFeed'
import StatusBar from './components/StatusBar'
import ToastContainer from './components/ToastContainer'
import ZonesPage from './pages/ZonesPage'
import IncidentsPage from './pages/IncidentsPage'
import StatsPage from './pages/StatsPage'
import AdminPage from './pages/AdminPage'
import WorkersPage from './pages/WorkersPage'
import ReportsPage from './pages/ReportsPage'
import ShiftsPage from './pages/ShiftsPage'
import NotificationsPage from './pages/NotificationsPage'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import { useSSE } from './hooks/useSSE'
import { useAuth, hasRole } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import { useI18n, useT } from './contexts/I18nContext'

const ROLE_COLORS = { admin: 'text-red-400', supervisor: 'text-orange-400', operator: 'text-blue-400', viewer: 'text-gray-400' }

// SVG icon components
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
    </svg>
  )
}

function PowerIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9"/>
    </svg>
  )
}

function SunIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

function MoonIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function allTabs(role, t) {
  const tabs = [
    { id: 'live',          label: t('tabs.live'),          minRole: 'viewer' },
    { id: 'zones',         label: t('tabs.zones'),         minRole: 'operator' },
    { id: 'incidents',     label: t('tabs.incidents'),     minRole: 'viewer', badge: true },
    { id: 'stats',         label: t('tabs.stats'),         minRole: 'viewer' },
    { id: 'workers',       label: t('tabs.workers'),       minRole: 'operator' },
    { id: 'shifts',        label: t('tabs.shifts'),        minRole: 'viewer' },
    { id: 'reports',       label: t('tabs.reports'),       minRole: 'supervisor' },
    { id: 'notifications', label: t('tabs.notifications'), minRole: 'admin' },
    { id: 'admin',         label: t('tabs.admin'),         minRole: 'admin' },
  ]
  return tabs.filter(tab => hasRole({ role }, tab.minRole))
}

export default function App() {
  const { token, user } = useAuth()
  const t = useT()
  const [setupDone, setSetupDone] = useState(null)  // null = checking
  const [companyName, setCompanyName] = useState('SafeVision')

  useEffect(() => {
    fetch('/setup/status')
      .then(r => r.json())
      .then(d => {
        setSetupDone(d.setup_done)
        if (d.company_name) setCompanyName(d.company_name)
      })
      .catch(() => setSetupDone(true))  // if backend unreachable, skip setup
  }, [])

  if (setupDone === null) return null  // loading

  if (!setupDone) return <SetupPage />

  if (!token || !user) return <LoginPage companyName={companyName} />

  return <AppShell companyName={companyName} />
}

function AppShell({ companyName }) {
  const { user, logout, token } = useAuth()
  const { theme, setTheme } = useTheme()
  const { lang, setLang } = useI18n()
  const t = useT()

  const tabs = allTabs(user?.role, t)
  const defaultTab = tabs[0]?.id || 'live'

  const [activeTab, setTab]         = useState(defaultTab)
  const [connected, setConnected]   = useState(false)
  const [currentSource, setSource]  = useState(null)
  const [newIncCount, setNewIncCount] = useState(0)
  const [toasts, setToasts]         = useState([])
  const [backendOk, setBackendOk]   = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  // Backend health check every 5 s
  useEffect(() => {
    function check() {
      fetch('/health').then(() => setBackendOk(true)).catch(() => setBackendOk(false))
    }
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  function handleConnect(source)  { setSource(source); setConnected(true) }
  function handleDisconnect()     { setConnected(false); setSource(null) }

  useEffect(() => {
    fetch('/stats/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setNewIncCount(d.new || 0))
      .catch(() => {})
  }, [])

  useSSE('/alerts/stream', (event) => {
    if (event.type === 'new_incident') {
      setNewIncCount(n => n + 1)
      const _toastId = Date.now() + Math.random()
      setToasts(prev => [...prev, { ...event, _toastId }])
      setTimeout(() => {
        setToasts(p => p.filter(t => t._toastId !== _toastId))
      }, 8000)
    }
  })

  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab)) setTab(defaultTab)
  }, [user?.role])

  // Save language preference to backend
  async function handleLangChange(newLang) {
    setLang(newLang)
    try {
      await fetch('/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: newLang }),
      })
    } catch {}
  }

  // Save theme preference to backend
  async function handleThemeChange(newTheme) {
    setTheme(newTheme)
    try {
      await fetch('/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme: newTheme }),
      })
    } catch {}
  }

  const themeOptions = [
    { val: 'dark',  icon: <MoonIcon className="w-3.5 h-3.5" />, label: t('header.themeDark') },
    { val: 'auto',  label: t('header.themeAuto') },
    { val: 'light', icon: <SunIcon className="w-3.5 h-3.5" />,  label: t('header.themeLight') },
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <header className="flex-shrink-0 border-b flex items-stretch h-14"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>

        {/* Logo + company name */}
        <div className="flex items-center gap-2.5 px-4 md:px-6 border-r flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <ShieldIcon className="w-4 h-4 text-orange-500" />
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
              {companyName}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              PPE Detection
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-stretch gap-0 overflow-x-auto flex-1 min-w-0 px-2
                        [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => { setTab(tab.id); if (tab.id === 'incidents') setNewIncCount(0) }}
              className="relative px-3.5 py-0 text-[13px] font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer flex items-center"
              style={{ color: tab.id === activeTab ? 'var(--text)' : 'var(--muted)' }}
              onMouseEnter={e => { if (tab.id !== activeTab) e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { if (tab.id !== activeTab) e.currentTarget.style.color = 'var(--muted)' }}
            >
              {tab.label}
              {tab.badge && newIncCount > 0 && (
                <span className="ml-1.5 bg-red-600 text-white text-[9px] font-bold
                                 px-1 h-4 rounded-full inline-flex items-center justify-center leading-none">
                  {newIncCount > 9 ? '9+' : newIncCount}
                </span>
              )}
              {/* Active underline */}
              {tab.id === activeTab && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t"
                  style={{ backgroundColor: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 px-3 md:px-4 flex-shrink-0 border-l"
          style={{ borderColor: 'var(--border)' }}>
          {/* Backend status */}
          <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md font-medium
            ${backendOk ? '' : 'animate-pulse'}`}
            style={{ color: backendOk ? '#4ade80' : '#f87171',
                     backgroundColor: backendOk ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.12)' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: backendOk ? '#4ade80' : '#f87171' }} />
            <span className="hidden sm:inline">{backendOk ? t('header.backendOk') : t('header.offline')}</span>
          </div>

          {connected && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md font-medium"
              style={{ color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="hidden md:inline">{currentSource}</span>
            </div>
          )}

          {/* Gear / Settings */}
          <button onClick={() => setShowSettings(true)}
            className="cursor-pointer transition-colors duration-200 p-1.5 rounded-md"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.backgroundColor = 'var(--surface2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
            title="Ustawienia">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            </svg>
          </button>

          {/* User info + logout */}
          <div className="flex items-center gap-2 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            <div className="text-right hidden sm:block">
              <div className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {user?.full_name || user?.username}
              </div>
              <div className={`text-[10px] font-medium uppercase tracking-wide ${ROLE_COLORS[user?.role]}`}>{user?.role}</div>
            </div>
            <button onClick={logout}
              className="cursor-pointer transition-colors duration-200 p-1.5 rounded-md"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
              title={t('header.logout')}>
              <PowerIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowSettings(false)}>
            <div className="rounded-2xl border shadow-2xl w-full max-w-sm mx-4 p-6 space-y-6"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                  </svg>
                  <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Ustawienia</span>
                </div>
                <button onClick={() => setShowSettings(false)}
                  className="cursor-pointer rounded-md p-1 transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.backgroundColor = 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, backgroundColor: 'var(--border)' }} />

              {/* Theme */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  {t('header.themeAuto') ? 'Motyw' : 'Theme'}
                </div>
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {themeOptions.map(opt => (
                    <button key={opt.val} onClick={() => handleThemeChange(opt.val)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        backgroundColor: theme === opt.val ? 'var(--accent)' : 'transparent',
                        color: theme === opt.val ? 'white' : 'var(--muted)',
                      }}>
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  Język / Language
                </div>
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {['pl', 'en'].map(l => (
                    <button key={l} onClick={() => handleLangChange(l)}
                      className="flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors cursor-pointer"
                      style={{
                        backgroundColor: lang === l ? 'var(--accent)' : 'transparent',
                        color: lang === l ? 'white' : 'var(--muted)',
                      }}>
                      {l === 'pl' ? '🇵🇱 Polski' : '🇬🇧 English'}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 p-3 md:p-5 overflow-hidden">
        {activeTab === 'live' && (
          <div className="flex flex-col lg:flex-row gap-4 h-full overflow-y-auto lg:overflow-hidden">
            <aside className="flex-shrink-0 flex flex-row lg:flex-col gap-4
                              overflow-x-auto lg:overflow-y-auto lg:w-60
                              [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex-shrink-0 w-60 lg:w-auto">
                <SourcePanel connected={connected} currentSource={currentSource}
                  onConnect={handleConnect} onDisconnect={handleDisconnect} />
              </div>
              <div className="flex-shrink-0 w-60 lg:w-auto">
                <DetectionPanel />
              </div>
            </aside>
            <section className="flex-1 flex flex-col gap-3 min-w-0 min-h-64 lg:min-h-0">
              <VideoFeed connected={connected} />
              <StatusBar connected={connected} />
            </section>
          </div>
        )}

        {activeTab === 'zones' && <ZonesPage connected={connected} />}
        {activeTab === 'incidents' && <IncidentsPage />}
        {activeTab === 'stats' && <StatsPage />}
        {activeTab === 'workers' && <WorkersPage />}
        {activeTab === 'shifts' && <ShiftsPage />}
        {activeTab === 'reports' && <ReportsPage />}
        {activeTab === 'notifications' && <NotificationsPage />}
        {activeTab === 'admin' && <AdminPage />}
      </main>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts(p => p.filter(t => t._toastId !== id))}
      />
    </div>
  )
}
