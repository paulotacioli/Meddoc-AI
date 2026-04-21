// ── store/authStore.js ────────────────────────────────────────
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

let _api = null
const getApi = async () => {
  if (!_api) _api = (await import('../services/api')).default
  return _api
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken:  null,
      refreshToken: null,
      user:         null,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser:   (user) => set({ user }),

      login: async (email, password) => {
        const api = await getApi()
        const res = await api.post('/auth/login', { email, password })
        if (res.data.requires2FA) return res.data
        set({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken, user: res.data.user })
        return res.data
      },

      login2FA: async (tempToken, code) => {
        const api = await getApi()
        const res = await api.post('/auth/login/2fa', { tempToken, code })
        set({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken })
        const me = await api.get('/auth/me')
        set({ user: me.data })
        return me.data
      },

      logout: async () => {
        try { const api = await getApi(); await api.post('/auth/logout') } catch {}
        set({ accessToken: null, refreshToken: null, user: null })
        window.location.href = '/login'
      },

      refreshAccess: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return null
        const api = await getApi()
        const res = await api.post('/auth/refresh', { refreshToken })
        set({ accessToken: res.data.accessToken })
        return res.data.accessToken
      },
    }),
    { name: 'meddoc-auth', partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }) }
  )
)
