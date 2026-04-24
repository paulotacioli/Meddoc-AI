// ── JOB: Limpeza de áudio (LGPD) ─────────────────────────────
// Remove áudios do S3 que ultrapassaram o tempo de retenção configurado
// Executa a cada hora

const cron = require('node-cron');
const { query } = require('../config/database');
const { deleteS3Object } = require('../config/storage');
const logger = require('../shared/logger');

cron.schedule('0 * * * *', async () => {
  logger.info('Job: limpeza de áudio iniciada');
  try {
    const expired = await query(
      `SELECT id, audio_s3_key, clinic_id
       FROM consultations
       WHERE audio_s3_key IS NOT NULL
         AND audio_expires_at < NOW()
         AND audio_s3_key != ''
       LIMIT 100`
    );

    for (const row of expired.rows) {
      try {
        await deleteS3Object(row.audio_s3_key);
        await query(
          `UPDATE consultations
           SET audio_s3_key = NULL, audio_expires_at = NULL
           WHERE id = $1`,
          [row.id]
        );
        logger.info(`Áudio removido: ${row.audio_s3_key} (consulta ${row.id})`);
      } catch (err) {
        logger.error(`Falha ao remover áudio ${row.audio_s3_key}:`, err);
      }
    }

    if (expired.rows.length > 0)
      logger.info(`Job: ${expired.rows.length} áudios removidos`);
  } catch (err) {
    logger.error('Job audioCleanup falhou:', err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── JOB: Retry de Webhooks ────────────────────────────────────
// Reprocessa webhooks que falharam, com backoff exponencial

cron.schedule('*/5 * * * *', async () => {
  try {
    const pending = await query(
      `SELECT * FROM webhook_deliveries
       WHERE status = 'failed' AND attempts < 5
         AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '5 minutes' * attempts)
       ORDER BY created_at ASC LIMIT 20`
    );

    for (const webhook of pending.rows) {
      try {
        const axios = require('axios');
        const response = await axios.post(webhook.target_url, webhook.payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Pronova-Event': webhook.event_type,
            'X-Pronova-Delivery': webhook.id,
          },
          timeout: 10000,
        });

        await query(
          `UPDATE webhook_deliveries
           SET status='delivered', attempts=attempts+1, last_attempt_at=NOW(), response_code=$1
           WHERE id=$2`,
          [response.status, webhook.id]
        );
      } catch (err) {
        const newAttempts = webhook.attempts + 1;
        const newStatus = newAttempts >= 5 ? 'failed' : 'failed';
        await query(
          `UPDATE webhook_deliveries
           SET attempts=$1, last_attempt_at=NOW(), response_code=$2, status=$3
           WHERE id=$4`,
          [newAttempts, err.response?.status || null, newStatus, webhook.id]
        );
      }
    }
  } catch (err) {
    logger.error('Job webhookRetry falhou:', err);
  }
});

module.exports = {}; // jobs auto-registrados
