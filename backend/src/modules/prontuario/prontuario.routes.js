// ── PRONTUÁRIO ROUTES ─────────────────────────────────────────
const router = require('express').Router()
const { authenticate } = require('../../middleware/auth')
const { Prontuario, queryWithTenant } = require('../../config/database')
const prontuarioService = require('./prontuario.service')
const { createAuditLog } = require('../../shared/audit')

// Buscar prontuário por ID (MongoDB)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const prontuario = await Prontuario.findById(req.params.id)
    if (!prontuario) return res.status(404).json({ error: 'Prontuário não encontrado' })
    // Verificar que pertence à clínica do usuário
    if (prontuario.clinicId !== req.user.clinicId)
      return res.status(403).json({ error: 'Acesso negado' })
    await createAuditLog({
      clinicId: req.user.clinicId, userId: req.user.userId,
      action: 'READ_PRONTUARIO', resource: 'prontuarios', resourceId: req.params.id
    })
    res.json(prontuario)
  } catch (err) { next(err) }
})

// Aprovar prontuário
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const { consultationId, editedFields } = req.body
    const prontuario = await prontuarioService.approve({
      prontuarioId:  req.params.id,
      consultationId,
      clinicId:      req.user.clinicId,
      userId:        req.user.userId,
      editedFields,
    })
    await createAuditLog({
      clinicId: req.user.clinicId, userId: req.user.userId,
      action: 'APPROVE_PRONTUARIO', resource: 'prontuarios', resourceId: req.params.id
    })
    res.json(prontuario)
  } catch (err) { next(err) }
})

// Regenerar seção específica
router.post('/:id/regenerate', authenticate, async (req, res, next) => {
  try {
    const { sectionKey, consultationId } = req.body
    if (!sectionKey) return res.status(400).json({ error: 'sectionKey é obrigatório' })
    const prontuario = await prontuarioService.regenerateSection({
      prontuarioId:  req.params.id,
      sectionKey,
      consultationId,
      clinicId:      req.user.clinicId,
      userId:        req.user.userId,
    })
    res.json(prontuario)
  } catch (err) { next(err) }
})

// Atualizar campos manualmente (salvar edição)
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { fields } = req.body
    const prontuario = await Prontuario.findById(req.params.id)
    if (!prontuario) return res.status(404).json({ error: 'Prontuário não encontrado' })
    if (prontuario.clinicId !== req.user.clinicId)
      return res.status(403).json({ error: 'Acesso negado' })

    prontuario.fields = { ...prontuario.fields, ...fields }
    await prontuario.save()

    await queryWithTenant(req.user.clinicId,
      `INSERT INTO prontuario_versions (consultation_id, version, mongo_doc_id, created_by, action)
       VALUES ($1, $2, $3, $4, 'edited')`,
      [prontuario.consultationId, prontuario.version, prontuario._id.toString(), req.user.userId]
    )
    res.json(prontuario)
  } catch (err) { next(err) }
})

module.exports = router
