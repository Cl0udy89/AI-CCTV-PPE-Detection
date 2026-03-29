import { useState, useEffect } from 'react'
import { apiJSON } from '../api'

const ROLES = ['admin', 'supervisor', 'operator', 'viewer']
const ROLE_COLORS = {
  admin: 'text-red-400', supervisor: 'text-orange-400',
  operator: 'text-blue-400', viewer: 'text-gray-400'
}
const ROLE_LABELS = {
  admin: 'Admin', supervisor: 'Supervisor', operator: 'Operator', viewer: 'Viewer'
}

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'operator',
    password: '',
  })
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      if (user) {
        const updates = { role: form.role, full_name: form.full_name, email: form.email }
        if (form.password) updates.password = form.password
        await apiJSON(`/users/${user.id}`, { method: 'PATCH', body: updates })
      } else {
        if (!form.password) { setErr('Hasło jest wymagane'); return }
        await apiJSON('/users', { method: 'POST', body: form })
      }
      onSave()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">
          {user ? 'Edytuj użytkownika' : 'Dodaj użytkownika'}
        </h3>
        {err && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm mb-3">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          {!user && (
            <div>
              <label className="text-xs text-gray-400">Nazwa użytkownika</label>
              <input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))}
                required className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400">Imię i nazwisko</label>
            <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Rola</label>
            <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">{user ? 'Nowe hasło (opcjonalne)' : 'Hasło'}</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
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

export default function AdminPage() {
  const [tab, setTab]       = useState('users')
  const [users, setUsers]   = useState([])
  const [log, setLog]       = useState([])
  const [modal, setModal]   = useState(null)   // null | 'new' | user_obj
  const [loading, setLoading] = useState(false)

  async function loadUsers() {
    try { const d = await apiJSON('/users'); setUsers(d.users) } catch {}
  }
  async function loadLog() {
    try { const d = await apiJSON('/users/audit-log'); setLog(d.log) } catch {}
  }

  useEffect(() => {
    loadUsers()
    loadLog()
  }, [])

  async function deleteUser(id) {
    if (!confirm('Usunąć użytkownika?')) return
    try { await apiJSON(`/users/${id}`, { method: 'DELETE' }); loadUsers() } catch (e) { alert(e.message) }
  }

  async function toggleActive(user) {
    try {
      await apiJSON(`/users/${user.id}`, { method: 'PATCH', body: { active: user.active ? 0 : 1 } })
      loadUsers()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Panel Administratora</h2>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {[['users','Użytkownicy'],['log','Audit Log']].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>{lbl}</button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setModal('new')}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg font-medium">
              + Dodaj użytkownika
            </button>
          </div>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['ID','Użytkownik','Imię i Nazwisko','Email','Rola','Status','Akcje'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-500">{u.id}</td>
                    <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-gray-300">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{u.email || '—'}</td>
                    <td className={`px-4 py-3 font-medium ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {u.active ? 'Aktywny' : 'Nieaktywny'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(u)}
                          className="text-xs text-blue-400 hover:text-blue-300">Edytuj</button>
                        <button onClick={() => toggleActive(u)}
                          className="text-xs text-yellow-400 hover:text-yellow-300">
                          {u.active ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                        <button onClick={() => deleteUser(u.id)}
                          className="text-xs text-red-400 hover:text-red-300">Usuń</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Brak użytkowników</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit log tab */}
      {tab === 'log' && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-300">Ostatnie zdarzenia ({log.length})</span>
            <button onClick={loadLog}
              className="text-xs text-blue-400 hover:text-blue-300">Odśwież</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Czas','Użytkownik','Akcja','Szczegóły'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map(entry => (
                <tr key={entry.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{entry.ts?.replace('T',' ').slice(0,19)}</td>
                  <td className="px-4 py-2.5 text-white">{entry.username}</td>
                  <td className="px-4 py-2.5 text-blue-300">{entry.action}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{entry.detail}</td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Brak wpisów</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <UserModal
          user={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); loadUsers(); loadLog() }}
        />
      )}
    </div>
  )
}
