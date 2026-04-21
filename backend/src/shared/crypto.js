// ── shared/crypto.js ──────────────────────────────────────────
const crypto = require('crypto')
const ALGO = 'aes-256-gcm'
const KEY  = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex')
const IV_LEN = 16

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decrypt(encoded) {
  const buf = Buffer.from(encoded, 'base64')
  const iv  = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + 16)
  const ct  = buf.subarray(IV_LEN + 16)
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function hashCPF(cpf) {
  const digits = (cpf || '').replace(/\D/g, '')
  return crypto.createHmac('sha256', KEY).update(digits).digest('hex')
}

module.exports = { encrypt, decrypt, hashCPF }
