import { createContext, useContext, useState } from 'react'
import translations from '../i18n/translations'

const I18nContext = createContext(null)

function getStorageKey(userId) {
  return userId ? `ppe_lang_${userId}` : 'ppe_lang_default'
}

function resolve(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str
  return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export function I18nProvider({ children, userId }) {
  const key = getStorageKey(userId)
  const [lang, setLangState] = useState(() => {
    const stored = localStorage.getItem(key)
    return stored || 'pl'
  })

  function setLang(newLang) {
    localStorage.setItem(getStorageKey(userId), newLang)
    setLangState(newLang)
  }

  function t(keyPath, vars) {
    const dict = translations[lang] || translations['pl']
    const val = resolve(dict, keyPath)
    if (val === undefined) {
      // Fallback to Polish
      const fallback = resolve(translations['pl'], keyPath)
      return interpolate(fallback ?? keyPath, vars)
    }
    return interpolate(val, vars)
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

// Convenience hook that just returns the t() function
export function useT() {
  const ctx = useContext(I18nContext)
  return ctx?.t ?? ((k) => k)
}
