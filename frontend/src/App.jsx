import { useState } from 'react'
import SourcePanel from './components/SourcePanel'
import DetectionPanel from './components/DetectionPanel'
import VideoFeed from './components/VideoFeed'
import StatusBar from './components/StatusBar'
import ZonesPage from './pages/ZonesPage'

const TABS = [
  { id: 'live',  label: 'Live' },
  { id: 'zones', label: 'Strefy' },
]

export default function App() {
  const [tab, setTab]               = useState('live')
  const [connected, setConnected]   = useState(false)
  const [currentSource, setSource]  = useState(null)

  function handleConnect(source)  { setSource(source); setConnected(true) }
  function handleDisconnect()     { setConnected(false); setSource(null) }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">AI</div>
        <h1 className="text-lg font-bold text-white">AI CCTV PPE Detection</h1>

        {/* Tabs */}
        <nav className="flex gap-1 ml-4 bg-gray-900 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                          ${tab === t.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </nav>

        {connected && (
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-300">{currentSource}</span>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 p-5 overflow-hidden">

        {/* ---- LIVE TAB ---- */}
        {tab === 'live' && (
          <div className="flex gap-5 h-full">
            <aside className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
              <SourcePanel connected={connected} currentSource={currentSource}
                onConnect={handleConnect} onDisconnect={handleDisconnect} />
              <DetectionPanel />
            </aside>
            <section className="flex-1 flex flex-col gap-3 min-w-0">
              <VideoFeed connected={connected} />
              <StatusBar connected={connected} />
            </section>
          </div>
        )}

        {/* ---- ZONES TAB ---- */}
        {tab === 'zones' && (
          <ZonesPage connected={connected} />
        )}

      </main>
    </div>
  )
}
