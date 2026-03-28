import { useEffect, useState, useRef } from 'react'

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

export default function DetectionPanel() {
  const [allClasses, setAllClasses] = useState([])
  const [enabled, setEnabled]       = useState(new Set())
  const [confidence, setConfidence]         = useState(0.45)
  const [violationConf, setViolationConf]   = useState(0.28)
  const [minArea, setMinArea]               = useState(1000)
  const [saving, setSaving]         = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    fetch('/detection/classes').then(r => r.json()).then(d => {
      setAllClasses(d.all)
      setEnabled(new Set(d.enabled))
    }).catch(() => {})

    fetch('/detection/settings').then(r => r.json()).then(d => {
      setConfidence(d.confidence)
      setViolationConf(d.violation_confidence ?? 0.28)
      setMinArea(d.min_box_area)
    }).catch(() => {})
  }, [])

  async function toggle(cls) {
    const next = new Set(enabled)
    next.has(cls) ? next.delete(cls) : next.add(cls)
    setEnabled(next)
    await saveClasses([...next])
  }

  async function saveClasses(list) {
    setSaving(true)
    try {
      await fetch('/detection/classes', {
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

  function selectAll()  { const n = new Set(allClasses); setEnabled(n); saveClasses([...n]) }
  function clearAll()   { setEnabled(new Set()); saveClasses([]) }

  function saveSettings(conf, vconf, area) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/detection/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confidence: conf, violation_confidence: vconf, min_box_area: area }),
      })
    }, 300)
  }

  function handleConfidence(v) {
    setConfidence(v)
    saveSettings(v, Math.min(violationConf, v), minArea)
  }

  function handleViolationConf(v) {
    setViolationConf(v)
    saveSettings(confidence, v, minArea)
  }

  function handleMinArea(v) {
    setMinArea(v)
    saveSettings(confidence, violationConf, v)
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Detekcja
          {saving && <span className="ml-2 text-xs text-gray-400">saving…</span>}
        </h2>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-blue-400 hover:text-blue-300">Wszystko</button>
          <span className="text-gray-600">|</span>
          <button onClick={clearAll} className="text-gray-400 hover:text-gray-300">Nic</button>
        </div>
      </div>

      {/* Confidence slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Pewność detekcji (confidence)</span>
          <span className="text-white font-mono">{Math.round(confidence * 100)}%</span>
        </div>
        <input type="range" min={10} max={90} step={5}
          value={Math.round(confidence * 100)}
          onChange={e => handleConfidence(Number(e.target.value) / 100)}
          className="w-full h-1.5 accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>10% — czulszy, więcej fałszywych</span>
          <span>90% — pewniejszy, mniej detekcji</span>
        </div>
        {confidence < 0.4 && (
          <p className="text-xs text-yellow-500 bg-yellow-900/20 rounded px-2 py-1">
            Niski próg — włosy/odbicia mogą być wykrywane jako kask
          </p>
        )}
      </div>

      {/* Violation sensitivity */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Czułość naruszeń (daleki zasięg)</span>
          <span className="text-white font-mono">{Math.round(violationConf * 100)}%</span>
        </div>
        <input type="range" min={5} max={55} step={5}
          value={Math.round(violationConf * 100)}
          onChange={e => handleViolationConf(Number(e.target.value) / 100)}
          className="w-full h-1.5 accent-orange-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>5% — bardzo czuły</span>
          <span>55% — tylko pewne</span>
        </div>
        <p className="text-xs text-gray-600">
          Bliski zasięg: wykrywanie automatyczne (odwrócona logika PPE)
        </p>
      </div>

      {/* Min box size */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Min. rozmiar detekcji (px²)</span>
          <span className="text-white font-mono">{minArea.toLocaleString()}</span>
        </div>
        <input type="range" min={0} max={10000} step={500}
          value={minArea}
          onChange={e => handleMinArea(Number(e.target.value))}
          className="w-full h-1.5 accent-blue-500 cursor-pointer"
        />
        <p className="text-xs text-gray-600">
          Odrzuca bardzo małe boxy — zmniejsz dla lepszego wykrywania z dużej odległości
        </p>
      </div>

      {/* Class groups */}
      {GROUPS.map(g => (
        <div key={g.label}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold uppercase tracking-wide ${g.color}`}>
              {g.label}
            </span>
            <div className="flex gap-2 text-xs text-gray-500">
              <button onClick={() => selectGroup(g.classes, true)} className="hover:text-gray-300">all</button>
              <span>/</span>
              <button onClick={() => selectGroup(g.classes, false)} className="hover:text-gray-300">none</button>
            </div>
          </div>
          <div className="space-y-0.5">
            {g.classes.map(cls => (
              <div key={cls}>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2
                                  hover:bg-gray-800 transition-colors">
                  <input type="checkbox" checked={enabled.has(cls)}
                    onChange={() => toggle(cls)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-gray-200">{cls}</span>
                </label>
                {g.note?.[cls] && enabled.has(cls) && (
                  <p className="text-xs text-yellow-500/80 pl-10 pb-1">{g.note[cls]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-500">
        {enabled.size} / {allClasses.length} klas aktywnych
      </p>
    </div>
  )
}
