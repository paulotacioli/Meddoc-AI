// ── AUTH CONTROLLER ───────────────────────────────────────────
const bcrypt       = require('bcryptjs')
const jwt          = require('jsonwebtoken')
const speakeasy    = require('speakeasy')
const qrcode       = require('qrcode')
const crypto       = require('crypto')
const { query, queryWithTenant, pool } = require('../../config/database')
const { redisClient }  = require('../../config/redis')
const emailService = require('../../shared/email')
const { encrypt, decrypt } = require('../../shared/crypto')
const { createAuditLog } = require('../../shared/audit')
const logger       = require('../../shared/logger')

const SALT_ROUNDS        = 12
const ACCESS_TOKEN_TTL   = '15m'
const REFRESH_TOKEN_TTL  = '7d'

const sign = (payload, ttl) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttl })

// ── REGISTER ─────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { clinicName, cnpj, email, password, name, phone } = req.body
    if (!clinicName || !email || !password || !name)
      return res.status(400).json({ error: 'Campos obrigatórios faltando' })

    const exists = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (exists.rows.length)
      return res.status(409).json({ error: 'E-mail já cadastrado' })

    const hash = await bcrypt.hash(password, SALT_ROUNDS)

    await client.query('BEGIN')

    const clinicRes = await client.query(
      `INSERT INTO clinics (name, cnpj, email, phone, plan, plan_status, trial_ends_at)
       VALUES ($1,$2,$3,$4,'starter','trial', NOW() + INTERVAL '14 days') RETURNING id`,
      [clinicName, cnpj || null, email, phone || null]
    )
    const clinicId = clinicRes.rows[0].id

    const userRes = await client.query(
      `INSERT INTO users (clinic_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,$4,'admin') RETURNING id, name, email, role`,
      [clinicId, email, hash, name]
    )
    const user = userRes.rows[0]

    const payload      = { userId: user.id, clinicId, role: user.role }
    const accessToken  = sign(payload, ACCESS_TOKEN_TTL)
    const refreshToken = sign(payload, REFRESH_TOKEN_TTL)

    await redisClient.setEx(`refresh:${user.id}`, 7 * 86400, refreshToken)

    await client.query('COMMIT')

    emailService.sendWelcome({ to: email, name, clinicName }).catch(() => {})
    createAuditLog({ clinicId, userId: user.id, action: 'REGISTER', resource: 'users', resourceId: user.id })

    res.status(201).json({
      accessToken, refreshToken,
      user: { ...user, clinicId, plan: 'starter', planStatus: 'trial' }
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

// ── LOGIN ─────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' })

    const result = await query(
      `SELECT u.id, u.password_hash, u.name, u.role, u.two_fa_enabled,
              u.clinic_id, u.is_active, c.plan, c.plan_status
       FROM users u JOIN clinics c ON c.id = u.clinic_id
       WHERE u.email = $1`, [email]
    )
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciais inválidas' })
    if (!user.is_active)
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o administrador.' })

    await createAuditLog({
      clinicId: user.clinic_id, userId: user.id,
      action: 'LOGIN', resource: 'users', resourceId: user.id, ip: req.ip
    })

    if (user.two_fa_enabled) {
      const tempToken = sign({ userId: user.id, step: '2fa' }, '5m')
      return res.json({ requires2FA: true, tempToken })
    }

    const payload      = { userId: user.id, clinicId: user.clinic_id, role: user.role }
    const accessToken  = sign(payload, ACCESS_TOKEN_TTL)
    const refreshToken = sign(payload, REFRESH_TOKEN_TTL)
    await redisClient.setEx(`refresh:${user.id}`, 7 * 86400, refreshToken)
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])

    res.json({
      accessToken, refreshToken,
      user: { id: user.id, name: user.name, role: user.role, clinicId: user.clinic_id, plan: user.plan, planStatus: user.plan_status }
    })
  } catch (err) { next(err) }
}

// ── LOGIN 2FA ─────────────────────────────────────────────────
exports.login2FA = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body
    let decoded
    try { decoded = jwt.verify(tempToken, process.env.JWT_SECRET) }
    catch { return res.status(401).json({ error: 'Token expirado. Faça login novamente.' }) }
    if (decoded.step !== '2fa') return res.status(401).json({ error: 'Token inválido' })

    const result = await query(
      'SELECT id, two_fa_secret, clinic_id, role, name FROM users WHERE id = $1', [decoded.userId]
    )
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })

    const secret = decrypt(user.two_fa_secret)
    const valid  = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 })
    if (!valid) return res.status(401).json({ error: 'Código 2FA inválido' })

    const payload      = { userId: user.id, clinicId: user.clinic_id, role: user.role }
    const accessToken  = sign(payload, ACCESS_TOKEN_TTL)
    const refreshToken = sign(payload, REFRESH_TOKEN_TTL)
    await redisClient.setEx(`refresh:${user.id}`, 7 * 86400, refreshToken)
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])

    res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role, clinicId: user.clinic_id } })
  } catch (err) { next(err) }
}

// ── REFRESH TOKEN ─────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token não fornecido' })

    let decoded
    try { decoded = jwt.verify(refreshToken, process.env.JWT_SECRET) }
    catch { return res.status(401).json({ error: 'Refresh token inválido ou expirado' }) }

    const stored = await redisClient.get(`refresh:${decoded.userId}`)
    if (stored !== refreshToken) return res.status(401).json({ error: 'Refresh token revogado' })

    const accessToken = sign(
      { userId: decoded.userId, clinicId: decoded.clinicId, role: decoded.role },
      ACCESS_TOKEN_TTL
    )
    res.json({ accessToken })
  } catch (err) { next(err) }
}

// ── LOGOUT ────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    await redisClient.del(`refresh:${req.user.userId}`)
    res.json({ message: 'Logout realizado' })
  } catch (err) { next(err) }
}

// ── ME ────────────────────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.specialty, u.crm, u.two_fa_enabled,
              u.clinic_id, c.name AS clinic_name, c.plan, c.plan_status, c.trial_ends_at
       FROM users u JOIN clinics c ON c.id = u.clinic_id
       WHERE u.id = $1`, [req.user.userId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' })
    const u = result.rows[0]
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, specialty: u.specialty,
               crm: u.crm, twoFaEnabled: u.two_fa_enabled, clinicId: u.clinic_id,
               clinicName: u.clinic_name, plan: u.plan, planStatus: u.plan_status, trialEndsAt: u.trial_ends_at })
  } catch (err) { next(err) }
}

// ── UPDATE ME ─────────────────────────────────────────────────
exports.updateMe = async (req, res, next) => {
  try {
    const { name, specialty, crm, phone } = req.body
    await query(
      'UPDATE users SET name=$1, specialty=$2, crm=$3, phone=$4, updated_at=NOW() WHERE id=$5',
      [name, specialty, crm, phone, req.user.userId]
    )
    res.json({ message: 'Perfil atualizado' })
  } catch (err) { next(err) }
}

// ── 2FA SETUP ─────────────────────────────────────────────────
exports.setup2FA = async (req, res, next) => {
  try {
    const userRes = await query('SELECT email FROM users WHERE id=$1', [req.user.userId])
    const email   = userRes.rows[0].email
    const secret  = speakeasy.generateSecret({ name: `Pronova (${email})`, issuer: 'Pronova' })
    const qr      = await qrcode.toDataURL(secret.otpauth_url)
    await redisClient.setEx(`2fa_setup:${req.user.userId}`, 600, secret.base32)
    res.json({ qrCode: qr, manualKey: secret.base32 })
  } catch (err) { next(err) }
}

exports.verify2FA = async (req, res, next) => {
  try {
    const { code } = req.body
    const secret   = await redisClient.get(`2fa_setup:${req.user.userId}`)
    if (!secret) return res.status(400).json({ error: 'Setup expirado. Reinicie o processo.' })
    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 })
    if (!valid) return res.status(401).json({ error: 'Código inválido' })
    await query('UPDATE users SET two_fa_enabled=true, two_fa_secret=$1 WHERE id=$2', [encrypt(secret), req.user.userId])
    await redisClient.del(`2fa_setup:${req.user.userId}`)
    res.json({ message: '2FA ativado com sucesso' })
  } catch (err) { next(err) }
}

exports.disable2FA = async (req, res, next) => {
  try {
    await query('UPDATE users SET two_fa_enabled=false, two_fa_secret=NULL WHERE id=$1', [req.user.userId])
    res.json({ message: '2FA desativado' })
  } catch (err) { next(err) }
}

// ── FORGOT / RESET PASSWORD ───────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body
    const result = await query('SELECT id FROM users WHERE email=$1', [email])
    if (!result.rows.length) return res.json({ message: 'Se o e-mail existir, você receberá as instruções.' })
    const token    = crypto.randomBytes(32).toString('hex')
    const resetUrl = `${process.env.APP_URL}/redefinir-senha?token=${token}`
    await redisClient.setEx(`pwd_reset:${token}`, 3600, result.rows[0].id)
    await emailService.sendPasswordReset({ to: email, resetUrl }).catch(() => {})
    res.json({ message: 'Se o e-mail existir, você receberá as instruções.' })
  } catch (err) { next(err) }
}

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body
    const userId = await redisClient.get(`pwd_reset:${token}`)
    if (!userId) return res.status(400).json({ error: 'Token inválido ou expirado' })
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, userId])
    await redisClient.del(`pwd_reset:${token}`)
    res.json({ message: 'Senha redefinida com sucesso' })
  } catch (err) { next(err) }
}

// ── INVITE ────────────────────────────────────────────────────
exports.sendInvite = async (req, res, next) => {
  try {
    const { email, role, name } = req.body
    if (!email || !role) return res.status(400).json({ error: 'E-mail e cargo são obrigatórios' })

    const exists = await query('SELECT id FROM users WHERE email = $1', [email])
    if (exists.rows.length) return res.status(409).json({ error: 'E-mail já cadastrado' })

    const inviterRes = await query('SELECT name FROM users WHERE id=$1', [req.user.userId])
    const clinicRes  = await query('SELECT name FROM clinics WHERE id=$1', [req.user.clinicId])

    // Gerar senha temporária: 8 hex + sufixo fixo com maiúscula, especial e dígito
    const tempPassword = crypto.randomBytes(4).toString('hex') + 'Kx@1'
    const hash         = await bcrypt.hash(tempPassword, SALT_ROUNDS)
    const userName     = name?.trim() || email.split('@')[0]

    await query(
      `INSERT INTO users (clinic_id, email, password_hash, name, role, invited_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.clinicId, email, hash, userName, role, req.user.userId]
    )

    emailService.sendCredentials({
      to: email,
      name: userName,
      clinicName: clinicRes.rows[0].name,
      inviterName: inviterRes.rows[0].name,
      tempPassword,
      loginUrl: `${process.env.APP_URL}/login`,
    }).catch(() => {})

    res.json({ message: 'Usuário criado e credenciais enviadas por e-mail' })
  } catch (err) { next(err) }
}

exports.getInviteInfo = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT i.email, i.role, c.name AS clinic_name
       FROM invites i JOIN clinics c ON c.id = i.clinic_id
       WHERE i.token=$1 AND i.accepted_at IS NULL AND i.expires_at > NOW()`,
      [req.params.token]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Convite inválido ou expirado' })
    res.json(result.rows[0])
  } catch (err) { next(err) }
}

exports.acceptInvite = async (req, res, next) => {
  try {
    const { token, name, password } = req.body
    const inviteRes = await query(
      `SELECT i.*, c.id AS clinic_id FROM invites i JOIN clinics c ON c.id=i.clinic_id
       WHERE i.token=$1 AND i.accepted_at IS NULL AND i.expires_at > NOW()`,
      [token]
    )
    if (!inviteRes.rows.length) return res.status(400).json({ error: 'Convite inválido ou expirado' })
    const invite = inviteRes.rows[0]
    const hash   = await bcrypt.hash(password, SALT_ROUNDS)
    const userRes = await query(
      `INSERT INTO users (clinic_id, email, password_hash, name, role, invited_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role`,
      [invite.clinic_id, invite.email, hash, name, invite.role, invite.invited_by]
    )
    await query('UPDATE invites SET accepted_at=NOW() WHERE token=$1', [token])
    const user     = userRes.rows[0]
    const payload  = { userId: user.id, clinicId: invite.clinic_id, role: user.role }
    const accessToken  = sign(payload, ACCESS_TOKEN_TTL)
    const refreshToken = sign(payload, REFRESH_TOKEN_TTL)
    await redisClient.setEx(`refresh:${user.id}`, 7 * 86400, refreshToken)
    res.status(201).json({ accessToken, refreshToken, user: { ...user, clinicId: invite.clinic_id } })
  } catch (err) { next(err) }
}
