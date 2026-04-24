// ── PÁGINA: Onboarding (Cadastro de clínica) ─────────────────
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Layers, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Onboarding({ invite = false }) {
  const navigate = useNavigate()
  const setTokens = useAuthStore(s => s.setTokens)
  const setUser   = useAuthStore(s => s.setUser)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    clinicName: '', cnpj: '', email: '', phone: '',
    name: '', password: '', confirmPassword: '',
    plan: 'starter',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não coincidem'); return
    }
    setLoading(true)
    try {
      const res = await api.post('/auth/register', form)
      setTokens(res.data.accessToken, res.data.refreshToken)
      setUser(res.data.user)
      setStep(3)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  const PLANS = [
    { key: 'starter', name: 'Starter', price: 'R$ 297/mês', desc: '1 médico · 50 consultas' },
    { key: 'pro',     name: 'Pro',     price: 'R$ 897/mês', desc: 'Até 10 médicos · Ilimitado', popular: true },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Layers size={18} className="text-white"/>
          </div>
          <span className="text-xl font-bold text-gray-900">Pronova</span>
        </div>

        {/* Steps indicator */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-3 mb-6">
            {[1,2].map(s => (
              <div key={s} className={`flex items-center gap-2 text-sm font-medium ${step === s ? 'text-blue-600' : step > s ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step > s ? '✓' : s}
                </div>
                {s === 1 ? 'Dados da clínica' : 'Seu acesso'}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">

          {/* Step 1: Dados da clínica */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Dados da clínica</h2>
              {[
                { key: 'clinicName', label: 'Nome da clínica', placeholder: 'Clínica São Lucas', required: true },
                { key: 'cnpj',       label: 'CNPJ',            placeholder: '00.000.000/0001-00' },
                { key: 'email',      label: 'E-mail',          placeholder: 'contato@clinica.com', type: 'email', required: true },
                { key: 'phone',      label: 'Telefone',        placeholder: '(11) 99999-9999' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}{f.required && ' *'}</label>
                  <input type={f.type || 'text'} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder} required={f.required}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
              ))}
              <button onClick={() => setStep(2)} disabled={!form.clinicName || !form.email}
                className="w-full bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm mt-2">
                Continuar →
              </button>
            </div>
          )}

          {/* Step 2: Acesso do admin */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Seu acesso</h2>
              {[
                { key: 'name',            label: 'Seu nome completo', placeholder: 'Dr. João Silva', required: true },
                { key: 'password',        label: 'Senha',             placeholder: '••••••••',       type: 'password', required: true },
                { key: 'confirmPassword', label: 'Confirmar senha',   placeholder: '••••••••',       type: 'password', required: true },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}{f.required && ' *'}</label>
                  <input type={f.type || 'text'} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder} required={f.required}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
              ))}

              <p className="text-xs text-gray-400 pt-2">
                Ao criar conta você concorda com os <a href="#" className="text-blue-600">Termos de Uso</a> e <a href="#" className="text-blue-600">Política de Privacidade (LGPD)</a>.
              </p>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium text-sm">
                  ← Voltar
                </button>
                <button onClick={handleSubmit} disabled={loading || !form.name || !form.password}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm">
                  {loading && <Loader2 size={14} className="animate-spin"/>}
                  Criar conta grátis
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Sucesso */}
          {step === 3 && (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4"/>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Conta criada!</h2>
              <p className="text-sm text-gray-500">Você tem 14 dias de trial gratuito. Redirecionando para o dashboard...</p>
            </div>
          )}
        </div>

        {step < 3 && (
          <p className="text-center text-xs text-gray-500 mt-4">
            Já tem conta? <Link to="/login" className="text-blue-600 font-semibold hover:underline">Entrar</Link>
          </p>
        )}
      </div>
    </div>
  )
}
