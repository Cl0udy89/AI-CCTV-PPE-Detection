/**
 * RuleBuilder — drag & drop / click rule creator for zones
 *
 * Rule structure: [SUBJECT] + [STAN PPE…] · [TRIGGER] [ZONE] @ [TIME?] → [ACTION]
 * Rules stored in localStorage. Builder draft auto-saved.
 */
import { useState, useEffect } from 'react'

// ── Palette definitions ─────────────────────────────────────────────────────

const PALETTE = [
  {
    category: 'Podmiot',
    key: 'subject',
    color: { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.45)', text: '#93c5fd' },
    blocks: [
      { value: 'person',   label: 'Osoba',         icon: '👤' },
      { value: 'worker',   label: 'Pracownik',      icon: '👷' },
      { value: 'vehicle',  label: 'Pojazd',         icon: '🚗' },
      { value: 'forklift', label: 'Wózek widłowy',  icon: '🏗' },
    ],
  },
  {
    category: 'Stan PPE',
    key: 'condition',
    color: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.45)', text: '#fcd34d' },
    blocks: [
      { value: 'no_helmet',   label: 'bez kasku',      icon: '⛑' },
      { value: 'with_helmet', label: 'z kaskiem',      icon: '⛑✓' },
      { value: 'no_vest',     label: 'bez kamizelki',  icon: '🦺' },
      { value: 'with_vest',   label: 'z kamizelką',    icon: '🦺✓' },
      { value: 'no_mask',     label: 'bez maski',      icon: '😷' },
      { value: 'with_mask',   label: 'z maską',        icon: '😷✓' },
      { value: 'missing_ppe', label: 'brak PPE',       icon: '⚠' },
      { value: 'full_ppe',    label: 'pełne PPE',      icon: '✅' },
      { value: 'partial_ppe', label: 'niepełne PPE',   icon: '◑' },
    ],
  },
  {
    category: 'Wyzwalacz',
    key: 'trigger',
    color: { bg: 'rgba(139,92,246,0.18)', border: 'rgba(139,92,246,0.45)', text: '#c4b5fd' },
    blocks: [
      { value: 'enters',   label: 'wchodzi do',       icon: '→' },
      { value: 'exits',    label: 'wychodzi z',       icon: '←' },
      { value: 'present',  label: 'przebywa w',       icon: '📍' },
      { value: 'passes',   label: 'przechodzi przez', icon: '↔' },
      { value: 'detected', label: 'wykryty w',        icon: '👁' },
    ],
  },
  {
    category: 'Czas',
    key: 'time',
    color: { bg: 'rgba(6,182,212,0.18)', border: 'rgba(6,182,212,0.45)', text: '#67e8f9' },
    blocks: [
      { value: 'always',      label: 'zawsze',         icon: '⏰' },
      { value: 'daytime',     label: 'w dzień',        icon: '☀' },
      { value: 'night',       label: 'w nocy',         icon: '🌙' },
      { value: 'morning',     label: 'zm. ranna',      icon: '🌅' },
      { value: 'afternoon',   label: 'zm. popołudn.',  icon: '🌆' },
      { value: 'night_shift', label: 'zm. nocna',      icon: '🌃' },
      { value: 'weekend',     label: 'weekend',        icon: '📅' },
      { value: 'workday',     label: 'dzień roboczy',  icon: '💼' },
    ],
  },
  {
    category: 'Akcja',
    key: 'action',
    color: { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.45)', text: '#fca5a5' },
    blocks: [
      { value: 'alert',    label: 'Alert',           icon: '🔔', severity: 'high' },
      { value: 'critical', label: 'Alert krytyczny', icon: '🚨', severity: 'critical' },
      { value: 'incident', label: 'Zapis incydentu', icon: '📋', severity: 'medium' },
      { value: 'email',    label: 'Email',           icon: '📧', severity: 'medium' },
      { value: 'slack',    label: 'Slack / Teams',   icon: '💬', severity: 'medium' },
      { value: 'log',      label: 'Tylko log',       icon: '📝', severity: 'low' },
    ],
  },
]

const SLOTS = [
  { id: 'subject',   label: 'PODMIOT',   accepts: 'subject',   required: true,  hint: 'Kto?' },
  { id: 'condition', label: 'STAN PPE',  accepts: 'condition', required: false, hint: 'PPE?\n(opcjon.)' },
  { id: 'trigger',   label: 'WYZWALACZ', accepts: 'trigger',   required: true,  hint: 'Co robi?' },
  { id: 'zone',      label: 'STREFA',    accepts: 'zone',      required: true,  hint: 'Gdzie?' },
  { id: 'time',      label: 'CZAS',      accepts: 'time',      required: false, hint: 'Kiedy?\n(opcjon.)' },
  { id: 'action',    label: 'AKCJA',     accepts: 'action',    required: true,  hint: 'Co zrobić?' },
]

const TYPE_COLOR = {
  subject:   { bg: 'rgba(59,130,246,0.18)',  border: 'rgba(59,130,246,0.5)',  text: '#93c5fd' },
  condition: { bg: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.5)',  text: '#fcd34d' },
  trigger:   { bg: 'rgba(139,92,246,0.18)',  border: 'rgba(139,92,246,0.5)',  text: '#c4b5fd' },
  zone:      { bg: 'rgba(249,115,22,0.18)',  border: 'rgba(249,115,22,0.5)',  text: '#fdba74' },
  time:      { bg: 'rgba(6,182,212,0.18)',   border: 'rgba(6,182,212,0.5)',   text: '#67e8f9' },
  action:    { bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.5)',   text: '#fca5a5' },
}

const SEVERITY_BADGE = {
  critical: { bg: '#dc2626', text: '#fff',    label: 'KRYT' },
  high:     { bg: '#ea580c', text: '#fff',    label: 'WYS'  },
  medium:   { bg: '#ca8a04', text: '#fff',    label: 'ŚRED' },
  low:      { bg: '#1d4ed8', text: '#fff',    label: 'NISKI'},
}

const RULES_KEY = 'ppe_zone_rules'
const DRAFT_KEY = 'ppe_rule_draft'

function loadRules() { try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]') } catch { return [] } }
function persistRules(r) { localStorage.setItem(RULES_KEY, JSON.stringify(r)) }
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } }
function saveDraft(slots, note) { localStorage.setItem(DRAFT_KEY, JSON.stringify({ slots, note })) }

// ── Chip ────────────────────────────────────────────────────────────────────

function Chip({ block, draggable: isDraggable = false, size = 'md', onDragStart, onDragEnd, onRemove }) {
  const c = TYPE_COLOR[block.type] || TYPE_COLOR.subject
  const cls = size === 'sm'
    ? 'px-1.5 py-0.5 text-[11px] gap-1'
    : 'px-2.5 py-1.5 text-sm gap-1.5'
  return (
    <span
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`inline-flex items-center rounded-lg font-medium select-none whitespace-nowrap ${cls}
                  ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="leading-none">{block.icon}</span>
      <span>{block.label}</span>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
          style={{ color: c.text }}>✕</button>
      )}
    </span>
  )
}

// ── Drop slot ───────────────────────────────────────────────────────────────

function DropSlot({ slot, filled, dragOver, onDragOver, onDragLeave, onDrop, onRemove, onDragStart, onDragEnd }) {
  const isOver = dragOver === slot.id
  const isMulti = slot.id === 'condition'
  // For multi-slots, filled is an array
  const hasContent = isMulti ? (Array.isArray(filled) && filled.length > 0) : !!filled
  const singleColor = (!isMulti && filled) ? (TYPE_COLOR[filled.type] || TYPE_COLOR.subject) : null

  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: isMulti ? 120 : 84 }}>
      <div className="text-[9px] font-bold uppercase tracking-widest leading-none" style={{ color: 'var(--muted)' }}>
        {slot.label}
        {!slot.required && <span className="ml-0.5 opacity-60 normal-case font-normal"> opt.</span>}
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="rounded-xl flex items-center justify-center min-h-[46px] px-2 py-1.5 transition-all"
        style={{
          minWidth: isMulti ? 120 : 84,
          border: isOver
            ? '2px dashed var(--accent)'
            : hasContent
              ? `1px solid ${isMulti ? 'rgba(245,158,11,0.5)' : singleColor.border}`
              : '2px dashed rgba(255,255,255,0.12)',
          backgroundColor: isOver
            ? 'rgba(249,115,22,0.1)'
            : hasContent
              ? (isMulti ? 'rgba(245,158,11,0.08)' : singleColor.bg)
              : 'var(--surface2)',
        }}
      >
        {isMulti ? (
          hasContent ? (
            <div className="flex flex-wrap gap-1 justify-center">
              {filled.map((block, i) => (
                <Chip key={block.value + i} block={block} draggable={false}
                  onRemove={() => onRemove(block.value)} />
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-center px-1 whitespace-pre-line leading-snug"
              style={{ color: isOver ? 'var(--accent)' : 'var(--muted)' }}>
              {isOver ? '⬇ Upuść' : slot.hint}
            </span>
          )
        ) : (
          filled ? (
            <Chip block={filled} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onRemove={() => onRemove()} />
          ) : (
            <span className="text-[11px] text-center px-1 whitespace-pre-line leading-snug"
              style={{ color: isOver ? 'var(--accent)' : 'var(--muted)' }}>
              {isOver ? '⬇ Upuść' : slot.hint}
            </span>
          )
        )}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function RuleBuilder({ zones = [], onDrawZone }) {
  const [rules, setRules] = useState(loadRules)

  // Restore draft on mount
  const draft = loadDraft()
  const [slots, setSlots] = useState(draft?.slots || {})
  const [note, setNote]   = useState(draft?.note || '')

  const [dragOver, setDragOver]   = useState(null)
  const [dragBlock, setDragBlock] = useState(null)
  const [dragFrom, setDragFrom]   = useState(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  // Zone blocks
  const zoneBlocks = zones.map(z => ({
    type: 'zone',
    value: `zone_${z.id}`,
    label: z.name,
    icon: z.zone_type === 'restricted' ? '⛔' : z.zone_type === 'ppe_required' ? '⚠' : '✓',
    zoneId: z.id,
    zoneType: z.zone_type,
  }))

  // Auto-save draft whenever slots or note change
  useEffect(() => {
    saveDraft(slots, note)
  }, [slots, note])

  // ── Click to add block from palette ──────────────────────────────────────

  function clickPaletteBlock(block) {
    setSlots(prev => {
      if (block.type === 'condition') {
        const arr = prev.condition || []
        const exists = arr.some(b => b.value === block.value)
        // toggle: if already selected, remove; else add
        return {
          ...prev,
          condition: exists ? arr.filter(b => b.value !== block.value) : [...arr, block],
        }
      }
      // For zone blocks, only drag-drop (no click)
      if (block.type === 'zone') return prev
      return { ...prev, [block.type]: block }
    })
  }

  // ── DnD ──────────────────────────────────────────────────────────────────

  function startDrag(e, block, from) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', block.value)
    setDragBlock(block)
    setDragFrom(from)
  }

  function endDrag() {
    setDragBlock(null)
    setDragFrom(null)
    setDragOver(null)
  }

  function slotDragOver(e, slotId) {
    if (!dragBlock) return
    const slot = SLOTS.find(s => s.id === slotId)
    if (!slot) return
    const accepts = slot.accepts === 'zone' ? dragBlock.type === 'zone' : dragBlock.type === slot.accepts
    if (!accepts) return
    e.preventDefault()
    setDragOver(slotId)
  }

  function slotDrop(e, slotId) {
    e.preventDefault()
    if (!dragBlock) return
    const slot = SLOTS.find(s => s.id === slotId)
    if (!slot) return
    const accepts = slot.accepts === 'zone' ? dragBlock.type === 'zone' : dragBlock.type === slot.accepts
    if (!accepts) return

    if (slotId === 'condition') {
      // append (no duplicates), clear source if from another slot
      if (dragFrom && dragFrom !== 'palette' && dragFrom !== 'condition') {
        setSlots(prev => { const n = { ...prev }; delete n[dragFrom]; return n })
      }
      setSlots(prev => {
        const arr = prev.condition || []
        if (arr.some(b => b.value === dragBlock.value)) { endDrag(); return prev }
        return { ...prev, condition: [...arr, { ...dragBlock }] }
      })
    } else {
      // If dragging FROM another slot, clear that slot
      if (dragFrom && dragFrom !== 'palette') {
        setSlots(prev => { const n = { ...prev }; delete n[dragFrom]; return n })
      }
      setSlots(prev => ({ ...prev, [slotId]: { ...dragBlock } }))
    }
    endDrag()
  }

  // ── Rule actions ──────────────────────────────────────────────────────────

  function isValid() {
    return slots.subject && slots.trigger && slots.zone && slots.action
  }

  function save() {
    if (!isValid()) return
    const rule = {
      id: Date.now(),
      slots: { ...slots },
      note: note.trim(),
      enabled: true,
      createdAt: new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }),
    }
    const next = [...rules, rule]
    setRules(next)
    persistRules(next)
    // deliberately NOT clearing builder state — user keeps their config
  }

  function removeFromSlot(slotId, value) {
    setSlots(prev => {
      if (slotId === 'condition') {
        const arr = (prev.condition || []).filter(b => b.value !== value)
        return { ...prev, condition: arr.length ? arr : undefined }
      }
      const n = { ...prev }; delete n[slotId]; return n
    })
  }

  function clearBuilder() {
    setSlots({})
    setNote('')
  }

  function toggleRule(id) {
    const next = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setRules(next); persistRules(next)
  }

  function deleteRule(id) {
    const next = rules.filter(r => r.id !== id)
    setRules(next); persistRules(next)
  }

  function deleteAllRules() {
    setRules([]); persistRules([])
    setConfirmDeleteAll(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 h-full min-h-0" style={{ minHeight: 0 }}>

      {/* ── LEFT PALETTE ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 w-44 flex flex-col gap-3 overflow-y-auto pr-0.5
                      [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

        {/* Zones */}
        <div className="rounded-xl p-3 border space-y-2"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Strefy</div>
          {zoneBlocks.length === 0 ? (
            <p className="text-xs leading-snug" style={{ color: 'var(--muted)' }}>
              Brak stref — narysuj na zakładce Strefy
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {zoneBlocks.map(b => (
                <span key={b.value}
                  draggable
                  onDragStart={e => startDrag(e, b, 'palette')}
                  onDragEnd={endDrag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                             cursor-grab active:cursor-grabbing select-none"
                  style={{ backgroundColor: TYPE_COLOR.zone.bg, border: `1px solid ${TYPE_COLOR.zone.border}`, color: TYPE_COLOR.zone.text }}>
                  {b.icon} <span className="truncate max-w-[72px]">{b.label}</span>
                </span>
              ))}
            </div>
          )}
          <button onClick={() => onDrawZone?.()}
            className="w-full mt-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ border: '1px dashed rgba(249,115,22,0.4)', color: '#fdba74', backgroundColor: 'rgba(249,115,22,0.08)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.16)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.08)'}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Nowa strefa
          </button>
        </div>

        {/* Block categories */}
        {PALETTE.map(cat => {
          const isCondition = cat.key === 'condition'
          const selectedValues = isCondition ? new Set((slots.condition || []).map(b => b.value)) : null
          return (
            <div key={cat.key} className="rounded-xl p-3 border space-y-2"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                {cat.category}
                {isCondition && <span className="ml-1 font-normal normal-case opacity-60">— klik = wielokrotny</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.blocks.map(b => {
                  const block = { type: cat.key, ...b }
                  const selected = isCondition && selectedValues.has(b.value)
                  return (
                    <span key={b.value}
                      draggable
                      onDragStart={e => startDrag(e, block, 'palette')}
                      onDragEnd={endDrag}
                      onClick={() => clickPaletteBlock(block)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                                 cursor-pointer select-none transition-all"
                      style={{
                        backgroundColor: selected ? cat.color.border : cat.color.bg,
                        border: `1px solid ${selected ? cat.color.text : cat.color.border}`,
                        color: cat.color.text,
                        outline: selected ? `2px solid ${cat.color.text}` : 'none',
                        outlineOffset: '1px',
                      }}>
                      <span className="leading-none">{b.icon}</span>
                      <span>{b.label}</span>
                      {selected && <span className="ml-0.5">✓</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── CENTER + RIGHT ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto
                      [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

        {/* Builder card */}
        <div className="rounded-xl p-5 border space-y-4 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Kreator reguły</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              kliknij bloki w palecie lub przeciągnij →
            </span>
          </div>

          {/* Slot row */}
          <div className="flex items-end gap-2 overflow-x-auto pb-1
                          [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {SLOTS.map((slot, i) => (
              <>
                {i === 1 && (
                  <div key="sep-plus" className="text-xl font-light flex-shrink-0 mb-3" style={{ color: 'var(--muted)' }}>+</div>
                )}
                {i === 2 && (
                  <div key="sep-dot" className="text-xl font-light flex-shrink-0 mb-3" style={{ color: 'var(--muted)' }}>·</div>
                )}
                {i === 5 && (
                  <div key="sep-arrow" className="text-2xl font-bold flex-shrink-0 mb-3 mx-1" style={{ color: 'var(--accent)' }}>→</div>
                )}
                <DropSlot
                  key={slot.id}
                  slot={slot}
                  filled={slot.id === 'condition' ? (slots.condition || []) : (slots[slot.id] || null)}
                  dragOver={dragOver}
                  onDragOver={e => slotDragOver(e, slot.id)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => slotDrop(e, slot.id)}
                  onRemove={slot.id === 'condition'
                    ? (value) => removeFromSlot('condition', value)
                    : () => removeFromSlot(slot.id)}
                  onDragStart={slot.id !== 'condition' && slots[slot.id]
                    ? e => startDrag(e, slots[slot.id], slot.id)
                    : undefined}
                  onDragEnd={endDrag}
                />
              </>
            ))}
          </div>

          {/* Validation row */}
          <div className="flex gap-3 flex-wrap">
            {[
              { key: 'subject', label: 'Podmiot' },
              { key: 'trigger', label: 'Wyzwalacz' },
              { key: 'zone',    label: 'Strefa' },
              { key: 'action',  label: 'Akcja' },
            ].map(({ key, label }) => {
              const ok = !!slots[key]
              return (
                <div key={key} className="flex items-center gap-1 text-xs" style={{ color: ok ? '#4ade80' : 'var(--muted)' }}>
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    {ok
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    }
                  </svg>
                  {label}
                </div>
              )
            })}
          </div>

          {/* Note */}
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Notatka do reguły (opcjonalnie)…"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
            style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!isValid()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors
                         cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--accent-hover)' }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}>
              Zapisz regułę
            </button>
            <button
              onClick={clearBuilder}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
              Wyczyść
            </button>
          </div>
        </div>

        {/* Saved rules */}
        <div className="rounded-xl p-4 border space-y-3 flex-1"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Zapisane reguły
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>
                {rules.filter(r => r.enabled).length} aktywnych / {rules.length} łącznie
              </span>
            </div>
            {rules.length > 0 && (
              confirmDeleteAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Na pewno?</span>
                  <button onClick={deleteAllRules}
                    className="text-xs px-2 py-0.5 rounded cursor-pointer font-semibold"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
                    Tak, usuń
                  </button>
                  <button onClick={() => setConfirmDeleteAll(false)}
                    className="text-xs px-2 py-0.5 rounded cursor-pointer"
                    style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    Anuluj
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteAll(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                  style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  Usuń wszystkie
                </button>
              )
            )}
          </div>

          {rules.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Brak reguł. Zbuduj pierwszą regułę powyżej i kliknij „Zapisz regułę".
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => {
                const sev = rule.slots.action?.severity
                const badge = sev ? SEVERITY_BADGE[sev] : null
                const conditions = Array.isArray(rule.slots.condition) ? rule.slots.condition : (rule.slots.condition ? [rule.slots.condition] : [])
                return (
                  <div key={rule.id}
                    className="rounded-xl p-3 border transition-opacity"
                    style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)', opacity: rule.enabled ? 1 : 0.5 }}>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {rule.slots.subject && <Chip block={rule.slots.subject} size="sm" />}
                      {conditions.length > 0 && conditions.map((c, i) => (
                        <Chip key={c.value + i} block={c} size="sm" />
                      ))}
                      {rule.slots.trigger && <Chip block={rule.slots.trigger} size="sm" />}
                      {rule.slots.zone    && <Chip block={rule.slots.zone}    size="sm" />}
                      {rule.slots.time    && <Chip block={rule.slots.time}    size="sm" />}
                      {rule.slots.action  && (
                        <>
                          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>→</span>
                          <Chip block={rule.slots.action} size="sm" />
                        </>
                      )}
                      {badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{ backgroundColor: badge.bg, color: badge.text }}>
                          {badge.label}
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1.5">
                        <button onClick={() => toggleRule(rule.id)}
                          className="text-[11px] px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors"
                          style={{
                            backgroundColor: rule.enabled ? 'rgba(74,222,128,0.12)' : 'var(--surface)',
                            border: `1px solid ${rule.enabled ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                            color: rule.enabled ? '#4ade80' : 'var(--muted)',
                          }}>
                          {rule.enabled ? 'ON' : 'OFF'}
                        </button>
                        <button onClick={() => deleteRule(rule.id)}
                          className="cursor-pointer p-1 rounded transition-colors"
                          style={{ color: 'var(--muted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
                      {rule.note && <span className="italic">„{rule.note}"</span>}
                      <span>{rule.createdAt}</span>
                      {rule.slots.zone && (
                        <button onClick={() => onDrawZone?.(rule.slots.zone?.zoneId)}
                          className="flex items-center gap-1 cursor-pointer transition-colors hover:text-orange-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                          </svg>
                          Edytuj strefę
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
