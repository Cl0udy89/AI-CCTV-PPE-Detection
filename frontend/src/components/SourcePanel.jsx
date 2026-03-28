import { useState } from 'react'

const PRESETS = [
  { label: 'OBS Virtual Camera #0', value: '0' },
  { label: 'Webcam #1', value: '1' },
  { label: 'Webcam #2', value: '2' },
]

const RESOLUTIONS = [
  { label: '1920×1080 (Full HD)', w: 1920, h: 1080 },
  { label: '1280×720 (HD)',       w: 1280, h: 720  },
  { label: '1024×768',            w: 1024, h: 768  },
  { label: '640×480 (SD)',        w: 640,  h: 480  },
]

export default function SourcePanel({ onConnect, onDisconnect, connected, currentSource }) {
  const [input, setInput]         = useState('')
  const [res, setRes]             = useState(RESOLUTIONS[0])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [actualRes, setActualRes] = useState(null)

  async function connect(source) {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/stream/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, width: res.w, height: res.h }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Nie można otworzyć źródła')
      setActualRes(data.resolution)
      onConnect(source)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    await fetch('/stream/close', { method: 'POST' })
    setActualRes(null)
    onDisconnect()
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">Źródło wideo</h2>

      {/* Resolution selector */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Rozdzielczość</label>
        <select
          value={`${res.w}x${res.h}`}
          onChange={e => {
            const [w, h] = e.target.value.split('x').map(Number)
            setRes(RESOLUTIONS.find(r => r.w === w && r.h === h) || RESOLUTIONS[0])
          }}
          disabled={connected}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5
                     text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50"
        >
          {RESOLUTIONS.map(r => (
            <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>{r.label}</option>
          ))}
        </select>
        {connected && actualRes && (
          <p className="text-xs text-gray-500">
            Rzeczywista: {actualRes[0]}×{actualRes[1]}
            {(actualRes[0] !== res.w || actualRes[1] !== res.h) && (
              <span className="text-yellow-500 ml-1">
                (kamera nie obsługuje {res.w}×{res.h})
              </span>
            )}
          </p>
        )}
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button key={p.value} onClick={() => connect(p.value)}
            disabled={loading || connected}
            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600
                       disabled:opacity-40 text-sm font-medium transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      {/* RTSP input */}
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="rtsp://user:pass@192.168.1.10:554/stream"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                     placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={() => connect(input.trim())}
          disabled={!input.trim() || loading || connected}
          className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600
                     disabled:opacity-40 text-sm font-medium transition-colors">
          Połącz
        </button>
      </div>

      {/* Status */}
      {connected && (
        <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-green-300">Live — {currentSource}</span>
          </div>
          <button onClick={disconnect}
            className="text-sm text-red-400 hover:text-red-300 transition-colors">
            Rozłącz
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
