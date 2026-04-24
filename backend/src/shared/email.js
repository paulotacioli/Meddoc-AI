// ── shared/email.js ───────────────────────────────────────────
const logger = require('./logger')

// SendGrid só é usado quando a chave parece real (não placeholder)
let sgMail = null
const hasSendGrid = process.env.SENDGRID_API_KEY?.startsWith('SG.') &&
                    process.env.SENDGRID_API_KEY.length > 40

if (hasSendGrid) {
  sgMail = require('@sendgrid/mail')
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

// Transporter Ethereal reutilizável (criado na primeira chamada)
let _ethereal = null

async function getEtherealTransport() {
  if (_ethereal) return _ethereal
  const nodemailer = require('nodemailer')
  const account    = await nodemailer.createTestAccount()
  _ethereal = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: account.user, pass: account.pass },
  })
  logger.info(`[EMAIL DEV] Conta Ethereal: ${account.user} | ${account.pass}`)
  return _ethereal
}

async function send(msg) {
  // Produção: SendGrid com chave real
  if (sgMail) {
    await sgMail.send({
      ...msg,
      from: msg.from || {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@pronova.ai',
        name:  process.env.SENDGRID_FROM_NAME  || 'Pronova',
      },
    })
    return
  }

  // Desenvolvimento: Ethereal Email (gera URL de preview no console)
  try {
    const nodemailer = require('nodemailer')
    const transport  = await getEtherealTransport()
    const info       = await transport.sendMail({
      from:    '"Pronova" <noreply@pronova.ai>',
      to:      msg.to,
      subject: msg.subject,
      html:    msg.html,
    })
    const previewUrl = nodemailer.getTestMessageUrl(info)
    logger.info(`[EMAIL DEV] ✉ Para: ${msg.to} | Assunto: ${msg.subject}`)
    logger.info(`[EMAIL DEV] 🔗 Visualize: ${previewUrl}`)
  } catch (err) {
    // Fallback final: exibe conteúdo no log
    const text = (msg.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    logger.warn(`[EMAIL MOCK] Para: ${msg.to} | Assunto: ${msg.subject}`)
    logger.warn(`[EMAIL MOCK] Conteúdo: ${text}`)
  }
}

const emailService = {
  async sendCredentials({ to, name, clinicName, inviterName, tempPassword, loginUrl }) {
    await send({
      to,
      subject: `Seu acesso ao Pronova — ${clinicName}`,
      html: `<h2>Olá, ${name}!</h2>
             <p><strong>${inviterName}</strong> criou um acesso para você na clínica <strong>${clinicName}</strong> no Pronova.</p>
             <p>Suas credenciais de acesso:</p>
             <table style="border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:6px 12px;font-weight:bold;color:#555">E-mail</td><td style="padding:6px 12px">${to}</td></tr>
               <tr><td style="padding:6px 12px;font-weight:bold;color:#555">Senha</td><td style="padding:6px 12px;font-family:monospace;font-size:16px;letter-spacing:2px">${tempPassword}</td></tr>
             </table>
             <p style="color:#e57373;font-size:13px">Recomendamos alterar sua senha após o primeiro acesso.</p>
             <a href="${loginUrl}" style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:8px">
               Acessar o sistema →
             </a>`,
    })
  },

  async sendInvite({ to, inviterName, clinicName, acceptUrl }) {
    await send({
      to,
      subject: `${inviterName} te convidou para o Pronova`,
      html: `<p><strong>${inviterName}</strong> te convidou para a clínica <strong>${clinicName}</strong>.</p>
             <p><a href="${acceptUrl}"
               style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
               Aceitar convite →
             </a></p>
             <p style="color:#999;font-size:12px">Link válido por 7 dias.</p>`,
    })
  },

  async sendWelcome({ to, name, clinicName }) {
    await send({
      to,
      subject: 'Bem-vindo ao Pronova!',
      html: `<h2>Olá, ${name}!</h2>
             <p>Sua clínica <strong>${clinicName}</strong> foi criada com sucesso.</p>
             <p>Você tem <strong>14 dias de trial gratuito</strong>.</p>
             <p><a href="${process.env.APP_URL}/dashboard"
               style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
               Acessar o sistema →
             </a></p>`,
    })
  },

  async sendPasswordReset({ to, resetUrl }) {
    await send({
      to,
      subject: 'Redefinição de senha — Pronova',
      html: `<p>Você solicitou a redefinição da sua senha.</p>
             <p><a href="${resetUrl}"
               style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
               Redefinir senha →
             </a></p>
             <p style="color:#999;font-size:12px">Link válido por 1 hora.</p>`,
    })
  },
}

module.exports = emailService
