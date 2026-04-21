// ── shared/email.js ───────────────────────────────────────────
const logger = require('./logger')

// Inicializa SendGrid apenas se a chave estiver configurada
let sgMail = null
if (process.env.SENDGRID_API_KEY) {
  sgMail = require('@sendgrid/mail')
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

async function send(msg) {
  if (!sgMail) {
    logger.warn(`[EMAIL MOCK] Para: ${msg.to} | Assunto: ${msg.subject}`)
    return
  }
  await sgMail.send({
    ...msg,
    from: msg.from || {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@meddoc.ai',
      name:  process.env.SENDGRID_FROM_NAME  || 'MedDoc AI',
    },
  })
}

const emailService = {
  async sendWelcome({ to, name, clinicName }) {
    await send({
      to,
      subject: 'Bem-vindo ao MedDoc AI!',
      html: `<h2>Olá, ${name}!</h2>
             <p>Sua clínica <strong>${clinicName}</strong> foi criada com sucesso.</p>
             <p>Você tem <strong>14 dias de trial gratuito</strong>.</p>
             <p><a href="${process.env.APP_URL}/dashboard"
               style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
               Acessar o sistema →
             </a></p>`,
    })
  },

  async sendInvite({ to, inviterName, clinicName, acceptUrl }) {
    await send({
      to,
      subject: `${inviterName} te convidou para o MedDoc AI`,
      html: `<p><strong>${inviterName}</strong> te convidou para a clínica <strong>${clinicName}</strong>.</p>
             <p><a href="${acceptUrl}"
               style="background:#1A56A0;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
               Aceitar convite →
             </a></p>
             <p style="color:#999;font-size:12px">Link válido por 7 dias.</p>`,
    })
  },

  async sendPasswordReset({ to, resetUrl }) {
    await send({
      to,
      subject: 'Redefinição de senha — MedDoc AI',
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
