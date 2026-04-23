// ── CLINICS ROUTES ────────────────────────────────────────────
const router = require('express').Router()
const { query, queryWithTenant } = require('../../config/database')
const { authenticate, requireRole } = require('../../middleware/auth')

// Perfil da clínica
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT id, name, cnpj, email, phone, logo_url, plan, plan_status, trial_ends_at, settings FROM clinics WHERE id=$1', [req.user.clinicId])
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// Atualizar clínica
router.put('/me', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const { name, phone, settings } = req.body
    await query('UPDATE clinics SET name=$1, phone=$2, settings=$3, updated_at=NOW() WHERE id=$4',
      [name, phone, JSON.stringify(settings), req.user.clinicId])
    res.json({ message: 'Clínica atualizada' })
  } catch (err) { next(err) }
})

// Listar usuários da clínica
router.get('/users', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, specialty, is_active, last_login_at, created_at FROM users WHERE clinic_id=$1 ORDER BY name',
      [req.user.clinicId]
    )
    res.json({ data: result.rows })
  } catch (err) { next(err) }
})

// Templates de prontuário disponíveis para a clínica
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM prontuario_templates WHERE clinic_id=$1 OR clinic_id IS NULL ORDER BY is_default DESC, name`,
      [req.user.clinicId]
    )
    res.json({ data: result.rows })
  } catch (err) { next(err) }
})

// Criar template personalizado
router.post('/templates', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const { name, type, specialty, structure } = req.body
    const result = await query(
      'INSERT INTO prontuario_templates (clinic_id, name, type, specialty, structure) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.clinicId, name, type, specialty||null, JSON.stringify(structure)]
    )
    res.status(201).json({ template: result.rows[0] })
  } catch (err) { next(err) }
})

// Atualizar template
router.put('/templates/:id', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const { name, type, specialty, structure } = req.body
    const result = await query(
      'UPDATE prontuario_templates SET name=$1, type=$2, specialty=$3, structure=$4 WHERE id=$5 AND clinic_id=$6 RETURNING *',
      [name, type, specialty||null, JSON.stringify(structure), req.params.id, req.user.clinicId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Template não encontrado' })
    res.json({ template: result.rows[0] })
  } catch (err) { next(err) }
})

// Remover template
router.delete('/templates/:id', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM prontuario_templates WHERE id=$1 AND clinic_id=$2 RETURNING id',
      [req.params.id, req.user.clinicId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Template não encontrado' })
    res.json({ message: 'Template removido' })
  } catch (err) { next(err) }
})

// Logs de auditoria
router.get('/audit-logs', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const { limit = 50 } = req.query
    const result = await query(
      `SELECT al.*, u.name AS user_name FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.clinic_id=$1 ORDER BY al.created_at DESC LIMIT $2`,
      [req.user.clinicId, limit]
    )
    res.json({ data: result.rows })
  } catch (err) { next(err) }
})

module.exports = router
