// ── useConsulta hook ──────────────────────────────────────────
// Gerencia: gravação de áudio, envio via WS, recebimento de transcrição ao vivo

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const CHUNK_INTERVAL_MS = 2500; // enviar chunk de áudio a cada 2.5s

export function useConsulta(consultationId) {
  const [status, setStatus]             = useState('idle'); // idle | connecting | recording | transcribing | done | error
  const [transcript, setTranscript]     = useState('');
  const [segments, setSegments]         = useState([]);
  const [prontuarioReady, setProntuarioReady] = useState(false);
  const [prontuarioId, setProntuarioId] = useState(null);
  const [wsConnected, setWsConnected]   = useState(false);

  const wsRef           = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef       = useRef(null);
  const chunkIntervalRef = useRef(null);
  const audioChunksRef  = useRef([]);

  const token = useAuthStore(s => s.accessToken);

  // ── CONECTAR WEBSOCKET ──────────────────────────────────────
  const connectWS = useCallback(() => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/ws/consulta/${consultationId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Autenticar
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);

        switch (msg.type) {
          case 'auth_ok':
            setWsConnected(true);
            setStatus('recording');
            resolve();
            break;

          case 'transcript_segment':
            setSegments(prev => [...prev, msg.segment]);
            setTranscript(prev => prev + ' ' + msg.segment.text);
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

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = (err) => {
        setStatus('error');
        reject(err);
      };
    });
  }, [consultationId, token]);

  // ── INICIAR GRAVAÇÃO ────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setStatus('connecting');

      // Solicitar microfone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
      });
      streamRef.current = stream;

      // Conectar WS e autenticar
      await connectWS();

      // Configurar MediaRecorder para WebM/Opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          audioChunksRef.current.push(evt.data);
        }
      };

      mediaRecorder.start(100); // coleta a cada 100ms

      // Enviar chunks ao WS a cada CHUNK_INTERVAL_MS
      chunkIntervalRef.current = setInterval(() => {
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        blob.arrayBuffer().then(buf => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(buf);
          }
        });
      }, CHUNK_INTERVAL_MS);

    } catch (err) {
      setStatus('error');
      throw err;
    }
  }, [connectWS]);

  // ── ENCERRAR GRAVAÇÃO ───────────────────────────────────────
  const stopRecording = useCallback(() => {
    clearInterval(chunkIntervalRef.current);

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }

    // Parar tracks de áudio
    streamRef.current?.getTracks().forEach(t => t.stop());

    setStatus('transcribing');

    // Enviar sinal de fim ao WS
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'recording_ended' }));
    }
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      clearInterval(chunkIntervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
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
    status,
    transcript,
    segments,
    wsConnected,
    prontuarioReady,
    prontuarioId,
    startRecording,
    stopRecording,
  };
}
