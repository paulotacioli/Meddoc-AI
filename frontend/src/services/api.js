// ── services/api.js ───────────────────────────────────────────
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30_000,
})

// Injetar token em cada request
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('meddoc-auth')
    if (stored) {
      const { state } = JSON.parse(stored)
      if (state?.accessToken) {
        config.headers.Authorization = `Bearer ${state.accessToken}`
      }
    }
  } catch {}
  return config
})

// Renovar token expirado automaticamente
let refreshing = false
let refreshQueue = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (
      err.response?.status === 401 &&
      err.response?.data?.code === 'TOKEN_EXPIRED' &&
      !original._retry
    ) {
      original._retry = true
      if (refreshing) {
        return new Promise((resolve, reject) =>
          refreshQueue.push({ resolve, reject, config: original })
        )
      }
      refreshing = true
      try {
        const stored = localStorage.getItem('meddoc-auth')
        const { state } = JSON.parse(stored)
        const res = await axios.post('/api/auth/refresh', { refreshToken: state.refreshToken })
        const newToken = res.data.accessToken

        // Atualizar no localStorage
        state.accessToken = newToken
        localStorage.setItem('meddoc-auth', JSON.stringify({ state }))

        refreshQueue.forEach(({ resolve, config }) => {
          config.headers.Authorization = `Bearer ${newToken}`
          resolve(api(config))
        })
        refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        localStorage.removeItem('meddoc-auth')
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        refreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
