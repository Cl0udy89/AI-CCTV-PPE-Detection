import { useRef, useState } from 'react'
import { apiFetch } from '../api'

export default function VideoFeed({ connected }) {
  const containerRef = useRef(null)
  const [isFS, setIsFS]         = useState(false)
  const [snapMsg, setSnapMsg]   = useState(null)

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFS(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFS(false)).catch(() => {})
    }
  }

  async function takeSnapshot() {
    try {
      const r = await apiFetch('/stream/snapshot')
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`
      a.click()
      URL.revokeObjectURL(url)
      setSnapMsg('Zapisano!')
      setTimeout(() => setSnapMsg(null), 2000)
    } catch {
      setSnapMsg('Błąd')
      setTimeout(() => setSnapMsg(null), 2000)
    }
  }

  if (!connected) {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-xl flex items-center justify-center
                      border-2 border-dashed border-gray-700">
        <div className="text-center space-y-2">
          <div className="text-4xl">📷</div>
          <p className="text-gray-400 text-sm">No stream connected</p>
          <p className="text-gray-600 text-xs">Select a camera source on the left</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef}
      className="w-full aspect-video bg-black rounded-xl overflow-hidden relative group"
      onDoubleClick={toggleFullscreen}
    >
      <img
        src="/stream/feed"
        alt="Live detection feed"
        className="w-full h-full object-contain"
      />

      {/* LIVE badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold text-white tracking-wide">LIVE</span>
      </div>

      {/* Controls — visible on hover */}
      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Snapshot */}
        <button
          onClick={takeSnapshot}
          title="Zapisz zrzut ekranu"
          className="bg-black/70 hover:bg-black/90 text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1"
        >
          {snapMsg ?? '📸 Snapshot'}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title="Pełny ekran (lub dwuklik)"
          className="bg-black/70 hover:bg-black/90 text-white rounded-lg px-2 py-1 text-xs"
        >
          {isFS ? '⛶ Wyjdź' : '⛶ Fullscreen'}
        </button>
      </div>
    </div>
  )
}
