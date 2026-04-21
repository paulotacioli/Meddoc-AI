// ── webhook.service.js ────────────────────────────────────────
const { query } = require('../../config/database')
const logger = require('../../shared/logger')

async function triggerWebhook({ clinicId, event, payload }) {
  try {
    const configRes = await query(
      'SELECT webhook_url FROM integration_configs WHERE clinic_id=$1 AND is_active=true AND webhook_url IS NOT NULL',
      [clinicId]
    )
    if (!configRes.rows.length) return

    const url = configRes.rows[0].webhook_url
    await query(
      `INSERT INTO webhook_deliveries (clinic_id, event_type, payload, target_url, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [clinicId, event, JSON.stringify(payload), url]
    )
    logger.info(`Webhook enfileirado: ${event} → ${url}`)
  } catch (err) {
    logger.error('triggerWebhook error:', err.message)
  }
}

module.exports = { triggerWebhook }
