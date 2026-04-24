// ── PÁGINA: Esqueci minha senha ───────────────────────────────
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function EsqueciSenha() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setEnviado(true)
    } catch {
      toast.error('Erro ao processar solicitação. Tente novamente.')
    } finally {
      setLoading(false)
    }
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
          {enviado ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✉️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail enviado!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá as instruções de redefinição em instantes.
              </p>
              <Link to="/login" className="text-sm text-blue-600 font-semibold hover:underline flex items-center justify-center gap-1">
                <ArrowLeft size={14} /> Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Esqueci a senha</h1>
              <p className="text-sm text-gray-500 mb-6">
                Informe seu e-mail e enviaremos um link para redefinir a senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">E-mail</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required placeholder="seu@email.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Enviar link de redefinição
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 mt-5">
                <Link to="/login" className="text-blue-600 hover:underline flex items-center justify-center gap-1">
                  <ArrowLeft size={12} /> Voltar ao login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
