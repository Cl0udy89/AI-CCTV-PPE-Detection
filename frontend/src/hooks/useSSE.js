import { useEffect, useRef } from 'react'

export function useSSE(url, onMessage) {
  const cbRef = useRef(onMessage)
  useEffect(() => { cbRef.current = onMessage })

  useEffect(() => {
    let es, timer
    function connect() {
      es = new EventSource(url)
      es.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)) } catch {}
      }
      es.onerror = () => { es.close(); timer = setTimeout(connect, 3000) }
    }
    connect()
    return () => { es?.close(); clearTimeout(timer) }
  }, [url])
}
