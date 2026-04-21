// ── PÁGINA: Revisão e Aprovação do Prontuário ─────────────────
// Layout side-by-side: transcrição (esq) | editor de prontuário (dir)
// Ações: Aprovar, Editar seção, Regenerar seção, Assinar

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, Edit3, Save, X, ChevronDown, ChevronUp, Pill, FileSignature, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function Prontuario() {
  const { id: consultationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingField, setEditingField]   = useState(null);
  const [editValue, setEditValue]         = useState('');
  const [localFields, setLocalFields]     = useState(null);
  const [transcriptOpen, setTranscriptOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['prontuario', consultationId],
    queryFn: () => api.get(`/consultations/${consultationId}`).then(r => r.data),
    onSuccess: (d) => { if (!localFields) setLocalFields(d.prontuario?.fields); }
  });

  const prontuario   = data?.prontuario;
  const consultation = data?.consultation;
  const fields       = localFields || prontuario?.fields || {};

  // Regenerar seção
  const regenerate = useMutation({
    mutationFn: (sectionKey) => api.post(`/prontuario/${prontuario._id}/regenerate`, { sectionKey, consultationId }),
    onSuccess: (res, sectionKey) => {
      setLocalFields(prev => ({ ...prev, [sectionKey]: res.data.fields[sectionKey] }));
      toast.success('Seção regenerada');
    },
    onError: () => toast.error('Erro ao regenerar'),
  });

  // Aprovar prontuário
  const approve = useMutation({
    mutationFn: () => api.post(`/prontuario/${prontuario._id}/approve`, {
      consultationId,
      editedFields: localFields,
    }),
    onSuccess: () => {
      toast.success('Prontuário aprovado e salvo!');
      qc.invalidateQueries(['prontuario', consultationId]);
      setTimeout(() => navigate(`/pacientes/${consultation?.patient_id}`), 1000);
    },
    onError: () => toast.error('Erro ao aprovar'),
  });

  const startEdit = (key, value) => { setEditingField(key); setEditValue(value); };
  const saveEdit  = () => {
    setLocalFields(prev => ({ ...prev, [editingField]: editValue }));
    setEditingField(null);
  };

  const FIELD_LABELS = {
    subjetivo:       'Subjetivo (S)',
    objetivo:        'Objetivo (O)',
    avaliacao:       'Avaliação (A)',
    plano:           'Plano (P)',
    cid10:           'CID-10 Sugerido',
    queixa_principal:'Queixa Principal',
    hda:             'História da Doença Atual',
    antecedentes:    'Antecedentes Pessoais',
    historia_familiar:'História Familiar',
    revisao_sistemas:'Revisão de Sistemas',
  };

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 size={28} className="animate-spin text-blue-500" />
    </div>
  );

  const isApproved = prontuario?.status === 'approved' || prontuario?.status === 'signed';

  return (
    <div className="flex h-full overflow-hidden bg-white">

      {/* ── ESQUERDA: Transcrição ── */}
      <div className="w-2/5 border-r border-gray-100 flex flex-col overflow-hidden">
        <button
          onClick={() => setTranscriptOpen(o => !o)}
          className="px-5 py-3 border-b border-gray-100 flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider hover:bg-gray-50"
        >
          Transcrição original
          {transcriptOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {transcriptOpen && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
              {consultation?.transcript_raw || 'Transcrição não disponível'}
            </p>
          </div>
        )}
      </div>

      {/* ── DIREITA: Prontuário Editável ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Prontuário — {consultation?.patient_name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(consultation?.started_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>

          {!isApproved && (
            <button
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            >
              {approve.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Aprovar prontuário
            </button>
          )}

          {isApproved && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg text-sm font-semibold">
              <CheckCircle2 size={14} />
              Aprovado
            </div>
          )}
        </div>

        {/* Campos do prontuário */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {FIELD_LABELS[key] || key}
                </span>
                {!isApproved && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => regenerate.mutate(key)}
                      disabled={regenerate.isPending}
                      className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Regenerar com IA"
                    >
                      <RefreshCw size={13} className={regenerate.isPending ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => startEdit(key, value)}
                      className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Editar"
                    >
                      <Edit3 size={13} />
                    </button>
                  </div>
                )}
              </div>

              <div className="px-4 py-3">
                {editingField === key ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="w-full text-[13px] text-gray-800 leading-relaxed border border-blue-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                      rows={Math.max(3, editValue.split('\n').length)}
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md">
                        <Save size={11} /> Salvar
                      </button>
                      <button onClick={() => setEditingField(null)} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-md border border-gray-200">
                        <X size={11} /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</p>
                )}
              </div>
            </div>
          ))}

          {/* CID-10 sugeridos */}
          {prontuario?.cid10?.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">CID-10 Sugerido pela IA</span>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {prontuario.cid10.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                    <span className="text-xs font-bold text-blue-700">{c.code}</span>
                    <span className="text-xs text-blue-600">{c.description}</span>
                    <span className="text-xs text-blue-400">{Math.round(c.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medicamentos */}
          {prontuario?.medications?.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <Pill size={12} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Medicamentos Extraídos</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {prontuario.medications.map((med, i) => (
                  <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold text-gray-800">{med.name}</span>
                    {med.dose      && <span className="text-gray-500">{med.dose}</span>}
                    {med.frequency && <span className="text-gray-500">{med.frequency}</span>}
                    {med.duration  && <span className="text-gray-400">{med.duration}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
