import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'ppe_token'
const USER_KEY  = 'ppe_user'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null)
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })

  const login = useCallback((tokenVal, userVal) => {
    localStorage.setItem(TOKEN_KEY, tokenVal)
    localStorage.setItem(USER_KEY, JSON.stringify(userVal))

    // Seed language + theme preferences from backend into localStorage
    if (userVal?.id) {
      if (userVal.language) {
        localStorage.setItem(`ppe_lang_${userVal.id}`, userVal.language)
      }
      if (userVal.theme) {
        localStorage.setItem(`ppe_theme_${userVal.id}`, userVal.theme)
      }
    }

    setToken(tokenVal)
    setUser(userVal)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// Role hierarchy helper
const ROLE_RANK = { viewer: 0, operator: 1, supervisor: 2, admin: 3 }
export function hasRole(user, minRole) {
  return (ROLE_RANK[user?.role] ?? -1) >= (ROLE_RANK[minRole] ?? 99)
}
