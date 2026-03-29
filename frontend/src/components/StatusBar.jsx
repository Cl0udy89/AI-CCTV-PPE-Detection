/**
 * Status bar shown below the video feed.
 * Polls /stream/stats for FPS, person count, violation count, mute state.
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const LEGEND = [
  { color: '#00dc00', label: 'PPE OK' },
  { color: '#ffdc00', label: 'Niepewny' },
  { color: '#ff8c00', label: 'Naruszenie (timer)' },
  { color: '#ff2020', label: 'NARUSZENIE' },
]

export default function StatusBar({ connected }) {
  const [stats, setStats] = useState({
    fps: 0, person_count: 0, violation_count: 0, muted: false, mute_remaining: 0,
  })

  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => {
      apiFetch('/stream/stats')
        .then(r => r.json())
        .then(d => setStats(d))
        .catch(() => {})
    }, 1000)
    return () => clearInterval(id)
  }, [connected])

  if (!connected) return null

  return (
    <div className="bg-gray-900 rounded-xl px-4 py-2.5 flex items-center gap-5 text-xs flex-wrap">
      {/* Tracking status */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-gray-300 text-sm">BotSORT tracking active</span>
      </div>

      {/* FPS */}
      <div className="flex items-center gap-1.5 text-gray-400">
        <span className="font-mono text-white font-semibold">{stats.fps}</span>
        <span>FPS</span>
      </div>

      {/* Persons */}
      <div className="flex items-center gap-1.5 text-gray-400">
        <span>👤</span>
        <span className="font-mono text-white font-semibold">{stats.person_count}</span>
        <span>osób</span>
      </div>

      {/* Violations */}
      <div className={`flex items-center gap-1.5 ${stats.violation_count > 0 ? 'text-red-400' : 'text-gray-400'}`}>
        <span>⚠</span>
        <span className="font-mono font-semibold">{stats.violation_count}</span>
        <span>naruszeń</span>
      </div>

      {/* Mute indicator */}
      {stats.muted && (
        <div className="flex items-center gap-1.5 text-cyan-400 bg-cyan-900/30 rounded px-2 py-0.5">
          <span>🔇</span>
          <span>Wyciszono ({stats.mute_remaining}s)</span>
        </div>
      )}

      {/* Color legend */}
      <div className="flex items-center gap-3 ml-2">
        {LEGEND.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span className="text-gray-400">{label}</span>
          </span>
        ))}
      </div>

      {/* Threshold */}
      <div className="ml-auto text-gray-500">
        Alert po: <span className="text-yellow-400">{stats.violation_threshold ?? 3}s</span>
      </div>
    </div>
  )
}
