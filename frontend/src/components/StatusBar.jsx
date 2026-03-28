/**
 * Status bar shown below the video feed.
 * Polls /detection/classes to show active class count + color legend.
 */
import { useEffect, useState } from 'react'

const LEGEND = [
  { color: '#00dc00', label: 'PPE OK' },
  { color: '#ffdc00', label: 'Niepewny' },
  { color: '#ff8c00', label: 'Naruszenie (timer)' },
  { color: '#ff2020', label: 'NARUSZENIE' },
]

export default function StatusBar({ connected }) {
  const [classCount, setClassCount] = useState({ enabled: 0, all: 0 })

  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => {
      fetch('/detection/classes')
        .then(r => r.json())
        .then(d => setClassCount({ enabled: d.enabled.length, all: d.all.length }))
        .catch(() => {})
    }, 2000)
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

      {/* Class count */}
      <div className="text-gray-400">
        Klasy: <span className="text-white font-semibold">{classCount.enabled}</span>
        <span className="text-gray-600"> / {classCount.all}</span>
      </div>

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
        Alert po: <span className="text-yellow-400">3 s</span>
      </div>
    </div>
  )
}
