// ── webhook.service.js ────────────────────────────────────────
const axios  = require('axios')
const crypto = require('crypto')
const { query } = require('../../config/database')
const logger = require('../../shared/logger')

async function triggerWebhook({ clinicId, event, payload }) {
  try {
    const configRes = await query(
      `SELECT webhook_url, webhook_secret
       FROM integration_configs
       WHERE clinic_id=$1 AND is_active=true AND webhook_url IS NOT NULL`,
      [clinicId]
    )
    if (!configRes.rows.length) return

    const { webhook_url: url, webhook_secret: secret } = configRes.rows[0]
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })

    const headers = { 'Content-Type': 'application/json' }
    if (secret) {
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
      headers['X-Pronova-Signature'] = `sha256=${sig}`
    }

    // Insert delivery record
    const deliveryRes = await query(
      `INSERT INTO webhook_deliveries (clinic_id, event_type, payload, target_url, status)
       VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
      [clinicId, event, body, url]
    )
    const deliveryId = deliveryRes.rows[0].id

    // Send immediately (fire-and-forget so the caller isn't blocked)
    setImmediate(() => _deliver({ deliveryId, url, body, headers }))

    logger.info(`Webhook enfileirado: ${event} → ${url}`)
  } catch (err) {
    logger.error('triggerWebhook error:', err.message)
  }
}

async function _deliver({ deliveryId, url, body, headers }) {
  let status = 'failed'
  let responseCode = null
  try {
    const res = await axios.post(url, JSON.parse(body), { headers, timeout: 10_000 })
    responseCode = res.status
    status = res.status >= 200 && res.status < 300 ? 'delivered' : 'failed'
  } catch (err) {
    responseCode = err.response?.status || null
    logger.error(`Webhook delivery ${deliveryId} falhou: ${err.message}`)
  }

  await query(
    `UPDATE webhook_deliveries
     SET status=$1, response_code=$2, attempts=attempts+1, last_attempt_at=NOW()
     WHERE id=$3`,
    [status, responseCode, deliveryId]
  ).catch(e => logger.error('webhook status update error:', e.message))
}

module.exports = { triggerWebhook }
