// ── TRANSCRIPTION SERVICE ─────────────────────────────────────
const OpenAI  = require('openai')
const { s3 }  = require('../../config/storage')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const logger  = require('../../shared/logger')
const fs      = require('fs')
const path    = require('path')
const os      = require('os')

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function transcribe(audioS3Key) {
  // Sem S3 configurado — usa transcrição já feita ao vivo pelo WebSocket
  if (!process.env.AWS_ACCESS_KEY_ID || !audioS3Key) {
    logger.info('S3 não configurado — usando transcrição do WebSocket')
    return { transcript: '', diarized: [] }
  }

  const tmpPath = path.join(os.tmpdir(), `pronova_${Date.now()}.webm`)

  try {
    const cmd   = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: audioS3Key })
    const s3Res = await s3.send(cmd)
    const chunks = []
    for await (const chunk of s3Res.Body) chunks.push(chunk)
    fs.writeFileSync(tmpPath, Buffer.concat(chunks))
  } catch (err) {
    logger.warn(`S3 indisponível (${err.message}) — usando transcrição do WebSocket`)
    return { transcript: '', diarized: [] }
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file:            fs.createReadStream(tmpPath),
      model:           'whisper-1',
      language:        'pt',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })
    return {
      transcript: transcription.text,
      diarized: (transcription.segments || []).map(seg => ({
        speaker:  'Participante',
        text:     seg.text.trim(),
        start_ms: Math.round(seg.start * 1000),
        end_ms:   Math.round(seg.end   * 1000),
      }))
    }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

module.exports = { transcribe }