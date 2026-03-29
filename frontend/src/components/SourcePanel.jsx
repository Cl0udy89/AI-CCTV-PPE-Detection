import { useState, useEffect } from 'react'
import { apiFetch } from '../api'

const RESOLUTIONS = [
  { label: '1920×1080 (Full HD)', w: 1920, h: 1080 },
  { label: '1280×720 (HD)',       w: 1280, h: 720  },
  { label: '1024×768',            w: 1024, h: 768  },
  { label: '640×480 (SD)',        w: 640,  h: 480  },
]

const HISTORY_KEY = 'ppe_rtsp_history'
const MAX_HISTORY = 5

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function saveHistory(url) {
  const h = [url, ...loadHistory().filter(u => u !== url)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}

export default function SourcePanel({ onConnect, onDisconnect, connected, currentSource }) {
  const [input, setInput]         = useState('')
  const [res, setRes]             = useState(RESOLUTIONS[0])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [actualRes, setActualRes] = useState(null)
  const [cameras, setCameras]     = useState([])
  const [scanning, setScanning]   = useState(false)
  const [history, setHistory]     = useState(loadHistory)

  async function scanCameras() {
    setScanning(true)
    setCameras([])
    setError(null)
    try {
      const r = await apiFetch('/stream/cameras')
      if (!r.ok) throw new Error('Backend nie odpowiada')
      const data = await r.json()
      setCameras(data.cameras)
      if (data.cameras.length === 0) {
        setError('Nie znaleziono żadnych kamer. Upewnij się że OBS Virtual Camera jest włączona.')
      }
    } catch (e) {
      setError('Błąd skanowania: ' + e.message)
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (!connected) scanCameras()
  }, [])

  async function connect(source) {
    setLoading(true); setError(null)
    try {
      const r = await apiFetch('/stream/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, width: res.w, height: res.h }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Nie można otworzyć źródła')
      setActualRes(data.resolution)
      // Save RTSP URLs to history (not numeric camera indices)
      if (isNaN(Number(source))) {
        saveHistory(source)
        setHistory(loadHistory())
      }
      onConnect(source)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    await apiFetch('/stream/close', { method: 'POST' })
    setActualRes(null)
    onDisconnect()
  }

  return (
    <div className="rounded-xl p-5 space-y-4 border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Źródło wideo</h2>

      {/* Resolution selector */}
      <div className="space-y-1">
        <label className="text-xs" style={{ color: 'var(--muted)' }}>Rozdzielczość</label>
        <select
          value={`${res.w}x${res.h}`}
          onChange={e => {
            const [w, h] = e.target.value.split('x').map(Number)
            setRes(RESOLUTIONS.find(r => r.w === w && r.h === h) || RESOLUTIONS[0])
          }}
          disabled={connected}
          className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          {RESOLUTIONS.map(r => (
            <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>{r.label}</option>
          ))}
        </select>
        {connected && actualRes && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Rzeczywista: {actualRes[0]}×{actualRes[1]}
            {(actualRes[0] !== res.w || actualRes[1] !== res.h) && (
              <span className="text-yellow-500 ml-1">
                (kamera nie obsługuje {res.w}×{res.h})
              </span>
            )}
          </p>
        )}
      </div>

      {/* Camera scan */}
      {!connected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs" style={{ color: 'var(--muted)' }}>Dostępne kamery</label>
            <button
              onClick={scanCameras}
              disabled={scanning}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {scanning ? 'Skanowanie...' : 'Odśwież'}
            </button>
          </div>

          {scanning && (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--surface2)', color: 'var(--muted)' }}>
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
              Skanowanie kamer 0–9, proszę czekać...
            </div>
          )}

          {!scanning && cameras.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cameras.map(cam => (
                <button
                  key={cam.index}
                  onClick={() => connect(String(cam.index))}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600
                             disabled:opacity-40 text-sm font-medium transition-colors cursor-pointer"
                >
                  {cam.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RTSP input */}
      <div className="space-y-1">
        <label className="text-xs" style={{ color: 'var(--muted)' }}>RTSP / URL</label>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && input.trim() && !loading && !connected && connect(input.trim())}
          placeholder="rtsp://user:pass@192.168.1.10:554/stream"
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
          style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
        <button onClick={() => connect(input.trim())}
          disabled={!input.trim() || loading || connected}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-white mt-1"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--accent-hover)' }}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
          {loading ? 'Łączenie…' : 'Połącz RTSP'}
        </button>

        {/* History */}
        {!connected && history.length > 0 && (
          <div className="mt-1.5 space-y-1">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Ostatnie połączenia:</div>
            {history.map(url => (
              <button key={url} onClick={() => setInput(url)}
                className="w-full text-left text-xs rounded px-2 py-1 truncate transition-colors cursor-pointer"
                style={{ color: 'var(--muted)', backgroundColor: 'var(--surface2)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.backgroundColor = 'var(--border)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.backgroundColor = 'var(--surface2)' }}>
                {url}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      {connected && (
        <div className="flex items-center justify-between rounded-lg px-4 py-2.5 border"
          style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-green-400 font-medium truncate">Live — {currentSource}</span>
          </div>
          <button onClick={disconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors ml-2 flex-shrink-0 cursor-pointer">
            Rozłącz
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
