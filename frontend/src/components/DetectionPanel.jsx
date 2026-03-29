import { useEffect, useState, useRef, useCallback } from 'react'
import { apiFetch } from '../api'

const PRESETS_KEY = 'ppe_detection_presets'
const VOICE_KEY   = 'ppe_voice_settings'

function loadVoice() {
  try { return JSON.parse(localStorage.getItem(VOICE_KEY) || '{}') } catch { return {} }
}
function saveVoice(v) { localStorage.setItem(VOICE_KEY, JSON.stringify(v)) }
function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') } catch { return [] }
}
function savePresetsToStorage(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

const GROUPS = [
  {
    label: 'Naruszenia PPE',
    color: 'text-red-400',
    classes: ['NO-Hardhat', 'NO-Mask', 'NO-Safety Vest'],
    note: { 'NO-Mask': '⚠ Model słabo radzi z maskami — wymaga dobrego oświetlenia twarzy' },
  },
  {
    label: 'PPE Założone',
    color: 'text-green-400',
    classes: ['Hardhat', 'Mask', 'Safety Vest'],
  },
  {
    label: 'Ludzie i Pojazdy',
    color: 'text-blue-400',
    classes: ['Person', 'Safety Cone', 'machinery', 'vehicle'],
  },
]


function formatHMS(totalSecs) {
  const s = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function nowLabel() {
  const d = new Date()
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DetectionPanel() {
  const [allClasses, setAllClasses]       = useState([])
  const [enabled, setEnabled]             = useState(new Set())
  const [confidence, setConfidence]       = useState(0.45)
  const [violationConf, setViolationConf] = useState(0.28)
  const [minArea, setMinArea]             = useState(1000)
  const [violationThreshold, setViolThresh] = useState(3.0)
  const [cooldown, setCooldown]           = useState(60)
  const [muted, setMuted]                 = useState(false)
  const [muteRemaining, setMuteRemaining] = useState(0)
  const [saving, setSaving]               = useState(false)
  const [calLog, setCalLog]               = useState([])
  const [presets, setPresets]             = useState(loadPresets)
  const [newPresetName, setNewPresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const debounceRef = useRef(null)
  const logRef = useRef(null)

  // Voice-down
  const vs = loadVoice()
  const [voiceEnabled,  setVoiceEnabled]  = useState(vs.enabled  ?? false)
  const [voiceTemplate, setVoiceTemplate] = useState(vs.template ?? 'Uwaga! {violation} w strefie {zone}')
  const [voiceRate,     setVoiceRate]     = useState(vs.rate     ?? 1.0)
  const [showVoice,     setShowVoice]     = useState(false)
  const lastVoiceIdRef = useRef(vs.lastId ?? 0)

  function addLog(msg) {
    setCalLog(prev => {
      const next = [...prev, { time: nowLabel(), msg }]
      return next.slice(-50) // keep last 50 entries
    })
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 30)
  }

  useEffect(() => {
    apiFetch('/detection/classes').then(r => r.json()).then(d => {
      setAllClasses(d.all)
      setEnabled(new Set(d.enabled))
    }).catch(() => {})

    apiFetch('/detection/settings').then(r => r.json()).then(d => {
      setConfidence(d.confidence)
      setViolationConf(d.violation_confidence ?? 0.28)
      setMinArea(d.min_box_area)
      setViolThresh(d.violation_threshold ?? 3.0)
      setCooldown(d.cooldown_seconds ?? 60)
      setMuted(d.muted ?? false)
      setMuteRemaining(d.mute_remaining ?? 0)
    }).catch(() => {})
  }, [])

  // Countdown for mute timer
  useEffect(() => {
    if (!muted) return
    const id = setInterval(() => {
      setMuteRemaining(r => {
        if (r <= 1) {
          setMuted(false)
          clearInterval(id)
          addLog('Kalibracja zakończona — alerty przywrócone')
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [muted])

  // Voice-down polling
  useEffect(() => {
    if (!voiceEnabled) return
    const id = setInterval(async () => {
      try {
        const r = await apiFetch('/incidents?limit=1&status=new&sort=desc')
        const d = await r.json()
        const items = d.incidents || d
        if (!items.length) return
        const latest = items[0]
        if (latest.id > lastVoiceIdRef.current) {
          lastVoiceIdRef.current = latest.id
          saveVoice({ enabled: voiceEnabled, template: voiceTemplate, rate: voiceRate, lastId: latest.id })
          const violations = (latest.violations || [latest.violation_type] || []).join(', ') || 'naruszenie'
          const zone = latest.zone_name || ''
          const msg = voiceTemplate
            .replace('{violation}', violations)
            .replace('{zone}', zone)
          if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(msg)
            u.lang  = 'pl-PL'
            u.rate  = voiceRate
            u.volume = 1
            window.speechSynthesis.speak(u)
          }
        }
      } catch { /* silent */ }
    }, 5000)
    return () => clearInterval(id)
  }, [voiceEnabled, voiceTemplate, voiceRate])

  async function toggle(cls) {
    const next = new Set(enabled)
    next.has(cls) ? next.delete(cls) : next.add(cls)
    setEnabled(next)
    await saveClasses([...next])
  }

  async function saveClasses(list) {
    setSaving(true)
    try {
      await apiFetch('/detection/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: list }),
      })
    } finally { setSaving(false) }
  }

  function selectGroup(classes, value) {
    const next = new Set(enabled)
    classes.forEach(c => (value ? next.add(c) : next.delete(c)))
    setEnabled(next)
    saveClasses([...next])
  }

  function selectAll() { const n = new Set(allClasses); setEnabled(n); saveClasses([...n]) }
  function clearAll()  { setEnabled(new Set()); saveClasses([]) }

  function saveSettings(conf, vconf, area, thresh, cool) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/detection/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confidence: conf,
          violation_confidence: vconf,
          min_box_area: area,
          violation_threshold: thresh,
          cooldown_seconds: cool,
        }),
      })
    }, 300)
  }

  function handleConfidence(v) {
    setConfidence(v)
    saveSettings(v, Math.min(violationConf, v), minArea, violationThreshold, cooldown)
  }
  function handleViolationConf(v) {
    setViolationConf(v)
    saveSettings(confidence, v, minArea, violationThreshold, cooldown)
  }
  function handleMinArea(v) {
    setMinArea(v)
    saveSettings(confidence, violationConf, v, violationThreshold, cooldown)
  }
  function handleViolThresh(v) {
    setViolThresh(v)
    saveSettings(confidence, violationConf, minArea, v, cooldown)
  }
  function handleCooldown(v) {
    setCooldown(v)
    saveSettings(confidence, violationConf, minArea, violationThreshold, v)
  }

  async function applyPreset(preset) {
    const s = preset.settings
    setConfidence(s.confidence)
    setViolationConf(s.violation_confidence)
    setMinArea(s.min_box_area)
    setViolThresh(s.violation_threshold)
    setCooldown(s.cooldown_seconds)
    await apiFetch('/detection/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (preset.classes) {
      setEnabled(new Set(preset.classes))
      await saveClasses(preset.classes)
    }
    addLog(`Preset zastosowany: ${preset.label}`)
  }

  function savePreset() {
    const name = newPresetName.trim()
    if (!name) return
    const preset = {
      id: Date.now(),
      label: name,
      settings: { confidence, violation_confidence: violationConf, min_box_area: minArea, violation_threshold: violationThreshold, cooldown_seconds: cooldown },
      classes: [...enabled],
    }
    const next = [...presets, preset]
    setPresets(next)
    savePresetsToStorage(next)
    setNewPresetName('')
    setShowSavePreset(false)
    addLog(`Preset zapisany: "${name}"`)
  }

  function deletePreset(id) {
    const removed = presets.find(p => p.id === id)
    const next = presets.filter(p => p.id !== id)
    setPresets(next)
    savePresetsToStorage(next)
    if (removed) addLog(`Preset usunięty: "${removed.label}"`)
  }

  async function handleMute(seconds) {
    await apiFetch('/detection/mute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    })
    setMuted(true)
    setMuteRemaining(seconds)
    addLog(`Kalibracja aktywowana — ${formatHMS(seconds)} (${seconds}s)`)
  }

  async function handleUnmute() {
    await apiFetch('/detection/unmute', { method: 'POST' })
    setMuted(false)
    setMuteRemaining(0)
    addLog('Kalibracja anulowana ręcznie')
  }

  return (
    <div className="rounded-xl p-5 space-y-5 border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
          Detekcja
          {saving && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>saving…</span>}
        </h2>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-blue-400 hover:text-blue-300 cursor-pointer transition-colors">Wszystko</button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <button onClick={clearAll} className="cursor-pointer transition-colors" style={{ color: 'var(--muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>Nic</button>
        </div>
      </div>

      {/* Calibration / Mute */}
      <div className="space-y-2">
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Tryb kalibracji</div>
        {muted ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'rgba(8,145,178,0.15)', border: '1px solid rgba(8,145,178,0.4)', color: '#67e8f9' }}>
              <svg className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.531L7.5 18.375H4.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75h3Z"/>
              </svg>
              Wyciszono — {formatHMS(muteRemaining)} pozostało
            </div>
            <button onClick={handleUnmute}
              className="text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              Odcisz
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {[5, 10, 30].map(min => (
              <button key={min} onClick={() => handleMute(min * 60)}
                className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#67e8f9'; e.currentTarget.style.borderColor = 'rgba(8,145,178,0.5)'; e.currentTarget.style.backgroundColor = 'rgba(8,145,178,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--surface2)' }}>
                {min} min
              </button>
            ))}
          </div>
        )}

        {/* Calibration log */}
        {calLog.length > 0 && (
          <div ref={logRef}
            className="rounded-lg px-3 py-2 space-y-0.5 max-h-24 overflow-y-auto text-xs font-mono"
            style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {calLog.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="flex-shrink-0" style={{ color: 'var(--muted)' }}>{entry.time}</span>
                <span style={{ color: 'var(--text)' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confidence slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Pewność detekcji</span>
          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{Math.round(confidence * 100)}%</span>
        </div>
        <input type="range" min={10} max={90} step={5}
          value={Math.round(confidence * 100)}
          onChange={e => handleConfidence(Number(e.target.value) / 100)}
          className="w-full h-1.5 accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs" style={{ color: 'var(--border)' }}>
          <span>10% — czulszy</span>
          <span>90% — pewniejszy</span>
        </div>
        {confidence < 0.4 && (
          <p className="text-xs text-yellow-500 bg-yellow-900/20 rounded px-2 py-1">
            Niski próg — włosy/odbicia mogą być wykrywane jako kask
          </p>
        )}
      </div>

      {/* Violation sensitivity */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Czułość naruszeń (daleki zasięg)</span>
          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{Math.round(violationConf * 100)}%</span>
        </div>
        <input type="range" min={5} max={55} step={5}
          value={Math.round(violationConf * 100)}
          onChange={e => handleViolationConf(Number(e.target.value) / 100)}
          className="w-full h-1.5 accent-orange-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs" style={{ color: 'var(--border)' }}>
          <span>5% — bardzo czuły</span>
          <span>55% — tylko pewne</span>
        </div>
      </div>

      {/* Min box size */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Min. rozmiar detekcji (px²)</span>
          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{minArea.toLocaleString()}</span>
        </div>
        <input type="range" min={0} max={10000} step={500}
          value={minArea}
          onChange={e => handleMinArea(Number(e.target.value))}
          className="w-full h-1.5 accent-blue-500 cursor-pointer"
        />
        <p className="text-xs" style={{ color: 'var(--border)' }}>
          Odrzuca bardzo małe boxy — zmniejsz dla detekcji z dużej odległości
        </p>
      </div>

      {/* Violation timer */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Timer naruszenia (próg alertu)</span>
          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{violationThreshold.toFixed(1)}s</span>
        </div>
        <input type="range" min={0.5} max={15} step={0.5}
          value={violationThreshold}
          onChange={e => handleViolThresh(Number(e.target.value))}
          className="w-full h-1.5 accent-yellow-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs" style={{ color: 'var(--border)' }}>
          <span>0.5s — natychmiastowe</span>
          <span>15s — tylko długotrwałe</span>
        </div>
      </div>

      {/* Cooldown */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Cooldown (ta sama osoba)</span>
          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{formatHMS(cooldown)}</span>
        </div>
        <input type="range" min={0} max={600} step={15}
          value={cooldown}
          onChange={e => handleCooldown(Number(e.target.value))}
          className="w-full h-1.5 accent-purple-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs" style={{ color: 'var(--border)' }}>
          <span>0s — każde naruszenie</span>
          <span>10:00 — max 1 na 10 min</span>
        </div>
      </div>

      {/* Presets — below sliders */}
      <div className="space-y-2 pt-1">
        <div className="space-y-2">
          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Moje presety</div>
          <button onClick={() => setShowSavePreset(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium w-full justify-center"
            style={{ backgroundColor: showSavePreset ? 'var(--accent)' : 'var(--surface2)', color: showSavePreset ? 'white' : 'var(--muted)', border: '1px solid var(--border)' }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Zapisz obecne
          </button>
        </div>

        {/* Save preset form */}
        {showSavePreset && (
          <div className="flex gap-2">
            <input
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setShowSavePreset(false) }}
              placeholder="Nazwa presetu…"
              autoFocus
              className="flex-1 rounded-md px-3 py-1.5 text-sm focus:outline-none transition-colors"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <button onClick={savePreset}
              disabled={!newPresetName.trim()}
              className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer disabled:opacity-40 text-white transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--accent-hover)' }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
              Zapisz
            </button>
          </div>
        )}

        {/* Saved presets list */}
        {presets.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Brak zapisanych presetów. Skonfiguruj ustawienia i kliknij „Zapisz obecne".</p>
        ) : (
          <div className="space-y-1">
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 group transition-colors"
                style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <button onClick={() => applyPreset(p)}
                  className="flex-1 text-left text-sm cursor-pointer transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}>
                  {p.label}
                </button>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>
                  {p.classes?.length ?? '∞'} klas
                </span>
                <button onClick={() => deletePreset(p.id)}
                  className="opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity p-0.5 rounded"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                  title="Usuń preset">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--border)' }} />

      {/* Class groups */}
      {GROUPS.map(g => (
        <div key={g.label}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold uppercase tracking-wide ${g.color}`}>
              {g.label}
            </span>
            <div className="flex gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <button onClick={() => selectGroup(g.classes, true)} className="hover:text-blue-400 cursor-pointer transition-colors">all</button>
              <span>/</span>
              <button onClick={() => selectGroup(g.classes, false)} className="cursor-pointer transition-colors"
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>none</button>
            </div>
          </div>
          <div className="space-y-0.5">
            {g.classes.map(cls => (
              <div key={cls}>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 transition-colors"
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <input type="checkbox" checked={enabled.has(cls)}
                    onChange={() => toggle(cls)}
                    className="w-4 h-4 rounded accent-blue-500 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{cls}</span>
                </label>
                {g.note?.[cls] && enabled.has(cls) && (
                  <p className="text-xs text-yellow-500/80 pl-10 pb-1">{g.note[cls]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {enabled.size} / {allClasses.length} klas aktywnych
      </p>

      {/* Advanced / Voice-down accordion */}
      <button
        onClick={() => setShowVoice(v => !v)}
        className="w-full flex items-center justify-between py-1.5 cursor-pointer transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Zaawansowane
          {voiceEnabled && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: 'rgba(249,115,22,0.2)', color: 'var(--accent)', border: '1px solid rgba(249,115,22,0.3)' }}>
              🔊 voice ON
            </span>
          )}
        </div>
        <svg className={`w-3.5 h-3.5 transition-transform ${showVoice ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {showVoice && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Komunikat głosowy (Voice-down)
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={voiceEnabled}
                  onChange={e => {
                    setVoiceEnabled(e.target.checked)
                    saveVoice({ enabled: e.target.checked, template: voiceTemplate, rate: voiceRate, lastId: lastVoiceIdRef.current })
                  }} />
                <div className="w-9 h-5 rounded-full transition-colors"
                  style={{ backgroundColor: voiceEnabled ? 'var(--accent)' : 'var(--border)', border: '1px solid var(--border)' }} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${voiceEnabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs" style={{ color: voiceEnabled ? 'var(--accent)' : 'var(--muted)' }}>
                {voiceEnabled ? 'włączony' : 'wyłączony'}
              </span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--muted)' }}>
              Szablon komunikatu <span className="font-mono">{'{violation}'}</span> = typ,&nbsp;
              <span className="font-mono">{'{zone}'}</span> = strefa
            </label>
            <input
              value={voiceTemplate}
              onChange={e => {
                setVoiceTemplate(e.target.value)
                saveVoice({ enabled: voiceEnabled, template: e.target.value, rate: voiceRate, lastId: lastVoiceIdRef.current })
              }}
              className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
              <span>Szybkość mowy</span>
              <span className="font-mono" style={{ color: 'var(--text)' }}>{voiceRate.toFixed(1)}×</span>
            </div>
            <input type="range" min={0.5} max={2} step={0.1}
              value={voiceRate}
              onChange={e => {
                const v = Number(e.target.value)
                setVoiceRate(v)
                saveVoice({ enabled: voiceEnabled, template: voiceTemplate, rate: v, lastId: lastVoiceIdRef.current })
              }}
              className="w-full h-1.5 cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-xs" style={{ color: 'var(--border)' }}>
              <span>0.5× wolniej</span><span>2.0× szybciej</span>
            </div>
          </div>

          <button
            onClick={() => {
              if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(
                  voiceTemplate.replace('{violation}', 'brak kasku').replace('{zone}', 'Strefa A')
                )
                u.lang = 'pl-PL'; u.rate = voiceRate; u.volume = 1
                window.speechSynthesis.speak(u)
              }
            }}
            className="w-full py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            🔊 Test komunikatu
          </button>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Sprawdza nowe incydenty co 5s i odtwarza komunikat przez głośniki przeglądarki.
          </p>
        </div>
      )}
    </div>
  )
}
