/**
 * Authenticated fetch helper.
 * Reads JWT from localStorage and adds Authorization header.
 */
const TOKEN_KEY = 'ppe_token'

export function apiFetch(url, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = { ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    return fetch(url, { ...opts, headers, body: JSON.stringify(opts.body) })
  }
  return fetch(url, { ...opts, headers })
}

export async function apiJSON(url, opts = {}) {
  const res = await apiFetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw Object.assign(new Error(err.detail || 'API error'), { status: res.status })
  }
  return res.json()
}
