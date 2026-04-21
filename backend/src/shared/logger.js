// ── shared/logger.js ──────────────────────────────────────────
const winston = require('winston')

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const m = typeof message === 'object' ? JSON.stringify(message) : message
            return `${timestamp} [${level}] ${m} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
})

module.exports = logger
