const jwt    = require('jsonwebtoken')
const { queryWithTenant } = require('../../config/database')
const logger = require('../../shared/logger')

const activeSessions = new Map()

module.exports = async function wsConsultaHandler(ws, req) {
  const { consultationId } = req.params
  let user = null
  let fullTranscript = ''

  ws.on('message', async (data) => {
    try {
      if (Buffer.isBuffer(data)) return // ignorar binários

      const msg = JSON.parse(data.toString())

      // ── Autenticação ──────────────────────────────────────
      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, process.env.JWT_SECRET)
          user = decoded

          const result = await queryWithTenant(user.clinicId,
            'SELECT id FROM consultations WHERE id=$1 AND clinic_id=$2 AND doctor_id=$3',
            [consultationId, user.clinicId, user.userId]
          )
          if (!result.rows.length) {
            ws.send(JSON.stringify({ type: 'error', message: 'Consulta não encontrada' }))
            ws.close()
            return
          }

          activeSessions.set(consultationId, { ws })
          ws.send(JSON.stringify({ type: 'auth_ok', consultationId }))
          logger.info(`WS conectado: consulta ${consultationId}`)
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Token inválido' }))
          ws.close()
        }
        return
      }

      if (!user) return

      // ── Texto transcrito pelo browser (Web Speech API) ────
      if (msg.type === 'transcript_text') {
        const text = (msg.text || '').trim()
        if (!text) return

        fullTranscript += ' ' + text
        logger.info(`Texto recebido: "${text}"`)

        // Salvar no banco incrementalmente
        await queryWithTenant(user.clinicId,
          `UPDATE consultations
           SET transcript_raw = COALESCE(transcript_raw, '') || $1
           WHERE id = $2`,
          [' ' + text, consultationId]
        )
        return
      }

      // ── Ping ──────────────────────────────────────────────
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      // ── Encerrar gravação ─────────────────────────────────
      if (msg.type === 'recording_ended') {
        logger.info(`Gravação encerrada. Transcrição acumulada: "${fullTranscript.trim()}"`)
        ws.send(JSON.stringify({ type: 'transcription_ready', consultationId }))
        return
      }

    } catch (err) {
      logger.error('WS message error:', err.message)
    }
  })

  ws.on('close', () => {
    activeSessions.delete(consultationId)
    logger.info(`WS desconectado: consulta ${consultationId}`)
  })

  ws.on('error', (err) => {
    logger.error(`WS error ${consultationId}:`, err.message)
    activeSessions.delete(consultationId)
  })
}

function emitToConsultation(consultationId, payload) {
  const session = activeSessions.get(consultationId)
  if (session?.ws.readyState === 1) {
    session.ws.send(JSON.stringify(payload))
  }
}

module.exports.emitToConsultation = emitToConsultation