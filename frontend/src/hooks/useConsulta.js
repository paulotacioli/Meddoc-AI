import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useConsulta(consultationId) {
  const [status, setStatus]                   = useState('idle');
  const [transcript, setTranscript]           = useState('');
  const [segments, setSegments]               = useState([]);
  const [prontuarioReady, setProntuarioReady] = useState(false);
  const [prontuarioId, setProntuarioId]       = useState(null);
  const [wsConnected, setWsConnected]         = useState(false);

  const wsRef          = useRef(null);
  const recognitionRef = useRef(null);
  const token = useAuthStore(s => s.accessToken);
  const user  = useAuthStore(s => s.user);

  // ── CONECTAR WEBSOCKET ──────────────────────────────────────
  const connectWS = useCallback(() => {
    return new Promise((resolve, reject) => {

      // Garantir que o token existe antes de conectar
      const currentToken = useAuthStore.getState().accessToken;
      if (!currentToken) {
        reject(new Error('Sessão expirada. Faça login novamente.'));
        return;
      }

      const ws = new WebSocket(`${WS_URL}/ws/consulta/${consultationId}`);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Tentar renovar o token antes de autenticar
        let currentToken = useAuthStore.getState().accessToken
        try {
          const freshToken = await useAuthStore.getState().refreshAccess()
          if (freshToken) currentToken = freshToken
        } catch {}
        ws.send(JSON.stringify({ type: 'auth', token: currentToken }))
      }

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case 'auth_ok':
            setWsConnected(true);
            setStatus('recording');
            resolve();
            break;
          case 'transcription_ready':
            setStatus('generating');
            break;
          case 'prontuario_ready':
            setProntuarioId(msg.prontuarioId);
            setProntuarioReady(true);
            setStatus('done');
            break;
          case 'error':
            setStatus('error');
            reject(new Error(msg.message));
            break;
        }
      };

      ws.onclose = () => setWsConnected(false);
      ws.onerror = (err) => { setStatus('error'); reject(err); };
    });
  }, [consultationId]);

  // ── INICIAR WEB SPEECH API ──────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta transcrição em tempo real. Use o Google Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang           = 'pt-BR';
    recognition.continuous     = true;   // não para após silêncio
    recognition.interimResults = true;   // mostra texto enquanto fala
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          finalTranscript += ' ' + text;

          // Atualizar estado
          setSegments(prev => [...prev, { text, timestamp: Date.now() }]);
          setTranscript(prev => prev + ' ' + text);

          // Enviar ao backend via WebSocket
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'transcript_text',
              text,
              consultationId,
            }));
          }
        } else {
          interimText += result[0].transcript;
        }
      }
    };

    recognition.onerror = (event) => {
      // Ignorar erros de "no-speech" — acontece em silêncio
      if (event.error === 'no-speech') return;
      console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      // Reiniciar automaticamente se ainda estiver gravando
      if (recognitionRef.current && status === 'recording') {
        try { recognition.start(); } catch {}
      }
    };

    recognition.start();
  }, [consultationId, status]);

  // ── INICIAR CONSULTA ────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setStatus('connecting');
      await connectWS();
      startSpeechRecognition();
    } catch (err) {
      setStatus('error');
      throw err;
    }
  }, [connectWS, startSpeechRecognition]);

  // ── ENCERRAR CONSULTA ───────────────────────────────────────
  const stopRecording = useCallback(() => {
    // Parar reconhecimento de fala
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // evitar restart automático
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    setStatus('transcribing');

    // Avisar backend que a gravação encerrou
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'recording_ended' }));
    }
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch {}
      }
      wsRef.current?.close();
    };
  }, []);

  // Keepalive ping
  useEffect(() => {
    if (!wsConnected) return;
    const ping = setInterval(() => {
      wsRef.current?.send(JSON.stringify({ type: 'ping' }));
    }, 20_000);
    return () => clearInterval(ping);
  }, [wsConnected]);

  return {
    status, transcript, segments,
    wsConnected, prontuarioReady, prontuarioId,
    startRecording, stopRecording,
  };
}