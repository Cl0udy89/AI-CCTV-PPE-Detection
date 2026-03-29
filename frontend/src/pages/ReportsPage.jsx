import { useState } from 'react'
import { apiFetch } from '../api'
import { useI18n } from '../contexts/I18nContext'

export default function ReportsPage() {
  const { lang: appLang } = useI18n()

  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [title,       setTitle]       = useState('')
  const [reportLang,  setReportLang]  = useState(appLang)   // język treści raportu
  const [loading,     setLoading]     = useState(null)

  // Domyślny tytuł zależy od wybranego języka raportu
  const defaultTitles = {
    pl: 'Raport incydentów PPE',
    en: 'PPE Incidents Report',
  }

  function buildUrl(base) {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo)   params.set('date_to',   dateTo)
    params.set('lang', reportLang)
    if (base === '/reports/pdf') {
      params.set('title', title.trim() || defaultTitles[reportLang])
    }
    return `${base}?${params}`
  }

  async function download(type) {
    setLoading(type)
    try {
      const url = buildUrl(type === 'pdf' ? '/reports/pdf' : '/reports/excel')
      const res = await apiFetch(url)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `raport_ppe_${new Date().toISOString().slice(0, 10)}.${type === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      alert('Błąd generowania raportu: ' + e.message)
    } finally {
      setLoading(null)
    }
  }

  function setRange(days) {
    const to   = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days + 1)
    setDateFrom(from.toISOString().slice(0, 10))
    setDateTo(to.toISOString().slice(0, 10))
  }

  // Etykiety UI — zawsze w języku interfejsu (appLang), NIE reportLang
  const ui = {
    pl: {
      heading:      'Raporty',
      params:       'Parametry raportu',
      langReport:   'Język raportu',
      langHint:     'Treść PDF/Excel będzie w wybranym języku',
      titleLabel:   'Tytuł raportu (PDF)',
      titlePh:      defaultTitles[reportLang],
      dateRange:    'Zakres dat',
      last:         'Ostatnie',
      days:         'dni',
      allDates:     'Wszystkie',
      from:         'Od',
      to:           'Do',
      downloadPdf:  'Pobierz PDF',
      downloadXls:  'Pobierz Excel',
      generating:   'Generowanie…',
      infoTitle:    'Co zawiera raport?',
      infoItems: [
        'Lista wszystkich incydentów w wybranym zakresie dat',
        'ID, data/czas, typ naruszenia, strefa, status, Track ID',
        'Notatki operatorów (Excel)',
        'Podsumowanie: łącznie / nowe / w trakcie / zamknięte',
        'PDF: tabela gotowa do druku, styl korporacyjny',
        'Excel: 2 arkusze — dane i podsumowanie',
      ],
    },
    en: {
      heading:      'Reports',
      params:       'Report parameters',
      langReport:   'Report language',
      langHint:     'PDF/Excel content will be in the selected language',
      titleLabel:   'Report title (PDF)',
      titlePh:      defaultTitles[reportLang],
      dateRange:    'Date range',
      last:         'Last',
      days:         'days',
      allDates:     'All dates',
      from:         'From',
      to:           'To',
      downloadPdf:  'Download PDF',
      downloadXls:  'Download Excel',
      generating:   'Generating…',
      infoTitle:    'What does the report contain?',
      infoItems: [
        'List of all incidents in the selected date range',
        'ID, date/time, violation type, zone, status, Track ID',
        'Operator notes (Excel)',
        'Summary: total / new / reviewing / closed',
        'PDF: print-ready table, corporate style',
        'Excel: 2 sheets — data and summary',
      ],
    },
  }
  const L = ui[appLang] || ui['pl']

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-6">
      <h2 className="text-lg font-bold text-white">{L.heading}</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-300">{L.params}</h3>

        {/* ── Język raportu ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">{L.langReport}</label>
            <span className="text-xs text-gray-600">— {L.langHint}</span>
          </div>
          <div className="flex gap-2">
            {[
              { val: 'pl', flag: '🇵🇱', label: 'Polski' },
              { val: 'en', flag: '🇬🇧', label: 'English' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setReportLang(opt.val)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer"
                style={{
                  borderColor:     reportLang === opt.val ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: reportLang === opt.val ? 'var(--accent)' + '22' : 'transparent',
                  color:           reportLang === opt.val ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                <span className="text-lg">{opt.flag}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tytuł PDF ────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-xs text-gray-400">{L.titleLabel}</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={L.titlePh}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                       focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* ── Zakres dat ───────────────────────────────────────────────── */}
        <div>
          <div className="text-xs text-gray-400 mb-2">{L.dateRange}</div>
          <div className="flex gap-2 flex-wrap mb-3">
            {[[7, '7'], [30, '30'], [90, '90']].map(([d, n]) => (
              <button key={d} onClick={() => setRange(d)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                {L.last} {n} {L.days}
              </button>
            ))}
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
              {L.allDates}
            </button>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-1">{L.from}</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                           focus:outline-none focus:border-orange-500 transition-colors" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-1">{L.to}</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                           focus:outline-none focus:border-orange-500 transition-colors" />
            </div>
          </div>
        </div>

        {/* ── Przyciski pobierania ─────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => download('pdf')}
            disabled={loading !== null}
            className="flex-1 flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600
                       disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors cursor-pointer">
            {loading === 'pdf'
              ? <><span className="animate-spin inline-block">⏳</span> {L.generating}</>
              : <><span className="text-lg">📄</span> {L.downloadPdf}</>}
          </button>
          <button
            onClick={() => download('excel')}
            disabled={loading !== null}
            className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600
                       disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors cursor-pointer">
            {loading === 'excel'
              ? <><span className="animate-spin inline-block">⏳</span> {L.generating}</>
              : <><span className="text-lg">📊</span> {L.downloadXls}</>}
          </button>
        </div>
      </div>

      {/* ── Info ─────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-2xl text-sm text-gray-400 space-y-2">
        <div className="font-medium text-gray-300 mb-1">{L.infoTitle}</div>
        <ul className="space-y-1 list-disc list-inside text-xs">
          {L.infoItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </div>
    </div>
  )
}
