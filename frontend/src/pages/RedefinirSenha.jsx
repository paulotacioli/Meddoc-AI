// ── PÁGINA: Redefinir senha ───────────────────────────────────
import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Layers, Loader2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function RedefinirSenha() {
  const [searchParams]          = useSearchParams()
  const navigate                = useNavigate()
  const token                   = searchParams.get('token')

  const [password, setPassword]         = useState('')
  const [confirmPassword, setConfirm]   = useState('')
  const [showPwd, setShowPwd]           = useState(false)
  const [loading, setLoading]           = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem'); return
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres'); return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      toast.success('Senha redefinida com sucesso!')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Link inválido ou expirado. Solicite um novo.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-sm w-full">
          <p className="text-gray-600 mb-4">Link inválido ou expirado.</p>
          <Link to="/esqueci-senha" className="text-blue-600 font-semibold hover:underline text-sm">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Layers size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">Pronova</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Nova senha</h1>
          <p className="text-sm text-gray-500 mb-6">Escolha uma nova senha para sua conta.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nova senha</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmar senha</label>
              <input
                type="password" value={confirmPassword} onChange={e => setConfirm(e.target.value)}
                required placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button type="submit" disabled={loading || !password || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Redefinir senha
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
