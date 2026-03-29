import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiJSON } from '../api'

const ROLE_LABELS = { admin: 'Administrator', supervisor: 'Supervisor', operator: 'Operator', viewer: 'Viewer' }
const ROLE_COLORS = { admin: 'text-red-400', supervisor: 'text-orange-400', operator: 'text-blue-400', viewer: 'text-gray-400' }

export default function ProfilePage() {
  const { user, login, token } = useAuth()

  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email,    setEmail]    = useState(user?.email || '')
  const [profileMsg, setProfileMsg] = useState('')

  const [curPwd,  setCurPwd]  = useState('')
  const [newPwd,  setNewPwd]  = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const [pwdMsg,  setPwdMsg]  = useState('')

  const [saving, setSaving] = useState(false)

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setProfileMsg('')
    try {
      await apiJSON('/auth/profile', { method: 'PATCH', body: { full_name: fullName, email } })
      // Update stored user
      const fresh = await apiJSON('/auth/me')
      login(token, { ...user, full_name: fresh.full_name, email: fresh.email })
      setProfileMsg('✓ Zapisano')
    } catch (err) {
      setProfileMsg('✗ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwdMsg('')
    if (newPwd !== newPwd2) { setPwdMsg('✗ Nowe hasła nie są identyczne'); return }
    if (newPwd.length < 4) { setPwdMsg('✗ Hasło musi mieć co najmniej 4 znaki'); return }
    setSaving(true)
    try {
      await apiJSON('/auth/change-password', {
        method: 'POST',
        body: { current_password: curPwd, new_password: newPwd }
      })
      setCurPwd(''); setNewPwd(''); setNewPwd2('')
      setPwdMsg('✓ Hasło zmienione')
    } catch (err) {
      setPwdMsg('✗ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-6 max-w-lg">
      <h2 className="text-lg font-bold text-white">Profil użytkownika</h2>

      {/* Avatar + role */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
          {(user?.full_name || user?.username || '?')[0].toUpperCase()}
        </div>
        <div>
          <div className="text-lg font-bold text-white">{user?.full_name || user?.username}</div>
          <div className="text-sm text-gray-400">@{user?.username}</div>
          <div className={`text-sm font-medium mt-1 ${ROLE_COLORS[user?.role]}`}>
            {ROLE_LABELS[user?.role]}
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="text-sm font-semibold text-gray-300 mb-4">Dane osobowe</div>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Imię i nazwisko</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium">
              Zapisz
            </button>
            {profileMsg && (
              <span className={`text-sm ${profileMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {profileMsg}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="text-sm font-semibold text-gray-300 mb-4">Zmień hasło</div>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Aktualne hasło</label>
            <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} required
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Nowe hasło</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Powtórz nowe hasło</label>
            <input type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} required
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
              Zmień hasło
            </button>
            {pwdMsg && (
              <span className={`text-sm ${pwdMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {pwdMsg}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
