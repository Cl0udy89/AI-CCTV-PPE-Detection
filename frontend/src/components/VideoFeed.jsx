export default function VideoFeed({ connected }) {
  if (!connected) {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-xl flex items-center justify-center
                      border-2 border-dashed border-gray-700">
        <div className="text-center space-y-2">
          <div className="text-4xl">📷</div>
          <p className="text-gray-400 text-sm">No stream connected</p>
          <p className="text-gray-600 text-xs">Select a camera source on the left</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative">
      {/* MJPEG stream — browser renders it natively as an <img> */}
      <img
        src="/stream/feed"
        alt="Live detection feed"
        className="w-full h-full object-contain"
      />
      {/* Live badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full
                      px-3 py-1">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold text-white tracking-wide">LIVE</span>
      </div>
    </div>
  )
}
