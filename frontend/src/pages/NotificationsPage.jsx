import { useState, useEffect } from 'react'
import { apiJSON } from '../api'

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-700'}`} />
        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

export default function NotificationsPage() {
  const [cfg, setCfg]       = useState(null)
  const [dirty, setDirty]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [testRes, setTestRes] = useState({})
  const [err, setErr]       = useState('')

  async function load() {
    try {
      const d = await apiJSON('/notifications')
      setCfg({ ...d.config, smtp_password: '' })
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => { load() }, [])

  function update(key, val) {
    setCfg(c => ({ ...c, [key]: val }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setErr('')
    try {
      const body = { ...cfg }
      if (!body.smtp_password) delete body.smtp_password  // don't overwrite with blank
      await apiJSON('/notifications', { method: 'PATCH', body })
      setDirty(false)
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  async function testEmail() {
    setTestRes(r => ({ ...r, email: 'Wysyłanie…' }))
    try {
      await save()
      const d = await apiJSON('/notifications/test-email', { method: 'POST' })
      setTestRes(r => ({ ...r, email: d.result === 'ok' ? '✓ Wysłano' : d.result }))
    } catch (e) { setTestRes(r => ({ ...r, email: '✗ ' + e.message })) }
  }

  async function testSlack() {
    setTestRes(r => ({ ...r, slack: 'Wysyłanie…' }))
    try {
      await save()
      const d = await apiJSON('/notifications/test-slack', { method: 'POST' })
      setTestRes(r => ({ ...r, slack: d.result === 'ok' ? '✓ Wysłano' : d.result }))
    } catch (e) { setTestRes(r => ({ ...r, slack: '✗ ' + e.message })) }
  }

  async function testTeams() {
    setTestRes(r => ({ ...r, teams: 'Wysyłanie…' }))
    try {
      await save()
      const d = await apiJSON('/notifications/test-teams', { method: 'POST' })
      setTestRes(r => ({ ...r, teams: (d.result === 'ok' || d.result === '1') ? '✓ Wysłano' : d.result }))
    } catch (e) { setTestRes(r => ({ ...r, teams: '✗ ' + e.message })) }
  }

  if (!cfg) return <div className="text-gray-500 text-center py-12">Ładowanie…</div>

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Powiadomienia</h2>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium">
            {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
        )}
      </div>

      {err && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">{err}</div>
      )}

      {/* General */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-gray-300">Ogólne</div>
        <Toggle checked={cfg.notify_on_new_incident}
          onChange={v => update('notify_on_new_incident', v)}
          label="Powiadamiaj przy nowym incydencie" />
        <Toggle checked={cfg.daily_digest_enabled}
          onChange={v => update('daily_digest_enabled', v)}
          label="Dzienny digest (podsumowanie)" />
        {cfg.daily_digest_enabled && (
          <div className="ml-12">
            <label className="text-xs text-gray-400">Godzina wysyłki digest</label>
            <input type="number" min={0} max={23} value={cfg.daily_digest_hour}
              onChange={e => update('daily_digest_hour', parseInt(e.target.value))}
              className="w-20 ml-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm" />
          </div>
        )}
      </div>

      {/* Email */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-300">Email (SMTP)</div>
          <Toggle checked={cfg.email_enabled} onChange={v => update('email_enabled', v)} label="" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">Serwer SMTP</label>
            <input value={cfg.smtp_host} onChange={e => update('smtp_host', e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Port</label>
            <input type="number" value={cfg.smtp_port} onChange={e => update('smtp_port', parseInt(e.target.value))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Użytkownik</label>
            <input value={cfg.smtp_user} onChange={e => update('smtp_user', e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Hasło</label>
            <input type="password" value={cfg.smtp_password} onChange={e => update('smtp_password', e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="(pozostaw puste aby nie zmieniać)" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Nadawca (From)</label>
            <input value={cfg.smtp_from} onChange={e => update('smtp_from', e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">Odbiorcy (jeden per linia)</label>
          <textarea
            value={(cfg.email_recipients || []).join('\n')}
            onChange={e => update('email_recipients', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
            rows={3}
            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none"
            placeholder="jan@firma.pl&#10;nadzor@firma.pl" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testEmail}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">
            Wyślij test
          </button>
          {testRes.email && (
            <span className={`text-sm ${testRes.email.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {testRes.email}
            </span>
          )}
        </div>
      </div>

      {/* Slack */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-300">Slack Webhook</div>
          <Toggle checked={cfg.slack_enabled} onChange={v => update('slack_enabled', v)} label="" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Webhook URL</label>
          <input value={cfg.slack_webhook_url} onChange={e => update('slack_webhook_url', e.target.value)}
            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="https://hooks.slack.com/services/..." />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testSlack}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">
            Wyślij test
          </button>
          {testRes.slack && (
            <span className={`text-sm ${testRes.slack.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {testRes.slack}
            </span>
          )}
        </div>
      </div>

      {/* MS Teams */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-300">MS Teams Webhook</div>
          <Toggle checked={cfg.teams_enabled || false} onChange={v => update('teams_enabled', v)} label="" />
        </div>
        <div className="text-xs text-gray-500">
          W Teams: Kanał → ··· → Zarządzaj kanałem → Łączniki → Przychodzący element webhook
        </div>
        <div>
          <label className="text-xs text-gray-400">Webhook URL</label>
          <input value={cfg.teams_webhook_url || ''} onChange={e => update('teams_webhook_url', e.target.value)}
            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="https://outlook.office.com/webhook/..." />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testTeams}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">
            Wyślij test
          </button>
          {testRes.teams && (
            <span className={`text-sm ${testRes.teams.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {testRes.teams}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
