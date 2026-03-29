import { useState, useEffect } from 'react'
import { apiJSON } from '../api'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { useAuth, hasRole } from '../contexts/AuthContext'

function ShiftModal({ shift, onClose, onSave }) {
  const [form, setForm] = useState({
    name: shift?.name || '',
    start_hour: shift?.start_hour ?? 6,
    end_hour: shift?.end_hour ?? 14,
    color: shift?.color || '#3b82f6',
  })
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      if (shift) {
        await apiJSON(`/shifts/${shift.id}`, { method: 'PATCH', body: form })
      } else {
        await apiJSON('/shifts', { method: 'POST', body: form })
      }
      onSave()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">{shift ? 'Edytuj zmianę' : 'Nowa zmiana'}</h3>
        {err && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm mb-3">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Nazwa</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              required className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400">Godzina start</label>
              <input type="number" min={0} max={23} value={form.start_hour}
                onChange={e => setForm(f => ({...f, start_hour: parseInt(e.target.value)}))}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Godzina koniec</label>
              <input type="number" min={0} max={23} value={form.end_hour}
                onChange={e => setForm(f => ({...f, end_hour: parseInt(e.target.value)}))}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">Kolor</label>
            <div className="flex gap-2 mt-1 items-center">
              <input type="color" value={form.color} onChange={e => setForm(f => ({...f, color: e.target.value}))}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
              <input value={form.color} onChange={e => setForm(f => ({...f, color: e.target.value}))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
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

function formatHour(h) {
  return `${String(h).padStart(2,'0')}:00`
}

export default function ShiftsPage() {
  const { user } = useAuth()
  const isAdmin  = hasRole(user, 'admin')
  const [shifts, setShifts] = useState([])
  const [stats,  setStats]  = useState([])
  const [statDays, setDays] = useState(30)
  const [modal,  setModal]  = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [sd, st] = await Promise.all([
        apiJSON('/shifts'),
        apiJSON(`/shifts/stats?days=${statDays}`),
      ])
      setShifts(sd.shifts || [])
      setStats(st.stats || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statDays])

  async function deleteShift(id) {
    if (!confirm('Usunąć zmianę?')) return
    try { await apiJSON(`/shifts/${id}`, { method: 'DELETE' }); load() } catch (e) { alert(e.message) }
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Zmiany</h2>
        {isAdmin && (
          <button onClick={() => setModal('new')}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg font-medium">
            + Nowa zmiana
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Ładowanie…</div>
      ) : (
        <>
          {/* Shifts list */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shifts.map(s => (
              <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                  <span className="text-white font-semibold">{s.name}</span>
                  {!s.active && <span className="text-xs text-gray-500 ml-auto">(nieaktywna)</span>}
                </div>
                <div className="text-sm text-gray-400 mb-4">
                  {formatHour(s.start_hour)} — {formatHour(s.end_hour)}
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => setModal(s)}
                      className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg py-1.5">Edytuj</button>
                    <button onClick={() => deleteShift(s.id)}
                      className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-red-400 rounded-lg py-1.5">Usuń</button>
                  </div>
                )}
              </div>
            ))}
            {shifts.length === 0 && (
              <div className="col-span-3 text-gray-500 text-center py-8">Brak zdefiniowanych zmian</div>
            )}
          </div>

          {/* Stats chart */}
          {stats.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-gray-300">Incydenty per zmiana</div>
                <div className="flex gap-1 text-xs">
                  {[7,30,90].map(d => (
                    <button key={d} onClick={() => setDays(d)}
                      className={`px-2 py-0.5 rounded transition-colors
                        ${statDays === d ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Bar dataKey="count" name="Incydenty" radius={[4,4,0,0]}>
                    {stats.map((s, i) => (
                      <Cell key={i} fill={s.color || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {modal && (
        <ShiftModal
          shift={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
