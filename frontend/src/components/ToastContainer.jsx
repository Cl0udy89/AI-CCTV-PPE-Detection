const VIOLATION_LABELS = {
  'NO-Hardhat':     'Brak kasku',
  'NO-Safety Vest': 'Brak kamizelki',
  'NO-Mask':        'Brak maski',
}

function Toast({ toast, onDismiss }) {
  return (
    <div className="animate-slide-in bg-gray-900 border border-red-700 rounded-lg shadow-xl p-3 w-72 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-red-400 font-semibold text-sm">
          ⚠ Naruszenie PPE #{toast.id}
        </span>
        <button
          onClick={() => onDismiss(toast._toastId)}
          className="text-gray-500 hover:text-gray-200 leading-none text-lg mt-[-2px]"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(toast.violations || []).map(v => (
          <span key={v} className="bg-red-900 text-red-200 text-[11px] px-1.5 py-0.5 rounded">
            {VIOLATION_LABELS[v] || v}
          </span>
        ))}
      </div>

      {toast.zone_name && (
        <span className="text-gray-400 text-xs">Strefa: {toast.zone_name}</span>
      )}
    </div>
  )
}

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(t => (
        <Toast key={t._toastId} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
