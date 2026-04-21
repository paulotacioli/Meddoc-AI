// ── PÁGINA: Consulta Ativa ────────────────────────────────────
// Tela principal de gravação e transcrição ao vivo
// Layout: esquerda = transcrição | direita = dados do paciente

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Mic, MicOff, Square, Clock, User, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConsulta } from '../hooks/useConsulta';
import api from '../services/api';
import { formatDuration } from '../utils/format';

const STATUS_LABEL = {
  idle:         { label: 'Pronto',             color: 'text-gray-400' },
  connecting:   { label: 'Conectando...',       color: 'text-amber-500' },
  recording:    { label: 'Gravando',            color: 'text-red-500' },
  transcribing: { label: 'Transcrevendo...',    color: 'text-blue-500' },
  generating:   { label: 'Gerando prontuário...', color: 'text-purple-500' },
  done:         { label: 'Prontuário pronto!',  color: 'text-green-500' },
  error:        { label: 'Erro',                color: 'text-red-600' },
};

export default function ConsultaAtiva() {
  const { id: consultationId } = useParams();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);

  const { status, transcript, segments, prontuarioReady, prontuarioId, startRecording, stopRecording } = useConsulta(consultationId);

  // Dados da consulta
  const { data: consulta } = useQuery({
    queryKey: ['consulta', consultationId],
    queryFn: () => api.get(`/consultations/${consultationId}`).then(r => r.data),
  });

  // Mutation: encerrar consulta
  const endConsulta = useMutation({
    mutationFn: () => api.post(`/consultations/${consultationId}/end`, {
      audioS3Key: consulta?.consultation?.audio_s3_key
    }),
    onSuccess: () => {
      stopRecording();
      toast.success('Consulta encerrada. Gerando prontuário...');
    },
    onError: () => toast.error('Erro ao encerrar consulta'),
  });

  // Timer
  useEffect(() => {
    if (status === 'recording' && !startTime) setStartTime(Date.now());
    if (status === 'recording') {
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
      return () => clearInterval(t);
    }
  }, [status, startTime]);

  // Redirecionar ao prontuário quando pronto
  useEffect(() => {
    if (prontuarioReady && prontuarioId) {
      toast.success('Prontuário gerado!');
      setTimeout(() => navigate(`/prontuario/${consultationId}`), 1500);
    }
  }, [prontuarioReady, prontuarioId, consultationId, navigate]);

  const handleStart = async () => {
    try {
      await startRecording();
    } catch (err) {
      toast.error('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  const handleStop = () => {
    if (!window.confirm('Encerrar a consulta e gerar o prontuário?')) return;
    endConsulta.mutate();
  };

  const patient   = consulta?.consultation;
  const statusInfo = STATUS_LABEL[status] || STATUS_LABEL.idle;

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── HEADER DA CONSULTA ── */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className={`text-sm font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
        </div>

        {status === 'recording' && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 font-mono">
            <Clock size={14} />
            {formatDuration(elapsed)}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {patient && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User size={15} />
              <span className="font-medium">{patient.patient_name}</span>
            </div>
          )}

          {status === 'idle' && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
            >
              <Mic size={16} />
              Iniciar gravação
            </button>
          )}

          {status === 'recording' && (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
            >
              <Square size={14} fill="white" />
              Encerrar consulta
            </button>
          )}

          {(status === 'transcribing' || status === 'generating') && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
              <Loader2 size={14} className="animate-spin" />
              {statusInfo.label}
            </div>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
              <CheckCircle2 size={14} />
              Redirecionando...
            </div>
          )}
        </div>
      </div>

      {/* ── CORPO: TRANSCRIÇÃO + INFO PACIENTE ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Esquerda: Transcrição */}
        <div className="flex-1 flex flex-col border-r border-gray-100 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Transcrição em tempo real</span>
            {segments.length > 0 && (
              <span className="text-xs text-gray-400">{segments.length} segmentos</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {status === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                  <Mic size={28} className="text-gray-300" />
                </div>
                <p className="text-gray-400 text-sm">Clique em "Iniciar gravação" para começar</p>
                <p className="text-gray-300 text-xs mt-1">O texto da consulta aparecerá aqui em tempo real</p>
              </div>
            )}

            {status === 'recording' && segments.length === 0 && (
              <div className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 bg-blue-400 rounded-full animate-bounce"
                      style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                Aguardando fala...
              </div>
            )}

            {segments.map((seg, i) => (
              <div key={i} className="mb-3 leading-relaxed">
                <span className="text-gray-800 text-[15px]">{seg.text}</span>
              </div>
            ))}

            {status === 'recording' && segments.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Direita: Dados do paciente + status pipeline */}
        <div className="w-80 flex flex-col overflow-y-auto">
          <div className="px-5 py-3 border-b border-gray-50">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Paciente</span>
          </div>

          {patient && (
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {patient.patient_name?.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{patient.patient_name}</div>
                  <div className="text-xs text-gray-400">{patient.doctor_name}</div>
                </div>
              </div>
            </div>
          )}

          {/* Pipeline status */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline</p>
            {[
              { key: 'recording',    label: 'Gravação de áudio',    icon: Mic },
              { key: 'transcribing', label: 'Transcrição Whisper',  icon: FileText },
              { key: 'generating',   label: 'Geração de prontuário', icon: FileText },
              { key: 'done',         label: 'Pronto para revisão',  icon: CheckCircle2 },
            ].map((step, i) => {
              const stages = ['idle','connecting','recording','transcribing','generating','done','error'];
              const currentIdx = stages.indexOf(status);
              const stepIdx    = stages.indexOf(step.key);
              const isDone     = currentIdx > stepIdx;
              const isActive   = status === step.key;
              const Icon = step.icon;

              return (
                <div key={step.key} className={`flex items-center gap-3 py-2 text-sm ${isDone ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-300'}`}>
                  {isActive ? <Loader2 size={14} className="animate-spin" /> : isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  <span className={isDone || isActive ? 'font-medium' : ''}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
