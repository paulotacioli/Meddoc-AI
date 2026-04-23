// ── PÁGINA: Detalhe do Paciente ───────────────────────────────
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Mic, FileText, Calendar, Loader2 } from 'lucide-react'
import api from '../services/api'

export default function PacienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`).then(r => r.data),
  })

  const { data: consultations } = useQuery({
    queryKey: ['patient-consultations', id],
    queryFn: () => api.get(`/consultations?patientId=${id}&limit=20`).then(r => r.data),
  })

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 size={28} className="animate-spin text-blue-500"/>
    </div>
  )

  const patient = data?.patient
  const history = consultations?.data || []

  const STATUS_COLORS = {
    approved: 'bg-green-100 text-green-700',
    review:   'bg-amber-100 text-amber-700',
    signed:   'bg-blue-100 text-blue-700',
    recording:'bg-red-100 text-red-600',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/pacientes')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <ArrowLeft size={15}/> Voltar a pacientes
      </button>

      {/* Header do paciente */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl flex-shrink-0">
          {patient?.name?.charAt(0)}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{patient?.name}</h1>
          <div className="flex flex-col gap-1 mt-3">
            {[
              { label: 'E-mail',     value: patient?.email },
              { label: 'Telefone',   value: patient?.phone },
              { label: 'Nascimento', value: patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : null },
              { label: 'Convênio',   value: patient?.health_plan },
            ].filter(f => f.value).map(f => (
              <div key={f.label} className="flex items-baseline gap-2 min-w-0">
                <span className="text-xs text-gray-400 font-medium w-20 flex-shrink-0">{f.label}</span>
                <span className="text-sm text-gray-800 truncate" title={f.value}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
          <Mic size={14}/> Nova consulta
        </button>
      </div>

      {/* Histórico de consultas */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Histórico de consultas</h2>
        {history.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">Nenhuma consulta registrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(c => (
              <button key={c.id} onClick={() => navigate(`/prontuario/${c.id}`)}
                className="w-full bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center gap-4 hover:border-blue-200 hover:shadow-sm transition-all text-left">
                <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} className="text-gray-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {new Date(c.started_at).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">Dr(a). {c.doctor_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.duration_sec && (
                    <span className="text-xs text-gray-400">{Math.round(c.duration_sec/60)}min</span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500'}`}>
                    {c.status === 'approved' ? 'Aprovado' : c.status === 'review' ? 'Revisão' : c.status === 'signed' ? 'Assinado' : c.status}
                  </span>
                  <span className="text-gray-300">›</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
