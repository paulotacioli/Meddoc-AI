// ── CRYPTO (AES-256-GCM) ─────────────────────────────────────
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY  = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes
const IV_LEN = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encoded) {
  const buf = Buffer.from(encoded, 'base64');
  const iv  = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function hashCPF(cpf) {
  const digits = cpf.replace(/\D/g, '');
  return crypto.createHmac('sha256', KEY).update(digits).digest('hex');
}

module.exports.crypto = { encrypt, decrypt, hashCPF };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── LOGGER ────────────────────────────────────────────────────
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.prettyPrint()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports.logger = logger;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── EMAIL SERVICE (SendGrid) ──────────────────────────────────
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const emailService = {
  async sendWelcome({ to, name, clinicName }) {
    await sgMail.send({
      to, from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME },
      subject: 'Bem-vindo ao MedDoc AI!',
      html: `<h2>Olá, ${name}!</h2>
             <p>Sua clínica <strong>${clinicName}</strong> foi criada com sucesso.</p>
             <p>Você tem <strong>14 dias de trial gratuito</strong>.</p>
             <a href="${process.env.APP_URL}/dashboard" style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px">
               Acessar o sistema
             </a>`,
    });
  },

  async sendInvite({ to, inviterName, clinicName, acceptUrl }) {
    await sgMail.send({
      to, from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME },
      subject: `${inviterName} te convidou para o MedDoc AI`,
      html: `<p><strong>${inviterName}</strong> te convidou para a clínica <strong>${clinicName}</strong> no MedDoc AI.</p>
             <a href="${acceptUrl}" style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px">
               Aceitar convite
             </a>
             <p style="color:#999;font-size:12px">Link válido por 7 dias.</p>`,
    });
  },

  async sendPasswordReset({ to, resetUrl }) {
    await sgMail.send({
      to, from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME },
      subject: 'Redefinição de senha — MedDoc AI',
      html: `<p>Você solicitou a redefinição da sua senha.</p>
             <a href="${resetUrl}" style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px">
               Redefinir senha
             </a>
             <p style="color:#999;font-size:12px">Link válido por 1 hora. Se não foi você, ignore este e-mail.</p>`,
    });
  },
};

module.exports.emailService = emailService;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── CID-10 SUGGESTION SERVICE ─────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const cid10Service = {
  async suggest(text, limit = 3) {
    if (!text || text.length < 20) return [];
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Com base neste texto clínico, sugira até ${limit} códigos CID-10 mais prováveis.
Responda APENAS com JSON: [{"code":"G43.0","description":"Enxaqueca sem aura","confidence":0.9}]
Se não for possível determinar, responda: []

TEXTO: ${text.substring(0, 1500)}`
        }]
      });
      const raw = msg.content[0].text.trim();
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
};

module.exports.cid10Service = cid10Service;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── AUDIT LOG HELPER ─────────────────────────────────────────
const { query } = require('../config/database');

async function createAuditLog({ clinicId, userId, action, resource, resourceId, ip, metadata }) {
  try {
    await query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clinicId, userId, action, resource, resourceId, ip || null, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    module.exports.logger.error('createAuditLog failed:', err);
  }
}

module.exports.createAuditLog = createAuditLog;
