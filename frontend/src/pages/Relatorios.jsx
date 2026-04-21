// ── PÁGINA: Relatórios ───────────────────────────────────────
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, Calendar } from 'lucide-react';
import api from '../services/api';

export default function Relatorios() {
  const [period, setPeriod] = useState(30);

  const { data: production } = useQuery({
    queryKey: ['production', period],
    queryFn: () => api.get(`/reports/production?startDate=${getStartDate(period)}`).then(r => r.data),
  });

  const { data: aiUsage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get('/reports/ai-usage').then(r => r.data),
  });

  const handleExport = async (format) => {
    const start = getStartDate(period);
    const res = await api.get(`/reports/export?format=${format}&startDate=${start}`, {
      responseType: format === 'csv' ? 'blob' : 'json'
    });
    if (format === 'csv') {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `relatorio_${start}.csv`; a.click();
    }
  };

  function getStartDate(days) {
    return new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  }

  const doctors = production?.data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {[7,30,90].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${period === d ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => handleExport('csv')}
            className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            <Download size={14}/> Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs de IA */}
      {aiUsage && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Prontuários gerados',    value: aiUsage.total_generated },
            { label: 'Aprovados sem edição',   value: aiUsage.approved_without_edit },
            { label: 'Taxa sem edição',        value: `${aiUsage.approval_no_edit_pct}%` },
            { label: 'Regenerações solicitadas', value: aiUsage.regenerations },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="text-2xl font-bold text-gray-900">{k.value ?? '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico de produção por médico */}
      {doctors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Produção por médico (últimos {period} dias)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={doctors} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="doctor_name" type="category" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [v, 'Consultas']} />
              <Bar dataKey="total_consultations" radius={[0,4,4,0]}>
                {doctors.map((_, i) => <Cell key={i} fill={i === 0 ? '#1A56A0' : '#93B8E5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela detalhada */}
      {doctors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Médico', 'Especialidade', 'Total', 'Aprovados', 'Tempo médio', 'Edições IA'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doctors.map((d, i) => (
                <tr key={d.doctor_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.doctor_name}</td>
                  <td className="px-4 py-3 text-gray-500">{d.specialty || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-blue-600">{d.total_consultations}</td>
                  <td className="px-4 py-3 text-green-600">{d.approved}</td>
                  <td className="px-4 py-3 text-gray-600">{d.avg_duration_sec ? `${Math.round(d.avg_duration_sec/60)}min` : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{d.times_edited ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
