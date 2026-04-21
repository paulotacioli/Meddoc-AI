// ── INTEGRATIONS ROUTES ───────────────────────────────────────
const router = require('express').Router()
const { query, queryWithTenant } = require('../../config/database')
const { authenticate, requireRole } = require('../../middleware/auth')
const { encrypt, decrypt } = require('../../shared/crypto')
const { syncToHIS } = require('./integrations.service')
const logger = require('../../shared/logger')

// Obter configuração atual
router.get('/config', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT his_type, base_url, fhir_server, webhook_url, is_active, last_sync_at, config
       FROM integration_configs WHERE clinic_id = $1`,
      [req.user.clinicId]
    )
    res.json(result.rows[0] || null)
  } catch (err) { next(err) }
})

// Salvar / atualizar configuração
router.put('/config', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const { his_type, base_url, fhir_server, webhook_url, api_key } = req.body

    const existing = await query(
      'SELECT id, api_key_enc FROM integration_configs WHERE clinic_id=$1', [req.user.clinicId]
    )

    // Só re-criptografa se uma nova chave foi fornecida
    const apiKeyEnc = api_key
      ? encrypt(api_key)
      : existing.rows[0]?.api_key_enc || null

    if (existing.rows.length) {
      await query(
        `UPDATE integration_configs
         SET his_type=$1, base_url=$2, fhir_server=$3, webhook_url=$4, api_key_enc=$5, updated_at=NOW()
         WHERE clinic_id=$6`,
        [his_type, base_url || null, fhir_server || null, webhook_url || null, apiKeyEnc, req.user.clinicId]
      )
    } else {
      await query(
        `INSERT INTO integration_configs (clinic_id, his_type, base_url, fhir_server, webhook_url, api_key_enc)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.user.clinicId, his_type, base_url || null, fhir_server || null, webhook_url || null, apiKeyEnc]
      )
    }
    res.json({ message: 'Integração salva' })
  } catch (err) { next(err) }
})

// Testar conexão
router.post('/test', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM integration_configs WHERE clinic_id=$1', [req.user.clinicId]
    )
    if (!result.rows.length)
      return res.status(400).json({ error: 'Nenhuma integração configurada' })

    const config  = result.rows[0]
    const apiKey  = config.api_key_enc ? decrypt(config.api_key_enc) : ''
    const axios   = require('axios')

    // Teste simples: GET no base_url ou fhir_server/metadata
    const testUrl = config.fhir_server
      ? `${config.fhir_server}/metadata`
      : `${config.base_url}/health`

    await axios.get(testUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 8000,
    })

    res.json({ message: 'Conexão estabelecida com sucesso' })
  } catch (err) {
    res.status(400).json({ error: `Falha na conexão: ${err.message}` })
  }
})

// Histórico de webhooks
router.get('/webhooks', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, event_type, status, attempts, last_attempt_at, response_code, created_at
       FROM webhook_deliveries WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.clinicId]
    )
    res.json({ data: result.rows })
  } catch (err) { next(err) }
})

module.exports = router
