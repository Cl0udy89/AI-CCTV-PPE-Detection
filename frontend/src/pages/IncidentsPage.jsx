import { useState, useEffect, useCallback, useRef } from 'react'
import { apiJSON, apiFetch } from '../api'
import { useAuth, hasRole } from '../contexts/AuthContext'

const STATUS_COLORS = {
  new:       'bg-red-900 text-red-200',
  reviewing: 'bg-yellow-900 text-yellow-200',
  closed:    'bg-gray-700 text-gray-300',
}

const VIOLATION_LABELS = {
  'NO-Hardhat':     'Brak kasku',
  'NO-Safety Vest': 'Brak kamizelki',
  'NO-Mask':        'Brak maski',
}

const VIOLATION_COLORS = {
  'NO-Hardhat':     'bg-red-800 text-red-200',
  'NO-Safety Vest': 'bg-orange-800 text-orange-200',
  'NO-Mask':        'bg-purple-800 text-purple-200',
}

function fmtDate(iso) {
  const d = new Date(iso + 'Z')
  return d.toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function parseViolations(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return raw.split(',').map(v => v.trim()).filter(Boolean)
}

export default function IncidentsPage() {
  const { user } = useAuth()
  const canEdit = hasRole(user, 'operator')

  const [incidents, setIncidents]   = useState([])
  const [filterStatus, setFilter]   = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)
  const [loading, setLoading]       = useState(false)
  const [checkedIds, setCheckedIds] = useState(new Set())
  const searchTimer                 = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: 200 })
      if (filterStatus) p.set('status', filterStatus)
      if (dateFrom)     p.set('date_from', dateFrom)
      if (dateTo)       p.set('date_to', dateTo)
      if (search)       p.set('q', search)
      const d = await apiJSON(`/incidents?${p}`)
      setIncidents(d.incidents || [])
      setCheckedIds(new Set())
    } finally { setLoading(false) }
  }, [filterStatus, dateFrom, dateTo, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id) }, [load])

  function handleSearch(v) {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(v), 400)
  }

  async function changeStatus(id, status) {
    await apiFetch(`/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
    if (selected?.id === id) setSelected(prev => ({ ...prev, status }))
  }

  async function deleteInc(id) {
    if (!confirm('Usuń incydent #' + id + '?')) return
    await apiFetch(`/incidents/${id}`, { method: 'DELETE' })
    setSelected(null)
    load()
  }

  function toggleCheck(id) {
    setCheckedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll() {
    if (checkedIds.size === incidents.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(incidents.map(i => i.id)))
  }

  async function bulkAction(action) {
    const ids = [...checkedIds]
    if (!ids.length) return
    const label = action === 'delete' ? `Usunąć ${ids.length} incydentów?` : `Zmienić status ${ids.length} incydentów?`
    if (!confirm(label)) return
    await apiFetch('/incidents/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    })
    setCheckedIds(new Set())
    if (action === 'delete' && checkedIds.has(selected?.id)) setSelected(null)
    load()
  }

  const newCount = incidents.filter(i => i.status === 'new').length
  const exportParams = new URLSearchParams()
  if (filterStatus) exportParams.set('status', filterStatus)
  if (dateFrom)     exportParams.set('date_from', dateFrom)
  if (dateTo)       exportParams.set('date_to', dateTo)
  if (search)       exportParams.set('q', search)

  async function exportCSV() {
    const qs = exportParams.toString()
    const r = await apiFetch(`/incidents/export${qs ? '?' + qs : ''}`)
    if (!r.ok) return
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `incidents_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex gap-5 h-full">
      {/* List panel */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-white">Incydenty</h2>
          {newCount > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {newCount} nowych
            </span>
          )}
          <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-white">Odśwież</button>
          <button onClick={exportCSV}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1">
            ⬇ CSV
          </button>
        </div>

        <input type="text" placeholder="Szukaj (strefa, track ID, typ…)"
          onChange={e => handleSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm
                     placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />

        <div className="flex gap-1.5">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <span className="text-gray-600 self-center text-xs">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
          )}
        </div>

        <div className="flex gap-1 text-xs">
          {[
            { l: 'Dziś',   from: new Date().toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
            { l: '7 dni',  from: new Date(Date.now()-7*86400000).toISOString().slice(0,10), to: '' },
            { l: '30 dni', from: new Date(Date.now()-30*86400000).toISOString().slice(0,10), to: '' },
          ].map(({ l, from, to }) => (
            <button key={l} onClick={() => { setDateFrom(from); setDateTo(to) }}
              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white">{l}</button>
          ))}
        </div>

        <div className="flex gap-1 text-xs flex-wrap">
          {[
            { v: '', l: 'Wszystkie' }, { v: 'new', l: 'Nowe' },
            { v: 'reviewing', l: 'W trakcie' }, { v: 'closed', l: 'Zamknięte' },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1 rounded-md transition-colors
                ${filterStatus === v ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>

        {canEdit && checkedIds.size > 0 && (
          <div className="flex gap-1.5 items-center bg-gray-800 rounded-lg px-2 py-1.5 flex-wrap">
            <span className="text-xs text-gray-400">{checkedIds.size} zaznaczonych</span>
            <button onClick={() => bulkAction('status_closed')}
              className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">Zamknij</button>
            <button onClick={() => bulkAction('status_reviewing')}
              className="text-xs px-2 py-0.5 rounded bg-yellow-900 hover:bg-yellow-800 text-yellow-200">W trakcie</button>
            <button onClick={() => bulkAction('delete')}
              className="text-xs px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-red-200">Usuń</button>
            <button onClick={() => setCheckedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-300 ml-auto">✕</button>
          </div>
        )}

        {incidents.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none px-1">
            <input type="checkbox"
              checked={checkedIds.size === incidents.length}
              onChange={toggleAll}
              className="accent-blue-500" />
            Zaznacz wszystkie ({incidents.length})
          </label>
        )}

        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] space-y-2 pr-1">
          {loading && !incidents.length && (
            <p className="text-gray-500 text-sm text-center mt-8">Ładowanie…</p>
          )}
          {!loading && !incidents.length && (
            <div className="flex flex-col items-center mt-12 gap-2">
              <span className="text-4xl opacity-20">📋</span>
              <p className="text-gray-500 text-sm">Brak incydentów</p>
            </div>
          )}
          {incidents.map(inc => {
            const viols = parseViolations(inc.violation_types)
            return (
              <div key={inc.id} className="flex items-start gap-2">
                {canEdit && (
                  <input type="checkbox" checked={checkedIds.has(inc.id)}
                    onChange={() => toggleCheck(inc.id)} onClick={e => e.stopPropagation()}
                    className="mt-3 accent-blue-500 flex-shrink-0" />
                )}
                <div onClick={() => setSelected(inc)}
                  className={`flex-1 rounded-lg p-3 cursor-pointer border transition-colors
                    ${selected?.id === inc.id ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-900 hover:border-gray-600'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400">{fmtDate(inc.created_at)}</div>
                      <div className="text-sm font-medium text-white mt-0.5">#{inc.id} — Track {inc.track_id}</div>
                      {inc.zone_name && (
                        <div className="text-xs text-blue-400 mt-0.5 truncate">📍 {inc.zone_name}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {viols.map(v => (
                          <span key={v} className={`text-xs px-1.5 py-0.5 rounded font-medium
                            ${VIOLATION_COLORS[v] || 'bg-gray-700 text-gray-300'}`}>
                            {VIOLATION_LABELS[v] || v}
                          </span>
                        ))}
                      </div>
                      {inc.notes && (
                        <div className="text-xs text-gray-500 mt-1 truncate">💬 {inc.notes}</div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[inc.status] || 'bg-gray-700 text-gray-300'}`}>
                      {inc.status === 'new' ? 'Nowy' : inc.status === 'reviewing' ? 'W trakcie' : 'Zamknięty'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
            <span className="text-5xl opacity-20">🔍</span>
            <span>Wybierz incydent z listy</span>
          </div>
        ) : (
          <IncidentDetail inc={selected} canEdit={canEdit}
            onStatusChange={changeStatus}
            onDelete={deleteInc}
            onNotesChange={(id, notes) => {
              if (selected?.id === id) setSelected(prev => ({ ...prev, notes }))
              load()
            }}
          />
        )}
      </div>
    </div>
  )
}


function MediaBox({ label, children }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 flex flex-col gap-2">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</div>
      {children}
    </div>
  )
}

function VideoPlayer({ src, label }) {
  const [key, setKey]       = useState(0)
  const [failed, setFailed] = useState(false)
  const retryRef            = useRef(null)
  useEffect(() => { setKey(k => k + 1); setFailed(false) }, [src])
  function onError() {
    if (!retryRef.current) {
      retryRef.current = setInterval(() => setKey(k => k + 1), 4000)
      setTimeout(() => { clearInterval(retryRef.current); retryRef.current = null; setFailed(true) }, 60000)
    }
  }
  useEffect(() => () => clearInterval(retryRef.current), [])
  return (
    <MediaBox label={label}>
      {failed ? (
        <div className="flex flex-col items-center justify-center h-36 gap-2 text-gray-500 text-sm">
          <span>Klip niedostępny</span>
          <button onClick={() => { setFailed(false); setKey(k => k + 1) }}
            className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">Spróbuj ponownie</button>
        </div>
      ) : (
        <video key={key} controls className="w-full rounded-lg bg-black" onError={onError}>
          <source src={src} type="video/mp4" />
        </video>
      )}
    </MediaBox>
  )
}

function SnapshotImg({ src, label }) {
  const [err, setErr] = useState(false)
  useEffect(() => setErr(false), [src])
  return (
    <MediaBox label={label}>
      {err ? (
        <div className="flex items-center justify-center h-36 text-gray-500 text-sm">Brak zrzutu ekranu</div>
      ) : (
        <img key={src} className="w-full rounded-lg" onError={() => setErr(true)} src={src} alt={label} />
      )}
    </MediaBox>
  )
}

function CorrectiveActions({ incidentId, canEdit }) {
  const [actions, setActions]   = useState([])
  const [newDesc, setNewDesc]   = useState('')
  const [newTo,   setNewTo]     = useState('')
  const [newDue,  setNewDue]    = useState('')
  const [adding,  setAdding]    = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    try {
      const d = await apiJSON(`/incidents/${incidentId}/actions`)
      setActions(d.actions || [])
    } catch {}
  }

  useEffect(() => { load() }, [incidentId])

  async function addAction() {
    if (!newDesc.trim()) return
    setAdding(true)
    try {
      await apiJSON(`/incidents/${incidentId}/actions`, {
        method: 'POST',
        body: { description: newDesc, assigned_to: newTo || null, due_date: newDue || null }
      })
      setNewDesc(''); setNewTo(''); setNewDue('')
      setShowForm(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setAdding(false) }
  }

  async function toggleResolved(action) {
    await apiJSON(`/actions/${action.id}`, {
      method: 'PATCH',
      body: { resolved: action.resolved ? 0 : 1 }
    })
    load()
  }

  async function removeAction(id) {
    await apiJSON(`/actions/${id}`, { method: 'DELETE' })
    load()
  }

  const open   = actions.filter(a => !a.resolved)
  const closed = actions.filter(a => a.resolved)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
          Działania korygujące
          {open.length > 0 && (
            <span className="ml-2 bg-orange-900/50 text-orange-300 text-xs px-1.5 py-0.5 rounded-full">
              {open.length} otwartych
            </span>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(v => !v)}
            className="text-xs text-blue-400 hover:text-blue-300">
            {showForm ? 'Anuluj' : '+ Dodaj'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-lg p-3 space-y-2">
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Opis działania korygującego..."
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
          <div className="flex gap-2">
            <input value={newTo} onChange={e => setNewTo(e.target.value)}
              placeholder="Przydziel do (opcjonalne)"
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white" />
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white" />
          </div>
          <button onClick={addAction} disabled={adding || !newDesc.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-1.5 rounded-lg">
            Dodaj działanie
          </button>
        </div>
      )}

      {actions.length === 0 ? (
        <div className="text-gray-600 text-xs py-2">Brak działań korygujących</div>
      ) : (
        <div className="space-y-2">
          {[...open, ...closed].map(action => (
            <div key={action.id}
              className={`flex items-start gap-3 rounded-lg p-3 transition-colors
                ${action.resolved ? 'bg-gray-800/40 opacity-60' : 'bg-gray-800'}`}>
              {canEdit ? (
                <button onClick={() => toggleResolved(action)}
                  className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors
                    ${action.resolved ? 'bg-green-600 border-green-600 text-white' : 'border-gray-500 hover:border-green-500'}`}>
                  {action.resolved && <span className="text-[10px]">✓</span>}
                </button>
              ) : (
                <span className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 ${action.resolved ? 'bg-green-600' : 'bg-orange-500'}`} />
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${action.resolved ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                  {action.description}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  {action.assigned_to && <span>👤 {action.assigned_to}</span>}
                  {action.due_date && <span>📅 {action.due_date}</span>}
                  {action.resolved && action.resolved_at && (
                    <span className="text-green-600">✓ {action.resolved_at.slice(0,10)}</span>
                  )}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => removeAction(action.id)}
                  className="text-gray-600 hover:text-red-400 text-sm flex-shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IncidentDetail({ inc, canEdit, onStatusChange, onDelete, onNotesChange }) {
  const [notes, setNotes]   = useState(inc.notes || '')
  const [saving, setSaving] = useState(false)
  const notesTimer          = useRef(null)
  const viols = parseViolations(inc.violation_types)

  useEffect(() => { setNotes(inc.notes || '') }, [inc.id])

  function handleNotes(v) {
    setNotes(v)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await apiFetch(`/incidents/${inc.id}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: v }),
        })
        onNotesChange(inc.id, v)
      } finally { setSaving(false) }
    }, 600)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <h3 className="text-xl font-bold text-white">Incydent #{inc.id}</h3>
        <div className="text-sm text-gray-400">{fmtDate(inc.created_at)}</div>
        <div className="flex gap-2 ml-auto flex-wrap">
          {canEdit && ['new', 'reviewing', 'closed'].map(s => (
            <button key={s} onClick={() => onStatusChange(inc.id, s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                ${inc.status === s ? STATUS_COLORS[s] + ' ring-1 ring-white/30' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {s === 'new' ? 'Nowy' : s === 'reviewing' ? 'W trakcie' : 'Zamknięty'}
            </button>
          ))}
          {canEdit && (
            <button onClick={() => onDelete(inc.id)}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-900 text-red-300 hover:bg-red-800">Usuń</button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex gap-3 flex-wrap text-sm items-center">
        <span className="bg-gray-800 rounded px-3 py-1.5">
          Track ID: <span className="text-white font-mono">{inc.track_id}</span>
        </span>
        {inc.zone_name && (
          <span className="bg-gray-800 rounded px-3 py-1.5">
            Strefa: <span className="text-blue-300">{inc.zone_name}</span>
          </span>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {viols.map(v => (
            <span key={v} className={`px-2 py-1 rounded font-medium ${VIOLATION_COLORS[v] || 'bg-gray-700 text-gray-300'}`}>
              {VIOLATION_LABELS[v] || v}
            </span>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Notatka operatora</span>
          {saving && <span className="text-gray-600">zapisywanie…</span>}
        </div>
        <textarea value={notes} onChange={e => handleNotes(e.target.value)}
          placeholder="Dodaj komentarz do incydentu…" rows={2} readOnly={!canEdit}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                     text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>

      {/* Corrective actions */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <CorrectiveActions incidentId={inc.id} canEdit={canEdit} />
      </div>

      {/* Media */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VideoPlayer  src={`/incidents/${inc.id}/clip`}              label="Klip — surowy feed" />
        <VideoPlayer  src={`/incidents/${inc.id}/clip_annotated`}    label="Klip — z oznaczeniami AI" />
        <SnapshotImg  src={`/incidents/${inc.id}/snapshot`}          label="Zrzut — surowy feed" />
        <SnapshotImg  src={`/incidents/${inc.id}/snapshot_annotated`} label="Zrzut — z oznaczeniami AI" />
      </div>
    </div>
  )
}
