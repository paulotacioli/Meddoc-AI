const logger = require('../shared/logger')

const AUDIT_PATHS = [
  { method: 'GET',    rx: /\/api\/patients\/[^/]+$/,            action: 'READ_PATIENT' },
  { method: 'PUT',    rx: /\/api\/patients\/[^/]+$/,            action: 'UPDATE_PATIENT' },
  { method: 'DELETE', rx: /\/api\/patients\/[^/]+$/,            action: 'DELETE_PATIENT' },
  { method: 'GET',    rx: /\/api\/consultations\/[^/]+$/,       action: 'READ_CONSULTATION' },
  { method: 'POST',   rx: /\/api\/consultations\/start/,        action: 'START_CONSULTATION' },
  { method: 'POST',   rx: /\/api\/prontuario\/[^/]+\/approve/,  action: 'APPROVE_PRONTUARIO' },
]

function auditMiddleware(req, res, next) {
  if (!req.user) return next()

  const matched = AUDIT_PATHS.find(r => r.method === req.method && r.rx.test(req.path))
  if (!matched) return next()

  const origEnd = res.end.bind(res)
  res.end = function (...args) {
    origEnd(...args)
    if (!req.user?.clinicId || !req.user?.userId) return
    const { query } = require('../config/database')
    const resourceId = matched.rx.exec(req.path)?.[1] || null
    query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, ip_address, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.clinicId, req.user.userId, matched.action,
       req.path.split('/')[2], resourceId, req.ip || null,
       JSON.stringify({ status: res.statusCode })]
    ).catch(err => logger.error('Audit log failed:', err.message))
  }
  next()
}

async function createAuditLog({ clinicId, userId, action, resource, resourceId, ip, metadata }) {
  try {
    const { query } = require('../config/database')
    await query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, ip_address, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [clinicId || null, userId || null, action, resource,
       resourceId || null, ip || null, JSON.stringify(metadata || {})]
    )
  } catch (err) {
    logger.error('createAuditLog failed:', err.message)
  }
}

module.exports = { auditMiddleware, createAuditLog }