import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

function getStorageKey(userId) {
  return userId ? `ppe_theme_${userId}` : 'ppe_theme_default'
}

function applyTheme(theme) {
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.add('light')
  } else if (theme === 'dark') {
    html.classList.remove('light')
  } else {
    // auto: follow system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      html.classList.remove('light')
    } else {
      html.classList.add('light')
    }
  }
}

export function ThemeProvider({ children, userId }) {
  const key = getStorageKey(userId)
  const [theme, setThemeState] = useState(() => localStorage.getItem(key) || 'auto')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for system changes when in 'auto' mode
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(newTheme) {
    localStorage.setItem(getStorageKey(userId), newTheme)
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
