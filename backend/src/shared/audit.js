// ── shared/audit.js ───────────────────────────────────────────
const logger = require('./logger')

async function createAuditLog({ clinicId, userId, action, resource, resourceId, ip, metadata }) {
  try {
    const { query } = require('../config/database')
    await query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clinicId || null, userId || null, action, resource, resourceId || null, ip || null, JSON.stringify(metadata || {})]
    )
  } catch (err) {
    logger.error('createAuditLog failed:', err.message)
  }
}

module.exports = { createAuditLog }
