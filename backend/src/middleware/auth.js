// ── middleware/auth.js ────────────────────────────────────────
const jwt = require('jsonwebtoken')
const { redisClient } = require('../config/redis')
const logger = require('../shared/logger')

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token não fornecido' })

    const token   = header.substring(7)
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
      if (err.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
      return res.status(401).json({ error: 'Token inválido' })
    }

    // Verificar se token foi revogado (logout)
    try {
      const revoked = await redisClient.get(`revoked:${token.substring(0, 16)}`)
      if (revoked) return res.status(401).json({ error: 'Token revogado' })
    } catch {}

    req.user = decoded // { userId, clinicId, role }
    next()
  } catch (err) {
    next(err)
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: 'Permissão insuficiente' })
    next()
  }
}

module.exports = { authenticate, requireRole }
