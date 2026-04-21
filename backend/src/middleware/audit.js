// ── middleware/audit.js ───────────────────────────────────────
const logger = require('../shared/logger')

const AUDIT_PATHS = [
  { method: 'GET',    rx: /\/api\/patients\/[^/]+$/,         action: 'READ_PATIENT' },
  { method: 'PUT',    rx: /\/api\/patients\/[^/]+$/,         action: 'UPDATE_PATIENT' },
  { method: 'DELETE', rx: /\/api\/patients\/[^/]+$/,         action: 'DELETE_PATIENT' },
  { method: 'GET',    rx: /\/api\/consultations\/[^/]+$/,    action: 'READ_CONSULTATION' },
  { method: 'POST',   rx: /\/api\/consultations\/start/,     action: 'START_CONSULTATION' },
  { method: 'POST',   rx: /\/api\/prontuario\/[^/]+\/approve/, action: 'APPROVE_PRONTUARIO' },
]

function auditMiddleware(req, res, next) {
  const matched = AUDIT_PATHS.find(r => r.method === req.method && r.rx.test(req.path))
  if (!matched) return next()

  const origEnd = res.end.bind(res)
  res.end = function (...args) {
    origEnd(...args)
    if (!req.user) return
    const idMatch = matched.rx.exec(req.path)
    const resourceId = idMatch ? req.path.split('/').pop() : undefined
    const { query } = require('../config/database')
    query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, ip_address, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.clinicId, req.user.userId, matched.action,
       req.path.split('/')[2], resourceId, req.ip,
       JSON.stringify({ status: res.statusCode })]
    ).catch(e => logger.error('audit middleware error:', e.message))
  }
  next()
}

module.exports = { auditMiddleware }
