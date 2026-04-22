// ── shared/cid10.js ───────────────────────────────────────────
const logger = require('./logger')

const cid10Service = {
  async suggest(text, limit = 3) {
    if (!text || text.length < 20 || !process.env.ANTHROPIC_API_KEY) return []
    try {
      const Anthropic = require('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Com base neste texto clínico, sugira até ${limit} códigos CID-10 mais prováveis.
Responda APENAS com JSON válido, sem texto extra, sem markdown:
[{"code":"G43.0","description":"Enxaqueca sem aura","confidence":0.9}]
Se não for possível determinar: []

TEXTO: ${text.substring(0, 1500)}`,
        }],
      })
      const raw = msg.content[0].text.trim()
      return JSON.parse(raw)
    } catch (err) {
      logger.warn('CID-10 suggestion failed:', err.message)
      return []
    }
  },
}

module.exports = cid10Service
