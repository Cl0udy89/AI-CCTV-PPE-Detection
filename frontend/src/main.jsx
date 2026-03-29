import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import './index.css'

function Root() {
  // Read userId from localStorage to seed providers before AuthContext is available
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('ppe_user')) } catch { return null }
  })()
  const userId = user?.id

  return (
    <ThemeProvider userId={userId}>
      <I18nProvider userId={userId}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
