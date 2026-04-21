// ── PÁGINA: Login ─────────────────────────────────────────────
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Layers, Loader2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const login2FA = useAuthStore(s => s.login2FA)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [step, setStep]         = useState('login') // 'login' | '2fa'
  const [tempToken, setTempToken] = useState('')
  const [code2FA, setCode2FA]   = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await login(email, password)
      if (res.requires2FA) {
        setTempToken(res.tempToken)
        setStep('2fa')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  const handle2FA = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login2FA(tempToken, code2FA)
      navigate('/dashboard')
    } catch {
      toast.error('Código inválido. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Layers size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">MedDoc AI</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {step === 'login' ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h1>
              <p className="text-sm text-gray-500 mb-6">Acesse sua conta MedDoc AI</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">E-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="seu@email.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Senha</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                  <div className="text-right mt-1">
                    <Link to="/esqueci-senha" className="text-xs text-blue-600 hover:underline">Esqueci a senha</Link>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors mt-2">
                  {loading && <Loader2 size={14} className="animate-spin"/>}
                  Entrar
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 mt-5">
                Sem conta?{' '}
                <Link to="/cadastro" className="text-blue-600 font-semibold hover:underline">Criar clínica grátis</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Verificação 2FA</h1>
              <p className="text-sm text-gray-500 mb-6">Digite o código do seu autenticador</p>
              <form onSubmit={handle2FA} className="space-y-4">
                <input type="text" value={code2FA} onChange={e => setCode2FA(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" maxLength={6} required autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <button type="submit" disabled={loading || code2FA.length < 6}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm">
                  {loading && <Loader2 size={14} className="animate-spin"/>}
                  Verificar
                </button>
                <button type="button" onClick={() => setStep('login')} className="w-full text-xs text-gray-500 hover:text-gray-700">
                  ← Voltar ao login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
