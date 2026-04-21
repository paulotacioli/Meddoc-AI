// ── PATIENTS ROUTES ───────────────────────────────────────────
const router = require('express').Router()
const { queryWithTenant, query } = require('../../config/database')
const { authenticate } = require('../../middleware/auth')
const { encrypt, decrypt, hashCPF } = require('../../shared/crypto')
const { createAuditLog } = require('../../shared/audit')

// Listar / buscar pacientes
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search = '', limit = 20, page = 1 } = req.query
    const offset = (page - 1) * limit
    const params = [req.user.clinicId]
    let where = 'clinic_id = $1 AND deleted_at IS NULL'

    if (search) {
      params.push(`%${search}%`, hashCPF(search.replace(/\D/g,'')))
      where += ` AND (name ILIKE $2 OR cpf_hash = $3)`
    }

    const result = await queryWithTenant(req.user.clinicId,
      `SELECT id, name, email, phone, health_plan, birth_date, gender, consent_given, created_at
       FROM patients WHERE ${where}
       ORDER BY name ASC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    )
    res.json({ data: result.rows })
  } catch (err) { next(err) }
})

// Buscar paciente por ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await queryWithTenant(req.user.clinicId,
      `SELECT id, name, email, phone, health_plan, birth_date, gender, consent_given, notes, created_at
       FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.clinicId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Paciente não encontrado' })
    await createAuditLog({ clinicId: req.user.clinicId, userId: req.user.userId, action: 'READ_PATIENT', resource: 'patients', resourceId: req.params.id })
    res.json({ patient: result.rows[0] })
  } catch (err) { next(err) }
})

// Criar paciente
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, cpf, birth_date, gender, email, phone, health_plan, consent_given, notes } = req.body
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })

    const cpfHash = cpf ? hashCPF(cpf) : null
    const cpfEnc  = cpf ? encrypt(cpf.replace(/\D/g,'')) : null

    const result = await queryWithTenant(req.user.clinicId,
      `INSERT INTO patients (clinic_id, name, cpf_enc, cpf_hash, birth_date, gender, email, phone, health_plan, consent_given, notes, consent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $10 THEN NOW() ELSE NULL END)
       RETURNING id, name, email, phone, consent_given`,
      [req.user.clinicId, name, cpfEnc, cpfHash, birth_date||null, gender||null, email||null, phone||null, health_plan||null, consent_given||false, notes||null]
    )
    res.status(201).json({ patient: result.rows[0] })
  } catch (err) { next(err) }
})

// Atualizar paciente
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, email, phone, health_plan, notes, consent_given } = req.body
    const result = await queryWithTenant(req.user.clinicId,
      `UPDATE patients SET name=$1, email=$2, phone=$3, health_plan=$4, notes=$5,
         consent_given=$6, consent_at=CASE WHEN $6 AND NOT consent_given THEN NOW() ELSE consent_at END,
         updated_at=NOW()
       WHERE id=$7 AND clinic_id=$8 RETURNING id`,
      [name, email, phone, health_plan, notes, consent_given, req.params.id, req.user.clinicId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Paciente não encontrado' })
    await createAuditLog({ clinicId: req.user.clinicId, userId: req.user.userId, action: 'UPDATE_PATIENT', resource: 'patients', resourceId: req.params.id })
    res.json({ message: 'Paciente atualizado' })
  } catch (err) { next(err) }
})

// Soft delete (LGPD: anonimização)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await queryWithTenant(req.user.clinicId,
      `UPDATE patients SET deleted_at=NOW(), name='[Removido]', email=NULL, phone=NULL, cpf_enc=NULL, cpf_hash=NULL
       WHERE id=$1 AND clinic_id=$2`,
      [req.params.id, req.user.clinicId]
    )
    await createAuditLog({ clinicId: req.user.clinicId, userId: req.user.userId, action: 'DELETE_PATIENT', resource: 'patients', resourceId: req.params.id })
    res.json({ message: 'Paciente removido (LGPD)' })
  } catch (err) { next(err) }
})

module.exports = router
