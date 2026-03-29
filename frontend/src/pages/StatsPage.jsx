import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts'

const PIE_COLORS = ['#ef4444', '#f97316', '#a855f7', '#3b82f6', '#22c55e']

const VIOLATION_LABELS = {
  'NO-Hardhat':     'Brak kasku',
  'NO-Safety Vest': 'Brak kamizelki',
  'NO-Mask':        'Brak maski',
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-gray-900 rounded-xl p-5 flex flex-col gap-1 ${accent ? 'border border-' + accent + '-700' : ''}`}>
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold ${accent ? 'text-' + accent + '-400' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

export default function StatsPage() {
  const [summary,    setSummary]    = useState(null)
  const [timeline,   setTimeline]   = useState([])
  const [byType,     setByType]     = useState([])
  const [byZone,     setByZone]     = useState([])
  const [hourly,     setHourly]     = useState([])
  const [resolution, setResolution] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [timelineDays, setTlDays]   = useState(14)

  async function load() {
    setLoading(true)
    try {
      const [sumR, tlR, typeR, zoneR, hourR, resR] = await Promise.all([
        apiFetch('/stats/summary'),
        apiFetch(`/stats/timeline?days=${timelineDays}`),
        apiFetch('/stats/by_type'),
        apiFetch('/stats/by_zone'),
        apiFetch('/stats/hourly?days=7'),
        apiFetch('/stats/resolution'),
      ])
      setSummary(await sumR.json())
      const tlData = await tlR.json()
      setTimeline(tlData.timeline || [])
      const typeData = await typeR.json()
      setByType((typeData.by_type || []).map(d => ({
        ...d,
        name: VIOLATION_LABELS[d.type] || d.type,
      })))
      const zoneData = await zoneR.json()
      setByZone(zoneData.by_zone || [])
      const hourData = await hourR.json()
      setHourly(hourData.hourly || [])
      setResolution(await resR.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [timelineDays])

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Ładowanie statystyk…
      </div>
    )
  }

  // Fill missing days in timeline
  const filledTimeline = (() => {
    if (!timeline.length) return []
    const map = Object.fromEntries(timeline.map(d => [d.date, d.count]))
    const result = []
    const today = new Date()
    for (let i = timelineDays - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
      result.push({ date: label, count: map[key] || 0 })
    }
    return result
  })()

  // Peak hour
  const peakHour = hourly.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 })

  return (
    <div className="overflow-y-auto h-full space-y-6 pr-1">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Statystyki</h2>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Łącznie"    value={summary.total}     />
          <StatCard label="Dziś"       value={summary.today}     accent="blue" />
          <StatCard label="Nowe"       value={summary.new}       sub="do sprawdzenia" accent="red" />
          <StatCard label="W trakcie"  value={summary.reviewing} accent="yellow" />
          <StatCard label="Zamknięte"  value={summary.closed}    />
        </div>
      )}

      {/* Compliance / resolution row */}
      {resolution && resolution.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-900 rounded-xl p-5 col-span-1 md:col-span-2">
            <div className="text-sm font-medium text-gray-300 mb-3">Wskaźnik rozwiązania incydentów</div>
            <div className="flex gap-3 items-end flex-wrap">
              {/* Closed bar */}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Zamknięte</span><span>{resolution.closed_pct}%</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: resolution.closed_pct + '%' }} />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>W trakcie</span><span>{resolution.reviewing_pct}%</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 rounded-full transition-all"
                    style={{ width: resolution.reviewing_pct + '%' }} />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Nowe</span><span>{resolution.new_pct}%</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: resolution.new_pct + '%' }} />
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 flex flex-col justify-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Szczyt naruszeń</div>
            <div className="text-3xl font-bold text-orange-400">
              {peakHour.count > 0 ? `${String(peakHour.hour).padStart(2,'0')}:00` : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {peakHour.count > 0 ? `${peakHour.count} incydentów (ostatnie 7 dni)` : 'Brak danych'}
            </div>
          </div>
        </div>
      )}

      {/* Timeline with days selector */}
      <div className="bg-gray-900 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-gray-300">Naruszenia — historia</div>
          <div className="flex gap-1 text-xs">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setTlDays(d)}
                className={`px-2 py-0.5 rounded transition-colors
                  ${timelineDays === d ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {filledTimeline.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">Brak danych</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={filledTimeline} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f9fafb' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Bar dataKey="count" name="Incydenty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Hourly heatmap */}
      {hourly.length > 0 && hourly.some(h => h.count > 0) && (
        <div className="bg-gray-900 rounded-xl p-5">
          <div className="text-sm font-medium text-gray-300 mb-4">
            Naruszenia wg godziny (ostatnie 7 dni)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour"
                tickFormatter={h => `${String(h).padStart(2,'0')}h`}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval={1}
              />
              <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                labelFormatter={h => `Godzina ${String(h).padStart(2,'0')}:00`}
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f9fafb' }}
                itemStyle={{ color: '#f97316' }}
              />
              <Bar dataKey="count" name="Incydenty" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Zone Heatmap */}
      {byZone.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5">
          <div className="text-sm font-medium text-gray-300 mb-1">Heatmapa stref — intensywność naruszeń</div>
          <div className="text-xs text-gray-500 mb-4">Rozmiar i kolor kafelka odpowiadają liczbie incydentów</div>
          {(() => {
            const maxCount = Math.max(...byZone.map(z => z.count), 1)
            function heatColor(count) {
              const t = count / maxCount
              if (t === 0) return { bg: 'rgba(55,65,81,0.6)', border: '#374151', text: '#6b7280' }
              if (t < 0.25) return { bg: 'rgba(59,130,246,0.25)', border: 'rgba(59,130,246,0.5)', text: '#93c5fd' }
              if (t < 0.5)  return { bg: 'rgba(234,179,8,0.25)',  border: 'rgba(234,179,8,0.5)',  text: '#fde047' }
              if (t < 0.75) return { bg: 'rgba(249,115,22,0.35)', border: 'rgba(249,115,22,0.6)', text: '#fdba74' }
              return { bg: 'rgba(239,68,68,0.35)', border: 'rgba(239,68,68,0.7)', text: '#fca5a5' }
            }
            return (
              <div className="flex flex-wrap gap-3 items-end">
                {[...byZone].sort((a,b) => b.count - a.count).map(z => {
                  const t = z.count / maxCount
                  const c = heatColor(z.count)
                  const size = Math.max(64, Math.round(64 + t * 80))
                  return (
                    <div key={z.zone}
                      className="flex flex-col items-center justify-center rounded-xl font-medium text-center transition-all"
                      style={{
                        width: size, height: size,
                        backgroundColor: c.bg,
                        border: `2px solid ${c.border}`,
                        color: c.text,
                      }}>
                      <div className="text-lg font-bold leading-none">{z.count}</div>
                      <div className="text-[10px] mt-1 px-1 leading-tight break-all max-w-full"
                        style={{ wordBreak: 'break-word' }}>
                        {z.zone}
                      </div>
                    </div>
                  )
                })}
                {/* Legend */}
                <div className="flex flex-col gap-1 ml-2 self-end pb-1">
                  {[
                    { label: 'Krytyczna', bg: 'rgba(239,68,68,0.35)', border: 'rgba(239,68,68,0.7)' },
                    { label: 'Wysoka',    bg: 'rgba(249,115,22,0.35)', border: 'rgba(249,115,22,0.6)' },
                    { label: 'Średnia',   bg: 'rgba(234,179,8,0.25)',  border: 'rgba(234,179,8,0.5)' },
                    { label: 'Niska',     bg: 'rgba(59,130,246,0.25)', border: 'rgba(59,130,246,0.5)' },
                    { label: 'Brak',      bg: 'rgba(55,65,81,0.6)',    border: '#374151' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded flex-shrink-0"
                        style={{ backgroundColor: l.bg, border: `1px solid ${l.border}` }} />
                      <span className="text-[10px] text-gray-400">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By type — Pie */}
        <div className="bg-gray-900 rounded-xl p-5">
          <div className="text-sm font-medium text-gray-300 mb-4">Podział wg typu naruszenia</div>
          {byType.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">Brak danych</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byType} dataKey="count" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byType.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By zone — Bar */}
        <div className="bg-gray-900 rounded-xl p-5">
          <div className="text-sm font-medium text-gray-300 mb-4">Top strefy</div>
          {byZone.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">Brak danych</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byZone} layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis type="category" dataKey="zone" width={90}
                  tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                  itemStyle={{ color: '#f97316' }}
                />
                <Bar dataKey="count" name="Incydenty" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
