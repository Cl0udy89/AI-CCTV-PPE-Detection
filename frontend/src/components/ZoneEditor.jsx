/**
 * Polygon Zone Editor — improved.
 * - Snapshot from camera as drawing background
 * - Undo last point
 * - Per-zone active toggle
 * - Live intrusion counter polling
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'

const ZONE_COLORS = ['#f97316','#ef4444','#a855f7','#06b6d4','#22c55e','#eab308']

export default function ZoneEditor({ connected }) {
  const [zones, setZones]       = useState([])
  const [drawing, setDrawing]   = useState(false)
  const [points, setPoints]     = useState([])
  const [zoneName, setZoneName] = useState('Danger Zone')
  const [snapshot, setSnapshot] = useState(null)
  const [imgSize, setImgSize]   = useState({ w: 640, h: 360 })
  const canvasRef = useRef(null)
  const imgRef    = useRef(null)

  const loadZones = useCallback(async () => {
    const r = await apiFetch('/zones/').then(x => x.json()).catch(() => [])
    setZones(r)
  }, [])

  useEffect(() => { loadZones() }, [loadZones])

  // --- Drawing canvas redraw ---
  useEffect(() => {
    if (!drawing || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (imgRef.current?.complete) {
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    if (points.length === 0) return

    // Polygon fill
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.fillStyle   = 'rgba(249,115,22,0.22)'
    ctx.fill()
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth   = 2
    ctx.stroke()

    // Draw point circles
    points.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fillStyle   = i === 0 ? '#22c55e' : '#f97316'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth   = 1.5
      ctx.stroke()
      // Point number
      ctx.fillStyle = '#fff'
      ctx.font      = 'bold 10px sans-serif'
      ctx.fillText(i + 1, p.x + 8, p.y + 4)
    })
  }, [points, drawing, snapshot])

  async function startDrawing() {
    const r = await apiFetch('/stream/snapshot')
    if (!r.ok) { alert('Najpierw uruchom stream kamery.'); return }
    const blob = await r.blob()
    const url  = URL.createObjectURL(blob)
    setSnapshot(url)
    setPoints([])
    setDrawing(true)
  }

  function handleCanvasClick(e) {
    if (!drawing) return
    const rect   = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width  / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top)  * scaleY)
    setPoints(prev => [...prev, { x, y }])
  }

  function undoPoint() {
    setPoints(prev => prev.slice(0, -1))
  }

  function cancelDrawing() {
    setDrawing(false)
    setPoints([])
    setSnapshot(null)
  }

  async function saveZone() {
    if (points.length < 3) { alert('Potrzeba co najmniej 3 punktów.'); return }
    await apiFetch('/zones/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: zoneName.trim() || 'Zone',
        points: points.map(p => [p.x, p.y]),
      }),
    })
    await loadZones()
    cancelDrawing()
  }

  async function toggleZone(id, currentActive) {
    await apiFetch(`/zones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !currentActive }),
    })
    loadZones()
  }

  async function deleteZone(id) {
    await apiFetch(`/zones/${id}`, { method: 'DELETE' })
    loadZones()
  }

  if (!connected) return null

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Strefy (Zones)</h2>
          {zones.length > 0 && (
            <span className="text-xs bg-orange-600/30 text-orange-300 rounded-full px-2 py-0.5">
              {zones.filter(z => z.active).length} aktywne
            </span>
          )}
        </div>
        {!drawing && (
          <button onClick={startDrawing}
            className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500
                       text-sm font-medium transition-colors">
            + Narysuj strefę
          </button>
        )}
      </div>

      {/* Drawing UI */}
      {drawing && (
        <div className="space-y-3">
          <input
            value={zoneName}
            onChange={e => setZoneName(e.target.value)}
            placeholder="Nazwa strefy"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5
                       text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />

          {/* Canvas */}
          <div className="relative rounded-lg overflow-hidden border-2 border-orange-500/50">
            {snapshot && (
              <img ref={imgRef} src={snapshot} alt="" className="hidden"
                onLoad={() => {
                  if (!canvasRef.current || !imgRef.current) return
                  const iw = imgRef.current.naturalWidth
                  const ih = imgRef.current.naturalHeight
                  canvasRef.current.width  = iw
                  canvasRef.current.height = ih
                  setImgSize({ w: iw, h: ih })
                  const ctx = canvasRef.current.getContext('2d')
                  ctx.drawImage(imgRef.current, 0, 0)
                }}
              />
            )}
            <canvas
              ref={canvasRef}
              width={imgSize.w}
              height={imgSize.h}
              onClick={handleCanvasClick}
              className="w-full cursor-crosshair rounded-lg block"
              style={{ background: '#1f2937' }}
            />
            <div className="absolute bottom-2 left-2 flex gap-2">
              <span className="bg-black/75 rounded px-2 py-1 text-xs text-white">
                {points.length} pkt{points.length !== 1 ? 'y' : ''} — min. 3
              </span>
              {points.length > 0 && (
                <span className="bg-green-900/80 rounded px-2 py-1 text-xs text-green-300">
                  Zielony pkt = start wielokąta
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <button onClick={saveZone} disabled={points.length < 3}
              className="flex-1 py-2 rounded-lg bg-green-700 hover:bg-green-600
                         disabled:opacity-40 text-sm font-medium transition-colors">
              Zapisz strefę
            </button>
            <button onClick={undoPoint} disabled={points.length === 0}
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600
                         disabled:opacity-40 text-sm transition-colors" title="Cofnij ostatni punkt">
              ↩ Cofnij
            </button>
            <button onClick={() => setPoints([])}
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
              Wyczyść
            </button>
            <button onClick={cancelDrawing}
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Zone list */}
      {zones.length === 0 && !drawing && (
        <p className="text-sm text-gray-500">
          Brak stref. Kliknij "Narysuj strefę" żeby zaznaczyć obszar na obrazie z kamery.
        </p>
      )}

      <div className="space-y-2">
        {zones.map((z, i) => (
          <div key={z.id}
            className={`rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors
                        ${z.active ? 'bg-gray-800' : 'bg-gray-800/50 opacity-60'}`}>
            {/* Color dot */}
            <span className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 font-medium truncate">{z.name}</div>
              <div className="text-xs text-gray-500">{z.points.length} punktów</div>
            </div>

            {/* Active toggle */}
            <button
              onClick={() => toggleZone(z.id, z.active)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                          ${z.active
                            ? 'bg-green-700/50 text-green-300 hover:bg-green-700'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              {z.active ? 'ON' : 'OFF'}
            </button>

            {/* Delete */}
            <button onClick={() => deleteZone(z.id)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors px-1">
              ✕
            </button>
          </div>
        ))}
      </div>

      {zones.some(z => z.active) && (
        <p className="text-xs text-gray-500">
          Aktywne strefy są widoczne na podglądzie wideo. Gdy osoba wejdzie w strefę —
          ramka i strefa podświetlają się na <span className="text-red-400">czerwono</span>.
        </p>
      )}
    </div>
  )
}
