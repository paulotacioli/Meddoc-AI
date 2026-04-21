// ── TRANSCRIPTION SERVICE ─────────────────────────────────────
// Transcreve arquivo de áudio completo usando Whisper API
// Usado no pipeline pós-consulta (não no WS em tempo real)

const OpenAI  = require('openai')
const { s3 }  = require('../../config/storage')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const logger  = require('../../shared/logger')
const fs      = require('fs')
const path    = require('path')
const os      = require('os')

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Transcreve áudio do S3 usando Whisper
 * Retorna { transcript: string, diarized: [{speaker, text}] }
 */
async function transcribe(audioS3Key) {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY não configurada — retornando transcrição mock')
    return {
      transcript: '[Transcrição não disponível — configure OPENAI_API_KEY]',
      diarized: []
    }
  }

  // Baixar áudio do S3 para arquivo temporário
  const tmpPath = path.join(os.tmpdir(), `meddoc_${Date.now()}.webm`)
  try {
    const cmd    = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: audioS3Key })
    const s3Res  = await s3.send(cmd)
    const chunks = []
    for await (const chunk of s3Res.Body) chunks.push(chunk)
    fs.writeFileSync(tmpPath, Buffer.concat(chunks))
  } catch (err) {
    logger.error(`Falha ao baixar áudio do S3 (${audioS3Key}):`, err.message)
    // Se S3 não estiver configurado, retornar mock para não quebrar o pipeline
    return {
      transcript: '[Áudio não disponível para transcrição]',
      diarized: []
    }
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file:            fs.createReadStream(tmpPath),
      model:           'whisper-1',
      language:        'pt',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const transcript = transcription.text
    // Diarização básica por segmentos (Whisper não diferencia falantes nativamente)
    const diarized = (transcription.segments || []).map(seg => ({
      speaker: 'Participante',
      text:    seg.text.trim(),
      start_ms: Math.round(seg.start * 1000),
      end_ms:   Math.round(seg.end   * 1000),
    }))

    return { transcript, diarized }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

module.exports = { transcribe }
