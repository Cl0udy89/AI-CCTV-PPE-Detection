import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// Inline SVG icon set
function ClipboardIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
}
function CalendarIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
}
function AlertCircleIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
}
function ClockIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
}
function CheckCircleIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
}
function ExclamationIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
}

function KpiCard({ label, value, sub, color = '', icon }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1.5 border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{label}</div>
        {icon && <span className="opacity-50" style={{ color: 'var(--muted)' }}>{icon}</span>}
      </div>
      <div className={`text-3xl font-bold tracking-tight ${color}`} style={!color ? { color: 'var(--text)' } : {}}>{value ?? '—'}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

function MiniBar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: pct + '%' }} />
    </div>
  )
}

function ActiveShiftBadge({ shifts }) {
  const now = new Date().getHours()
  const active = shifts?.find(s => {
    const { start_hour: s_, end_hour: e } = s
    return s_ < e ? (now >= s_ && now < e) : (now >= s_ || now < e)
  })
  if (!active) return null
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 border"
      style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }}>
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: active.color }} />
      <span className="text-xs" style={{ color: 'var(--muted)' }}>Aktualna zmiana: <strong style={{ color: 'var(--text)' }}>{active.name}</strong></span>
    </div>
  )
}

const STATUS_COLORS = {
  new: 'text-red-400', reviewing: 'text-yellow-400', closed: 'text-gray-400'
}
const STATUS_LABELS = { new: 'Nowy', reviewing: 'W trakcie', closed: 'Zamknięty' }
const VIOLATION_LABELS = {
  'NO-Hardhat': 'Brak kasku', 'NO-Safety Vest': 'Brak kamizelki', 'NO-Mask': 'Brak maski'
}

export default function DashboardPage({ onNavigate }) {
  const [data,    setData]    = useState(null)
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [dash, inc] = await Promise.all([
        apiFetch('/stats/dashboard').then(r => r.json()),
        apiFetch('/incidents?limit=5&status=new').then(r => r.json()),
      ])
      setData(dash)
      setRecent(inc.incidents || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Ładowanie dashboardu…</div>
      </div>
    )
  }

  const s  = data?.summary || {}
  const res = data?.resolution || {}
  const shifts = data?.shift_stats || []
  const atRisk = data?.at_risk_workers || []

  // Build 7-day timeline
  const tl = (data?.timeline7 || []).slice(-7)
  const today = new Date()
  const tlFilled = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    const label = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
    const found = tl.find(x => x.date === key)
    return { date: label, count: found?.count || 0 }
  })

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-5">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Dashboard</h2>
        <ActiveShiftBadge shifts={shifts} />
        {data?.open_actions > 0 && (
          <button onClick={() => onNavigate?.('incidents')}
            className="flex items-center gap-1.5 bg-orange-900/40 border border-orange-700 text-orange-300 text-xs rounded-lg px-3 py-1.5 hover:bg-orange-900/60 transition-colors cursor-pointer">
            <ExclamationIcon /> {data.open_actions} otwartych działań korygujących
          </button>
        )}
        <button onClick={load} className="ml-auto text-xs cursor-pointer transition-colors"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>Odśwież</button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Łącznie"   value={s.total}     icon={<ClipboardIcon />} />
        <KpiCard label="Dziś"      value={s.today}     icon={<CalendarIcon />} color="text-blue-400" />
        <KpiCard label="Nowe"      value={s.new}       icon={<AlertCircleIcon />} color="text-red-400" sub="do sprawdzenia" />
        <KpiCard label="W trakcie" value={s.reviewing} icon={<ClockIcon />} color="text-yellow-400" />
        <KpiCard label="Zamknięte" value={s.closed}    icon={<CheckCircleIcon />} color="text-green-400" />
      </div>

      {/* Middle row: timeline + resolution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 7-day chart */}
        <div className="md:col-span-2 rounded-xl p-5 border"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Naruszenia — ostatnie 7 dni</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={tlFilled} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text)' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Bar dataKey="count" name="Incydenty" radius={[3,3,0,0]}>
                {tlFilled.map((d, i) => (
                  <Cell key={i} fill={d.date === `${today.getDate()}.${String(today.getMonth()+1).padStart(2,'0')}` ? '#ef4444' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Resolution */}
        <div className="rounded-xl p-5 space-y-3 border"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Wskaźnik rozwiązania</div>
          {res.total > 0 ? (
            <>
              <div className="space-y-2">
                {[
                  { label: 'Zamknięte', pct: res.closed_pct, color: 'bg-green-500' },
                  { label: 'W trakcie', pct: res.reviewing_pct, color: 'bg-yellow-500' },
                  { label: 'Nowe',      pct: res.new_pct, color: 'bg-red-500' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--muted)' }}>
                      <span>{item.label}</span><span>{item.pct}%</span>
                    </div>
                    <MiniBar pct={item.pct} color={item.color} />
                  </div>
                ))}
              </div>
              <div className="text-xs pt-1" style={{ color: 'var(--muted)' }}>
                Łącznie: {res.total} incydentów
              </div>
            </>
          ) : (
            <div className="text-sm pt-4" style={{ color: 'var(--muted)' }}>Brak danych</div>
          )}
        </div>
      </div>

      {/* Bottom row: shifts + recent + at-risk workers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Shifts */}
        <div className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Incydenty per zmiana (30d)</div>
          {shifts.length > 0 ? (
            <div className="space-y-3">
              {shifts.map(sh => {
                const maxCount = Math.max(...shifts.map(s => s.count), 1)
                return (
                  <div key={sh.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text)' }}>{sh.name}</span>
                      <span style={{ color: 'var(--muted)' }}>{sh.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface2)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(sh.count / maxCount) * 100}%`, backgroundColor: sh.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Brak zmian</div>
          )}
        </div>

        {/* Recent new incidents */}
        <div className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Ostatnie nowe</div>
            <button onClick={() => onNavigate?.('incidents')}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer transition-colors">Pokaż wszystkie →</button>
          </div>
          {recent.length === 0 ? (
            <div className="text-green-400 text-sm py-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Brak nowych incydentów
            </div>
          ) : (
            <div className="space-y-1">
              {recent.slice(0, 4).map(inc => {
                const viols = typeof inc.violation_types === 'string'
                  ? inc.violation_types.split(',').map(v => v.trim()).filter(Boolean)
                  : (inc.violation_types || [])
                return (
                  <div key={inc.id}
                    onClick={() => onNavigate?.('incidents')}
                    className="flex items-start gap-2 cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors"
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <span className="text-red-400 mt-0.5 text-xs leading-4">●</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>#{inc.id} — Track {inc.track_id}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {viols.map(v => VIOLATION_LABELS[v] || v).join(', ')}
                        {inc.zone_name && ` · ${inc.zone_name}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* At-risk workers */}
        <div className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Pracownicy — compliance</div>
            <button onClick={() => onNavigate?.('workers')}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer transition-colors">Wszyscy →</button>
          </div>
          {atRisk.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Brak pracowników</div>
          ) : (
            <div className="space-y-2">
              {atRisk.map(w => {
                const color = w.compliance_score >= 80 ? 'text-green-400'
                            : w.compliance_score >= 50 ? 'text-yellow-400' : 'text-red-400'
                return (
                  <div key={w.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{w.name}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{w.department || '—'}</div>
                    </div>
                    <span className={`text-sm font-bold ${color} flex-shrink-0`}>
                      {w.compliance_score}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
