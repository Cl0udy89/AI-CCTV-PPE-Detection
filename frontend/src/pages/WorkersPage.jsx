import { useState, useEffect } from 'react'
import { apiJSON } from '../api'

function ScoreBadge({ score }) {
  const color = score >= 80 ? 'bg-green-900/40 text-green-400 border-green-700'
              : score >= 50 ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700'
              : 'bg-red-900/40 text-red-400 border-red-700'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score}%
    </span>
  )
}

function WorkerModal({ worker, onClose, onSave }) {
  const [form, setForm] = useState({
    name: worker?.name || '',
    badge_id: worker?.badge_id || '',
    department: worker?.department || '',
  })
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      if (worker) {
        await apiJSON(`/workers/${worker.id}`, { method: 'PATCH', body: form })
      } else {
        await apiJSON('/workers', { method: 'POST', body: form })
      }
      onSave()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">
          {worker ? 'Edytuj pracownika' : 'Dodaj pracownika'}
        </h3>
        {err && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm mb-3">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Imię i nazwisko</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              required className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Nr identyfikacyjny (badge)</label>
            <input value={form.badge_id} onChange={e => setForm(f => ({...f, badge_id: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="np. EMP-001" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Dział</label>
            <input value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="np. Hala A" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-2 text-sm">Anuluj</button>
            <button type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium">Zapisz</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function WorkerDetail({ worker, onClose }) {
  const [incidents, setIncidents] = useState([])
  const [score, setScore]         = useState(100)
  const [linkTrackId, setLink]    = useState('')
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    apiJSON(`/workers/${worker.id}/incidents`).then(d => {
      setIncidents(d.incidents || [])
      setScore(d.compliance_score ?? 100)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [worker.id])

  async function linkTrack() {
    if (!linkTrackId) return
    try {
      await apiJSON(`/workers/${worker.id}/link`, { method: 'POST', body: { track_id: parseInt(linkTrackId) } })
      setLink('')
      alert('Powiązano!')
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{worker.name}</h3>
            <p className="text-sm text-gray-400">{worker.department || '—'}  {worker.badge_id ? `· ${worker.badge_id}` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-400">Compliance (30 dni)</div>
              <div className="text-2xl font-bold text-white"><ScoreBadge score={score} /></div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl ml-2">✕</button>
          </div>
        </div>

        {/* Link track */}
        <div className="flex gap-2 mb-4">
          <input value={linkTrackId} onChange={e => setLink(e.target.value)} type="number"
            placeholder="Track ID z kamery..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <button onClick={linkTrack}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg">Powiąż Track</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-gray-500 text-center py-8">Ładowanie…</div>
          ) : incidents.length === 0 ? (
            <div className="text-gray-500 text-center py-8">Brak incydentów</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['#','Data','Naruszenie','Strefa','Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id} className="border-b border-gray-800/50">
                    <td className="px-3 py-2 text-gray-500">{inc.id}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{inc.created_at?.slice(0,16).replace('T',' ')}</td>
                    <td className="px-3 py-2 text-red-300 text-xs">{inc.violation_types}</td>
                    <td className="px-3 py-2 text-gray-400">{inc.zone_name || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={inc.status === 'closed' ? 'text-green-400' : inc.status === 'reviewing' ? 'text-yellow-400' : 'text-red-400'}>
                        {inc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)
  const [detail, setDetail]   = useState(null)
  const [search, setSearch]   = useState('')

  async function load() {
    setLoading(true)
    try { const d = await apiJSON('/workers'); setWorkers(d.workers || []) } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function deleteWorker(id) {
    if (!confirm('Usunąć pracownika?')) return
    try { await apiJSON(`/workers/${id}`, { method: 'DELETE' }); load() } catch (e) { alert(e.message) }
  }

  const filtered = workers.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.department || '').toLowerCase().includes(search.toLowerCase()) ||
    (w.badge_id || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Pracownicy</h2>
        <button onClick={() => setModal('new')}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg font-medium">
          + Dodaj pracownika
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Szukaj po nazwisku, dziale lub numerze..."
        className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm w-full max-w-md" />

      {loading ? (
        <div className="text-gray-500 text-center py-12">Ładowanie…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(w => (
            <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-white font-semibold">{w.name}</div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {w.department || 'Brak działu'}
                    {w.badge_id && <span className="ml-2 text-gray-500">#{w.badge_id}</span>}
                  </div>
                </div>
                <ScoreBadge score={w.compliance_score ?? 100} />
              </div>
              <div className="text-xs text-gray-500 mb-4">
                Powiązane ślady: {w.linked_tracks || 0}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDetail(w)}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-1.5">
                  Szczegóły
                </button>
                <button onClick={() => setModal(w)}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg py-1.5">
                  Edytuj
                </button>
                <button onClick={() => deleteWorker(w.id)}
                  className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-red-400 rounded-lg py-1.5">
                  Usuń
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-gray-500 text-center py-12">
              {workers.length === 0 ? 'Brak pracowników. Dodaj pierwszego!' : 'Nie znaleziono pracowników.'}
            </div>
          )}
        </div>
      )}

      {modal && (
        <WorkerModal
          worker={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}
      {detail && <WorkerDetail worker={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
