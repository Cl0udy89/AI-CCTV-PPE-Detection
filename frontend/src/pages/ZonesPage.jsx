/**
 * Zones page — full zone management.
 *
 * Features:
 *  - Draw new zones (polygon) on camera snapshot
 *  - Draw mode: click = add point, drag existing point = move it, snap to other-zone vertices
 *  - Edit existing zone shape (drag vertex, click edge = insert point, RMB = delete vertex)
 *  - Inline edit: name + type in the zone list
 *  - Lock/unlock zone (padlock button)
 *  - Existing zones shown as overlay during draw/edit
 *  - Overlap prevention: can't save if new polygon intersects existing one
 *  - Snap: when cursor within SNAP_R px of another zone's vertex → auto-align (no gap)
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Polygon math ───────────────────────────────────────────────────────────

function ptInPoly(px, py, poly) {
  const pts = poly.map(p => Array.isArray(p) ? p : [p.x, p.y])
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx-ax, d1y = by-ay, d2x = dx-cx, d2y = dy-cy
  const cross = d1x*d2y - d1y*d2x
  if (Math.abs(cross) < 1e-8) return false
  const t = ((cx-ax)*d2y - (cy-ay)*d2x) / cross
  const u = ((cx-ax)*d1y - (cy-ay)*d1x) / cross
  return t > 0 && t < 1 && u > 0 && u < 1
}

function polysOverlap(a, b) {
  const n = p => Array.isArray(p) ? p : [p.x, p.y]
  const an = a.map(n), bn = b.map(n)
  if (an.length < 3 || bn.length < 3) return false
  for (const p of an) if (ptInPoly(p[0], p[1], bn)) return true
  for (const p of bn) if (ptInPoly(p[0], p[1], an)) return true
  for (let i = 0; i < an.length; i++) {
    const a1 = an[i], a2 = an[(i+1) % an.length]
    for (let j = 0; j < bn.length; j++) {
      const b1 = bn[j], b2 = bn[(j+1) % bn.length]
      if (segsCross(a1[0],a1[1],a2[0],a2[1],b1[0],b1[1],b2[0],b2[1])) return true
    }
  }
  return false
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

function getCoords(e, canvas) {
  const r = canvas.getBoundingClientRect()
  return {
    x: Math.round((e.clientX - r.left) * canvas.width  / r.width),
    y: Math.round((e.clientY - r.top)  * canvas.height / r.height),
  }
}

const VR   = 14   // vertex hit radius (canvas px)
const ER   = 12   // edge hit threshold
const SNAP_R = 20 // snap-to-vertex radius

function nearVertex(pts, x, y) {
  for (let i = 0; i < pts.length; i++)
    if (Math.hypot(pts[i].x - x, pts[i].y - y) < VR) return i
  return -1
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, l2 = dx*dx+dy*dy
  if (!l2) return Math.hypot(px-ax, py-ay)
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/l2))
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy))
}

function nearEdge(pts, x, y) {
  if (nearVertex(pts, x, y) >= 0) return -1
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length]
    if (distSeg(x, y, a.x, a.y, b.x, b.y) < ER) return i
  }
  return -1
}

// ─── Config ──────────────────────────────────────────────────────────────────

const ZONE_TYPES = [
  { value: 'restricted',   label: '⛔ Restricted',   desc: 'Zakaz wstępu — każda osoba = alert',    color: 'bg-red-900/30 border-red-700',    badge: 'bg-red-700 text-red-100',    canvas: '#ef4444' },
  { value: 'ppe_required', label: '⚠ PPE Required',  desc: 'Alert gdy osoba bez PPE w strefie',     color: 'bg-amber-900/30 border-amber-700', badge: 'bg-amber-700 text-amber-100', canvas: '#f59e0b' },
  { value: 'safe',         label: '✓ Safe Zone',      desc: 'Tylko oznaczenie, brak alertów',         color: 'bg-green-900/20 border-green-800', badge: 'bg-green-800 text-green-100', canvas: '#22c55e' },
]
const typeInfo = t => ZONE_TYPES.find(x => x.value === t) || ZONE_TYPES[0]
const DOT_COLORS = ['#f97316','#ef4444','#a855f7','#06b6d4','#22c55e','#eab308']

// ─── Canvas draw helpers ──────────────────────────────────────────────────────

function drawZoneOverlay(ctx, zone) {
  if (zone.points.length < 3) return
  const pts = zone.points
  const col = typeInfo(zone.zone_type).canvas
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]))
  ctx.closePath()
  ctx.fillStyle = col + '28'; ctx.fill()
  ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 1.5; ctx.stroke()
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  ctx.fillStyle = col; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(zone.name, cx, cy)
  ctx.textAlign = 'left'
  // Draw existing vertices as small dots for snap reference
  pts.forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fillStyle = col + '99'; ctx.fill()
  })
}

function drawActivePoly(ctx, pts, col, mode, hoverInfo, dragIdx, drawHoverIdx) {
  if (pts.length === 0) return

  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
  if (pts.length >= 3) ctx.closePath()
  ctx.fillStyle = col + '33'; ctx.fill()
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke()

  // Highlight hovered edge (edit mode)
  if (mode === 'edit' && hoverInfo.type === 'edge' && hoverInfo.idx >= 0) {
    const i = hoverInfo.idx, a = pts[i], b = pts[(i+1) % pts.length]
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 3; ctx.stroke()
  }

  pts.forEach((p, i) => {
    const isEditActive = mode === 'edit' && (dragIdx === i || (hoverInfo.type === 'vertex' && hoverInfo.idx === i))
    const isDrawActive = mode === 'draw' && (dragIdx === i || drawHoverIdx === i)
    const active = isEditActive || isDrawActive
    ctx.beginPath()
    ctx.arc(p.x, p.y, active ? 10 : 7, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#22c55e' : col
    ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(i + 1, p.x + 9, p.y + 4)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function ZonesPage({ connected }) {
  const [zones, setZones]         = useState([])
  const [mode, setMode]           = useState('live')   // 'live' | 'draw' | 'edit'
  const [snapshot, setSnapshot]   = useState(null)
  const [imgSize, setImgSize]     = useState({ w: 1280, h: 720 })
  const [ppeZoneOnly, setPpeZoneOnly] = useState(false)

  // Draw mode
  const [points, setPoints]       = useState([])
  const [zoneName, setZoneName]   = useState('Danger Zone')
  const [zoneType, setZoneType]   = useState('restricted')
  const [drawDragIdx, setDrawDragIdx] = useState(null)
  const [drawHoverIdx, setDrawHoverIdx] = useState(-1)
  const didDrawDrag = useRef(false)

  // Edit mode
  const [editZone, setEditZone]   = useState(null)
  const [editPoints, setEditPoints] = useState([])
  const [dragIdx, setDragIdx]     = useState(null)
  const [hoverInfo, setHoverInfo] = useState({ type: null, idx: -1 })

  // Inline list edit
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName]   = useState('')
  const [editType, setEditType]   = useState('')

  // Snap hint & overlap error
  const [snapHint, setSnapHint]   = useState(null)   // { x, y } | null
  const [overlapErr, setOverlapErr] = useState(null)

  const canvasRef = useRef(null)
  const imgRef    = useRef(null)

  const loadZones = useCallback(async () => {
    const r = await fetch('/zones/').then(x => x.json()).catch(() => [])
    setZones(r)
  }, [])

  useEffect(() => {
    loadZones()
    fetch('/detection/settings').then(r => r.json()).then(d => {
      setPpeZoneOnly(d.ppe_zone_only ?? false)
    }).catch(() => {})
  }, [loadZones])

  // ── Snap helper ────────────────────────────────────────────────────────────
  function snapToZones(x, y, excludeId = null) {
    let best = null, bestD = SNAP_R
    for (const z of zones) {
      if (z.id === excludeId) continue
      for (const [px, py] of z.points) {
        const d = Math.hypot(px - x, py - y)
        if (d < bestD) { bestD = d; best = { x: px, y: py } }
      }
    }
    return best ?? { x, y }
  }

  // ── Canvas redraw ──────────────────────────────────────────────────────────
  useEffect(() => {
    if ((mode !== 'draw' && mode !== 'edit') || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Existing zones as dimmed overlay (with vertex dots for snap reference)
    const skipId = mode === 'edit' ? editZone?.id : null
    zones.forEach(z => { if (z.id !== skipId) drawZoneOverlay(ctx, z) })

    // Active polygon
    const curPts = mode === 'edit' ? editPoints : points
    const curType = mode === 'edit' ? (editZone?.zone_type || 'restricted') : zoneType
    drawActivePoly(ctx, curPts, typeInfo(curType).canvas, mode, hoverInfo, dragIdx, drawHoverIdx)

    // Snap hint — golden dashed ring
    if (snapHint) {
      ctx.beginPath()
      ctx.arc(snapHint.x, snapHint.y, 13, 0, Math.PI * 2)
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 2.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

  }, [points, editPoints, mode, snapshot, zoneType, editZone, zones, dragIdx, hoverInfo,
      drawHoverIdx, snapHint])

  // ── Overlap check ──────────────────────────────────────────────────────────
  function checkOverlap(newPts, excludeId = null) {
    for (const z of zones) {
      if (z.id === excludeId || z.points.length < 3) continue
      if (polysOverlap(newPts, z.points)) return z.name
    }
    return null
  }

  // ── Snapshot helper ────────────────────────────────────────────────────────
  async function takeSnapshot() {
    const r = await fetch('/stream/snapshot')
    if (!r.ok) { alert('Nie można pobrać klatki. Uruchom stream.'); return null }
    return URL.createObjectURL(await r.blob())
  }

  // ── Draw mode ──────────────────────────────────────────────────────────────
  async function startDraw() {
    if (!connected) { alert('Uruchom stream kamery'); return }
    const snap = await takeSnapshot(); if (!snap) return
    setSnapshot(snap); setPoints([]); setOverlapErr(null); setSnapHint(null); setMode('draw')
  }

  function handleCanvasClick(e) {
    if (mode !== 'draw') return
    if (didDrawDrag.current) { didDrawDrag.current = false; return }
    const raw = getCoords(e, canvasRef.current)
    const snapped = snapToZones(raw.x, raw.y)
    setPoints(prev => [...prev, snapped])
  }

  async function saveZone() {
    if (points.length < 3) { alert('Minimum 3 punkty'); return }
    const newPts = points.map(p => [p.x, p.y])
    const overlap = checkOverlap(newPts)
    if (overlap) { setOverlapErr(overlap); return }
    setOverlapErr(null)
    try {
      const res = await fetch('/zones/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zoneName.trim() || 'Zone', points: newPts, zone_type: zoneType }),
      })
      if (!res.ok) { alert(`Błąd ${res.status}: ${await res.text()}`); return }
      await loadZones()
      setMode('live'); setPoints([]); setSnapshot(null)
    } catch { alert('Backend nie odpowiada. Sprawdź czy serwer działa (port 8000).') }
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  async function startEdit(zone) {
    if (!connected) { alert('Uruchom stream kamery'); return }
    const snap = await takeSnapshot(); if (!snap) return
    setSnapshot(snap)
    setEditZone(zone)
    setEditPoints(zone.points.map(p => ({ x: p[0], y: p[1] })))
    setDragIdx(null); setHoverInfo({ type: null, idx: -1 }); setOverlapErr(null); setSnapHint(null)
    setMode('edit')
  }

  // ── Unified mouse handlers ─────────────────────────────────────────────────
  function handleMouseDown(e) {
    if (e.button === 2) return  // RMB handled by contextmenu
    const { x, y } = getCoords(e, canvasRef.current)

    if (mode === 'draw') {
      const vi = nearVertex(points, x, y)
      if (vi >= 0) {
        didDrawDrag.current = true   // prevent click from adding a point
        setDrawDragIdx(vi)
      } else {
        didDrawDrag.current = false
      }
      return
    }

    if (mode === 'edit') {
      const vi = nearVertex(editPoints, x, y)
      if (vi >= 0) { setDragIdx(vi); return }
      if (editPoints.length >= 2) {
        const ei = nearEdge(editPoints, x, y)
        if (ei >= 0) {
          setEditPoints(prev => {
            const next = [...prev]; next.splice(ei + 1, 0, { x, y }); return next
          })
          setDragIdx(ei + 1)
        }
      }
    }
  }

  function handleMouseMove(e) {
    const { x, y } = getCoords(e, canvasRef.current)

    if (mode === 'draw') {
      if (drawDragIdx !== null) {
        const snapped = snapToZones(x, y)
        setPoints(prev => prev.map((p, i) => i === drawDragIdx ? snapped : p))
        setSnapHint(snapped.x !== x || snapped.y !== y ? snapped : null)
      } else {
        const vi = nearVertex(points, x, y)
        setDrawHoverIdx(vi)
        const snapped = snapToZones(x, y)
        setSnapHint(snapped.x !== x || snapped.y !== y ? snapped : null)
      }
      return
    }

    if (mode === 'edit') {
      if (dragIdx !== null) {
        const snapped = snapToZones(x, y, editZone?.id)
        setEditPoints(prev => prev.map((p, i) => i === dragIdx ? snapped : p))
        setSnapHint(snapped.x !== x || snapped.y !== y ? snapped : null)
      } else {
        setSnapHint(null)
        const vi = nearVertex(editPoints, x, y)
        if (vi >= 0) { setHoverInfo({ type: 'vertex', idx: vi }); return }
        const ei = nearEdge(editPoints, x, y)
        if (ei >= 0) { setHoverInfo({ type: 'edge', idx: ei }); return }
        setHoverInfo({ type: null, idx: -1 })
      }
    }
  }

  function handleMouseUp() {
    setDrawDragIdx(null)
    setDragIdx(null)
    setSnapHint(null)
  }

  function handleContextMenu(e) {
    if (mode !== 'edit') return
    e.preventDefault()
    const { x, y } = getCoords(e, canvasRef.current)
    const vi = nearVertex(editPoints, x, y)
    if (vi >= 0 && editPoints.length > 3)
      setEditPoints(prev => prev.filter((_, i) => i !== vi))
  }

  async function saveEdit() {
    if (editPoints.length < 3) { alert('Minimum 3 punkty'); return }
    const newPts = editPoints.map(p => [p.x, p.y])
    const overlap = checkOverlap(newPts, editZone.id)
    if (overlap) { setOverlapErr(overlap); return }
    setOverlapErr(null)
    try {
      const res = await fetch(`/zones/${editZone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newPts }),
      })
      if (!res.ok) { alert(`Błąd ${res.status}`); return }
      await loadZones()
      setMode('live'); setEditZone(null); setEditPoints([]); setSnapshot(null)
    } catch { alert('Backend nie odpowiada.') }
  }

  function cancelCanvas() {
    setMode('live'); setEditZone(null); setEditPoints([])
    setPoints([]); setSnapshot(null); setOverlapErr(null); setSnapHint(null)
    setDrawDragIdx(null); setDragIdx(null)
  }

  // ── Zone list actions ──────────────────────────────────────────────────────
  async function patch(id, body) {
    await fetch(`/zones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    loadZones()
  }

  function startInlineEdit(z) {
    setEditingId(z.id); setEditName(z.name); setEditType(z.zone_type)
  }

  async function saveInlineEdit(id) {
    const body = { zone_type: editType }
    if (editName.trim()) body.name = editName.trim()
    await patch(id, body)
    setEditingId(null)
  }

  async function togglePpeZoneOnly(val) {
    setPpeZoneOnly(val)
    await fetch('/detection/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ppe_zone_only: val }),
    })
  }

  const canvasCursor = mode === 'edit'
    ? (hoverInfo.type === 'vertex' ? 'grab' : hoverInfo.type === 'edge' ? 'copy' : 'default')
    : mode === 'draw'
      ? (drawDragIdx !== null || drawHoverIdx >= 0 ? 'grab' : 'crosshair')
      : 'default'

  return (
    <div className="flex gap-5 h-full min-h-0">

      {/* ── LEFT: camera / canvas ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-3 flex-wrap min-h-8">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'draw' ? 'Rysowanie strefy'
             : mode === 'edit' ? `Edycja kształtu: ${editZone?.name}`
             : 'Podgląd na żywo'}
          </h2>
          {mode === 'live' && connected && (
            <button onClick={startDraw}
              className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-sm font-medium transition-colors">
              + Narysuj nową strefę
            </button>
          )}
          {mode === 'live' && !connected && (
            <span className="text-xs text-gray-500">Uruchom stream na zakładce Live</span>
          )}
          {overlapErr && (
            <span className="text-xs text-red-400 bg-red-900/30 border border-red-800 px-2 py-1 rounded">
              Nakłada się na: <b>{overlapErr}</b>
            </span>
          )}
          {snapHint && (
            <span className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/50 px-2 py-1 rounded">
              🔗 Przyciąganie aktywne
            </span>
          )}
        </div>

        {/* Video / Canvas — outer div holds flex space, inner fills it absolutely */}
        <div className="flex-1 min-h-0 relative" style={{ minHeight: '320px' }}>
          <div className="absolute inset-0 bg-black rounded-xl overflow-hidden">
            {mode === 'live' ? (
              connected ? (
                <>
                  <img src="/stream/feed" alt="live" className="w-full h-full object-contain" />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-semibold text-white">LIVE</span>
                  </div>
                  {zones.filter(z => z.active).length > 0 && (
                    <div className="absolute top-3 right-3 bg-black/60 rounded-lg px-3 py-1.5 text-xs text-white space-y-0.5">
                      {zones.filter(z => z.active).map(z => (
                        <div key={z.id} className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${typeInfo(z.zone_type).badge}`}>
                            {z.zone_type === 'restricted' ? '⛔' : z.zone_type === 'ppe_required' ? '⚠' : '✓'}
                          </span>
                          {z.name}
                          {z.locked && <span>🔒</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="text-4xl">📷</div>
                    <p className="text-gray-400 text-sm">Brak streamu</p>
                    <p className="text-gray-600 text-xs">Przejdź na zakładkę "Live" i podłącz kamerę</p>
                  </div>
                </div>
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-950 relative select-none">
                {snapshot && (
                  <img ref={imgRef} src={snapshot} alt="" className="hidden"
                    onLoad={() => {
                      if (!canvasRef.current || !imgRef.current) return
                      const iw = imgRef.current.naturalWidth, ih = imgRef.current.naturalHeight
                      canvasRef.current.width = iw; canvasRef.current.height = ih
                      setImgSize({ w: iw, h: ih })
                      const ctx = canvasRef.current.getContext('2d')
                      ctx.drawImage(imgRef.current, 0, 0)
                    }}
                  />
                )}
                <canvas ref={canvasRef}
                  width={imgSize.w} height={imgSize.h}
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onContextMenu={handleContextMenu}
                  style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto',
                           cursor: canvasCursor, background: '#111827' }}
                  className="block rounded"
                />
                <div className="absolute bottom-3 left-3 bg-black/80 rounded px-2.5 py-1 text-xs text-white">
                  {mode === 'draw'
                    ? `${points.length} pkt — klik=dodaj · przeciągnij pkt=przesuń · złoty krąg=przyciąganie`
                    : `Przeciągnij wierzchołek · Kliknij krawędź=nowy pkt · PPM=usuń (${editPoints.length} pkt) · złoty krąg=przyciąganie`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls — draw mode */}
        {mode === 'draw' && (
          <div className="flex-shrink-0 bg-gray-900 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <input value={zoneName} onChange={e => setZoneName(e.target.value)}
              placeholder="Nazwa strefy"
              className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500" />
            {ZONE_TYPES.map(t => (
              <button key={t.value} onClick={() => setZoneType(t.value)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${t.color}
                            ${zoneType === t.value ? 'ring-2 ring-white/40 opacity-100' : 'opacity-50 hover:opacity-80'}`}>
                {t.label}
              </button>
            ))}
            <div className="flex gap-2 ml-auto">
              <button onClick={saveZone} disabled={points.length < 3}
                className="px-4 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 text-sm font-medium transition-colors">
                Zapisz
              </button>
              <button onClick={() => setPoints(p => p.slice(0, -1))} disabled={points.length === 0}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-sm transition-colors">↩</button>
              <button onClick={() => setPoints([])}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Wyczyść</button>
              <button onClick={cancelCanvas}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors">Anuluj</button>
            </div>
          </div>
        )}

        {/* Controls — edit mode */}
        {mode === 'edit' && (
          <div className="flex-shrink-0 bg-gray-900 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-300">Edycja kształtu: <b className="text-white">{editZone?.name}</b></span>
            <div className="flex gap-2 ml-auto">
              <button onClick={saveEdit} disabled={editPoints.length < 3}
                className="px-4 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 text-sm font-medium transition-colors">
                Zapisz kształt
              </button>
              <button onClick={cancelCanvas}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors">Anuluj</button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: zone list ──────────────────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">

        {/* PPE zone-only toggle */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Tryb egzekwowania PPE</h3>
          <div className="space-y-2">
            {[
              { val: false, label: 'Wszędzie',                    desc: 'Brak PPE = alert niezależnie od strefy',     active: 'border-blue-600 bg-blue-900/20',   dot: 'border-blue-400 bg-blue-400' },
              { val: true,  label: 'Tylko w strefach PPE Required', desc: 'Poza strefami brak PPE jest dozwolony',   active: 'border-amber-600 bg-amber-900/20', dot: 'border-amber-400 bg-amber-400' },
            ].map(({ val, label, desc, active, dot }) => (
              <label key={String(val)}
                className={`flex items-start gap-3 cursor-pointer rounded-lg px-3 py-2.5 border transition-all
                            ${ppeZoneOnly === val ? active : 'border-gray-700 hover:border-gray-600'}`}
                onClick={() => togglePpeZoneOnly(val)}>
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${ppeZoneOnly === val ? dot : 'border-gray-500'}`} />
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Zone list */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-3 flex-1">
          <h3 className="text-sm font-semibold text-white">
            Strefy
            <span className="ml-2 text-xs text-gray-500">({zones.filter(z => z.active).length} aktywnych)</span>
          </h3>

          {zones.length === 0 ? (
            <p className="text-sm text-gray-500">Brak stref. Kliknij "+ Narysuj nową strefę".</p>
          ) : (
            <div className="space-y-2">
              {zones.map((z, i) => {
                const ti = typeInfo(z.zone_type)
                const isEditing = editingId === z.id
                return (
                  <div key={z.id}
                    className={`rounded-lg p-3 space-y-2 border transition-opacity
                                ${z.active ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-800/40 opacity-60'}`}>

                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />

                      {isEditing ? (
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveInlineEdit(z.id)}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-sm
                                     focus:outline-none focus:ring-1 focus:ring-orange-500" autoFocus />
                      ) : (
                        <span className="text-sm font-medium text-white flex-1 truncate">{z.name}</span>
                      )}

                      {/* Lock */}
                      <button onClick={() => patch(z.id, { locked: !z.locked })}
                        title={z.locked ? 'Odblokuj strefę' : 'Zablokuj strefę'}
                        className={`text-base leading-none px-1 py-0.5 rounded transition-colors
                                    ${z.locked ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-600 hover:text-gray-300'}`}>
                        {z.locked ? '🔒' : '🔓'}
                      </button>

                      {/* Toggle active */}
                      <button onClick={() => patch(z.id, { active: !z.active })}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                                    ${z.active ? 'bg-green-700/60 text-green-300 hover:bg-green-700'
                                               : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                        {z.active ? 'ON' : 'OFF'}
                      </button>

                      {/* Delete */}
                      <button onClick={() => fetch(`/zones/${z.id}`, { method: 'DELETE' }).then(loadZones)}
                        disabled={z.locked}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-20 disabled:cursor-not-allowed px-1 transition-colors">
                        ✕
                      </button>
                    </div>

                    {/* Type selector or badge */}
                    {isEditing ? (
                      <div className="flex flex-wrap gap-1">
                        {ZONE_TYPES.map(t => (
                          <button key={t.value} onClick={() => setEditType(t.value)}
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${t.badge}
                                        ${editType === t.value ? 'ring-1 ring-white/60' : 'opacity-50 hover:opacity-80'}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-xs rounded px-2 py-1 ${ti.badge}`}>{ti.label}</div>
                    )}

                    {/* Action buttons */}
                    {!z.locked && (
                      <div className="flex gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveInlineEdit(z.id)}
                              className="flex-1 py-1 rounded bg-green-700 hover:bg-green-600 text-xs font-medium transition-colors">
                              Zapisz
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors">
                              Anuluj
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startInlineEdit(z)}
                              className="flex-1 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors">
                              Nazwa / typ
                            </button>
                            {connected && (
                              <button onClick={() => startEdit(z)}
                                className="px-3 py-1 rounded bg-blue-700/60 hover:bg-blue-700 text-xs transition-colors">
                                Kształt
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-gray-500">{z.points.length} punktów</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
