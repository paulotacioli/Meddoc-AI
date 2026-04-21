// ── PÁGINA: Dashboard ────────────────────────────────────────
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Mic, Clock, CheckCircle2, AlertCircle, Users, BarChart2, Plus, Search, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showNewConsulta, setShowNewConsulta] = useState(false);

  // KPIs do dashboard
  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data),
    refetchInterval: 30_000,
  });

  // Série temporal (gráfico)
  const { data: timeseries } = useQuery({
    queryKey: ['timeseries'],
    queryFn: () => api.get('/reports/timeseries?days=14').then(r => r.data),
  });

  // Templates disponíveis
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/clinics/templates').then(r => r.data),
  });

  // Busca de pacientes
  const { data: patients } = useQuery({
    queryKey: ['patients-search', patientSearch],
    queryFn: () => api.get(`/patients?search=${patientSearch}&limit=8`).then(r => r.data),
    enabled: patientSearch.length >= 2,
  });

  // Iniciar nova consulta
  const startConsulta = useMutation({
    mutationFn: () => api.post('/consultations/start', {
      patientId: selectedPatient.id,
      templateId: selectedTemplate || undefined,
    }),
    onSuccess: (res) => {
      toast.success('Consulta iniciada!');
      navigate(`/consulta/${res.data.consultation.id}`);
    },
    onError: (err) => {
      const msg = err.response?.data;
      if (msg?.code === 'CONSENT_REQUIRED')
        toast.error('Registre o consentimento do paciente antes de iniciar a consulta');
      else
        toast.error('Erro ao iniciar consulta');
    },
  });

  const today = dash?.today;
  const avgTime = dash?.avgTime;
  const pending = dash?.pendingReview || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── SAUDAÇÃO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bom dia, Dr(a). {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => setShowNewConsulta(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors"
        >
          <Plus size={16} />
          Nova consulta
        </button>
      </div>

      {/* ── CARDS KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Consultas hoje',        value: today?.total          ?? '—', icon: Mic,          color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Aprovados',             value: today?.approved       ?? '—', icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Aguardando revisão',    value: today?.pending_review ?? '—', icon: AlertCircle,   color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'Tempo médio consulta',  value: avgTime?.avg_duration_sec ? `${Math.round(avgTime.avg_duration_sec/60)}min` : '—',
            icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={card.color} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── GRÁFICO ── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">Consultas nos últimos 14 dias</h3>
            <BarChart2 size={16} className="text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={timeseries?.data || []}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} width={24} />
              <Tooltip formatter={(v) => [v, 'Consultas']} labelFormatter={l => `Dia ${l.slice(5)}`} />
              <Line type="monotone" dataKey="total" stroke="#1A56A0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="approved" stroke="#0F6E56" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-4 h-0.5 bg-blue-600 rounded"/><span>Total</span></div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-4 h-0.5 bg-teal-600 rounded" style={{borderTop:'2px dashed #0F6E56',background:'none'}}/><span>Aprovados</span></div>
          </div>
        </div>

        {/* ── PENDENTES DE REVISÃO ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">Pendentes de revisão</h3>
            {pending.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={28} className="text-green-400 mb-2" />
              <p className="text-xs text-gray-400">Nenhum prontuário pendente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/prontuario/${item.id}`)}
                  className="w-full text-left px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                >
                  <div className="font-medium text-gray-900 text-sm">{item.patient_name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{item.doctor_name}</span>
                    <span className="text-xs text-amber-600">Revisar →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: Nova Consulta ── */}
      {showNewConsulta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Nova consulta</h2>

            <div className="space-y-4">
              {/* Busca de paciente */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Paciente</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
                    placeholder="Buscar por nome ou CPF..."
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                {selectedPatient && (
                  <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">{selectedPatient.name}</span>
                    <button onClick={() => setSelectedPatient(null)} className="text-blue-400 hover:text-blue-600"><X size={13}/></button>
                  </div>
                )}
                {!selectedPatient && patients?.data?.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    {patients.data.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPatient(p); setPatientSearch(''); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm border-b last:border-0 border-gray-100"
                      >
                        <span className="font-medium text-gray-900">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Template */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Template de prontuário</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">SOAP Padrão</option>
                  {templates?.data?.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewConsulta(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => startConsulta.mutate()}
                disabled={!selectedPatient || startConsulta.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {startConsulta.isPending ? <Loader2 size={14} className="animate-spin"/> : <Mic size={14}/>}
                Iniciar consulta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
