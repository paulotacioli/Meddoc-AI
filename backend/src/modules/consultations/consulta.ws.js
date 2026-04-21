// ── WEBSOCKET: Transcrição ao vivo ────────────────────────────
// Recebe chunks de áudio do browser, envia para Whisper em streaming,
// retorna transcrição em tempo real e atualiza o prontuário progressivamente

const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const { queryWithTenant } = require('../../config/database');
const logger = require('../../shared/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Map de sessões ativas: consultationId → { ws, audioBuffer, segments }
const activeSessions = new Map();

module.exports = async function wsConsultaHandler(ws, req) {
  const { consultationId } = req.params;
  let user = null;

  // Buffer de áudio para acumular chunks
  let audioBuffer = Buffer.alloc(0);
  let chunkCount = 0;
  const CHUNK_THRESHOLD = 5; // Transcrever a cada N chunks (~5s de áudio)

  ws.on('message', async (data) => {
    try {
      // Primeira mensagem: autenticação
      if (typeof data === 'string') {
        const msg = JSON.parse(data);

        if (msg.type === 'auth') {
          const decoded = jwt.verify(msg.token, process.env.JWT_SECRET);
          user = decoded;

          // Verificar que a consulta pertence ao médico/clínica
          const result = await queryWithTenant(user.clinicId,
            'SELECT id, status, template_id FROM consultations WHERE id = $1 AND clinic_id = $2 AND doctor_id = $3',
            [consultationId, user.clinicId, user.userId]
          );
          if (!result.rows.length) {
            ws.send(JSON.stringify({ type: 'error', message: 'Consulta não encontrada' }));
            ws.close();
            return;
          }

          activeSessions.set(consultationId, { ws, audioBuffer, segments: [] });
          ws.send(JSON.stringify({ type: 'auth_ok', consultationId }));
          logger.info(`WS conectado: consulta ${consultationId}`);
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      // Dados binários: chunk de áudio WebM/Opus
      if (!user) { ws.send(JSON.stringify({ type: 'error', message: 'Não autenticado' })); return; }

      audioBuffer = Buffer.concat([audioBuffer, data]);
      chunkCount++;

      // Transcrever a cada CHUNK_THRESHOLD chunks acumulados
      if (chunkCount >= CHUNK_THRESHOLD) {
        const bufferToTranscribe = audioBuffer;
        audioBuffer = Buffer.alloc(0);
        chunkCount = 0;

        // Não bloquear: transcrever em background
        transcribeChunk(bufferToTranscribe, consultationId, ws, user).catch(logger.error);
      }

    } catch (err) {
      logger.error('WS message error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Erro interno' }));
    }
  });

  ws.on('close', () => {
    activeSessions.delete(consultationId);
    logger.info(`WS desconectado: consulta ${consultationId}`);
  });

  ws.on('error', (err) => {
    logger.error(`WS error consulta ${consultationId}:`, err);
    activeSessions.delete(consultationId);
  });
};

async function transcribeChunk(audioBuffer, consultationId, ws, user) {
  try {
    // Criar File-like object para a API Whisper
    const { Readable } = require('stream');
    const readable = new Readable();
    readable.push(audioBuffer);
    readable.push(null);
    readable.path = 'chunk.webm'; // Whisper precisa da extensão

    const transcription = await openai.audio.transcriptions.create({
      file: readable,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    const segment = {
      text: transcription.text,
      words: transcription.words || [],
      timestamp: Date.now(),
    };

    // Enviar transcrição parcial ao frontend
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify({
        type: 'transcript_segment',
        consultationId,
        segment: {
          text: segment.text,
          timestamp: segment.timestamp,
        }
      }));
    }

    // Acumular no banco (não bloquear)
    appendTranscriptSegment(consultationId, segment, user.clinicId).catch(logger.error);

  } catch (err) {
    logger.error(`Erro transcrevendo chunk de ${consultationId}:`, err);
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'transcript_error', message: 'Falha na transcrição deste trecho' }));
    }
  }
}

async function appendTranscriptSegment(consultationId, segment, clinicId) {
  // Append ao transcript_raw de forma eficiente
  await queryWithTenant(clinicId,
    `UPDATE consultations
     SET transcript_raw = COALESCE(transcript_raw, '') || $1
     WHERE id = $2`,
    [' ' + segment.text, consultationId]
  );
}

// Função pública para enviar mensagens a uma consulta ativa
function emitToConsultation(consultationId, payload) {
  const session = activeSessions.get(consultationId);
  if (session?.ws.readyState === 1) {
    session.ws.send(JSON.stringify(payload));
  }
}

module.exports.emitToConsultation = emitToConsultation;
