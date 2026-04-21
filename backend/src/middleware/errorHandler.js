// ── middleware/errorHandler.js ────────────────────────────────
const logger = require('../shared/logger')

function errorHandler(err, req, res, next) {
  logger.error({ message: err.message, stack: err.stack, path: req.path })

  if (err.code === '23505')
    return res.status(409).json({ error: 'Registro duplicado' })
  if (err.code === '23503')
    return res.status(400).json({ error: 'Referência inválida' })
  if (err.name === 'CastError')
    return res.status(400).json({ error: 'ID inválido' })

  const status = err.status || err.statusCode || 500
  res.status(status).json({
    error: status < 500 ? err.message : 'Erro interno do servidor',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
}

module.exports = { errorHandler }
