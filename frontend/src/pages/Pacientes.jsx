// ── PÁGINA: Pacientes ─────────────────────────────────────────
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, User, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function Pacientes() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', cpf: '', birth_date: '', gender: '', email: '', phone: '', health_plan: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['patients', search],
    queryFn: () => api.get(`/patients?search=${search}&limit=50`).then(r => r.data),
    keepPreviousData: true,
  })

  const create = useMutation({
    mutationFn: () => api.post('/patients', form),
    onSuccess: () => {
      toast.success('Paciente cadastrado!')
      setShowNew(false)
      setForm({ name: '', cpf: '', birth_date: '', gender: '', email: '', phone: '', health_plan: '' })
      qc.invalidateQueries(['patients'])
    },
    onError: () => toast.error('Erro ao cadastrar paciente'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const patients = data?.data || []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors">
          <Plus size={16}/>Novo paciente
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou CPF..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"/>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-blue-500"/></div>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="font-medium">Nenhum paciente encontrado</p>
          <p className="text-sm mt-1">Cadastre o primeiro paciente clicando em "Novo paciente"</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {patients.map((p, i) => (
            <button key={p.id} onClick={() => navigate(`/pacientes/${p.id}`)}
              className={`w-full flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors text-left ${i > 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm mr-3 flex-shrink-0">
                {p.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{p.email || p.phone || 'Sem contato registrado'}</div>
              </div>
              {p.health_plan && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full ml-3">{p.health_plan}</span>
              )}
              <span className="text-gray-300 ml-3">›</span>
            </button>
          ))}
        </div>
      )}

      {/* Modal novo paciente */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Novo paciente</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>

            <div className="space-y-3">
              {[
                { key: 'name',        label: 'Nome completo *',  required: true },
                { key: 'cpf',         label: 'CPF',              placeholder: '000.000.000-00' },
                { key: 'birth_date',  label: 'Data de nascimento', type: 'date' },
                { key: 'email',       label: 'E-mail',           type: 'email' },
                { key: 'phone',       label: 'Telefone',         placeholder: '(11) 99999-9999' },
                { key: 'health_plan', label: 'Convênio' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder} required={f.required}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Sexo</label>
                <select value={form.gender} onChange={e => set('gender', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Não informado</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="O">Outro</option>
                </select>
              </div>

              {/* Consentimento LGPD */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3 mt-2">
                <input type="checkbox" id="consent" onChange={e => set('consent_given', e.target.checked)} className="mt-0.5"/>
                <label htmlFor="consent" className="text-xs text-blue-700">
                  Paciente consentiu com a gravação e processamento de dados de saúde conforme LGPD Art. 11.
                  <strong> Obrigatório para iniciar consultas.</strong>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowNew(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium text-sm">
                Cancelar
              </button>
              <button onClick={() => create.mutate()} disabled={!form.name || create.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm">
                {create.isPending && <Loader2 size={14} className="animate-spin"/>}
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
