// ── CONSULTATIONS MODULE ──────────────────────────────────────
// Gerencia sessões de consulta: início, gravação, encerramento
// WebSocket para transcrição em tempo real

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { query, queryWithTenant } = require('../../config/database');
const { getS3UploadUrl, deleteS3Object } = require('../../config/storage');
const transcriptionService = require('../transcription/transcription.service');
const prontuarioService = require('../prontuario/prontuario.service');
const { createAuditLog } = require('../../shared/audit');
const { emitToClinic } = require('../../shared/realtime');
const logger = require('../../shared/logger');
const { v4: uuidv4 } = require('uuid');

// ── REST ROUTES ──────────────────────────────────────────────

// Listar consultas da clínica
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date, doctorId, patientId, status, page = 1, limit = 20 } = req.query;
    let whereClause = 'c.clinic_id = $1';
    const params = [req.user.clinicId];
    let pi = 2;

    if (date)     { whereClause += ` AND DATE(c.started_at) = $${pi++}`; params.push(date); }
    if (doctorId) { whereClause += ` AND c.doctor_id = $${pi++}`;        params.push(doctorId); }
    if (patientId){ whereClause += ` AND c.patient_id = $${pi++}`;       params.push(patientId); }
    if (status)   { whereClause += ` AND c.status = $${pi++}`;           params.push(status); }

    const offset = (page - 1) * limit;
    const result = await queryWithTenant(req.user.clinicId,
      `SELECT c.id, c.status, c.started_at, c.ended_at, c.duration_sec,
              p.name AS patient_name, p.id AS patient_id,
              u.name AS doctor_name, u.id AS doctor_id,
              (SELECT COUNT(*) FROM prontuario_versions pv WHERE pv.consultation_id = c.id) AS version_count
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = c.doctor_id
       WHERE ${whereClause}
       ORDER BY c.started_at DESC
       LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit, offset]
    );
    res.json({ data: result.rows, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// Iniciar nova consulta
router.post('/start', authenticate, async (req, res, next) => {
  try {
    const { patientId, templateId } = req.body;

    // Verificar consentimento do paciente
    const patient = await queryWithTenant(req.user.clinicId,
      'SELECT id, name, consent_given FROM patients WHERE id = $1 AND clinic_id = $2',
      [patientId, req.user.clinicId]
    );
    if (!patient.rows.length) return res.status(404).json({ error: 'Paciente não encontrado' });
    if (!patient.rows[0].consent_given)
      return res.status(403).json({ error: 'Consentimento do paciente não registrado', code: 'CONSENT_REQUIRED' });

    const audioS3Key = `audio/${req.user.clinicId}/${uuidv4()}.webm`;
    const audioExpiresAt = new Date(Date.now() + (process.env.AUDIO_RETENTION_HOURS || 24) * 3600000);

    const result = await queryWithTenant(req.user.clinicId,
      `INSERT INTO consultations
         (clinic_id, patient_id, doctor_id, template_id, status, audio_s3_key, audio_expires_at)
       VALUES ($1, $2, $3, $4, 'recording', $5, $6)
       RETURNING id, status, started_at`,
      [req.user.clinicId, patientId, req.user.userId, templateId || null, audioS3Key, audioExpiresAt]
    );
    const consultation = result.rows[0];

    // URL pré-assinada para upload de áudio direto do browser para S3
    const uploadUrl = await getS3UploadUrl(audioS3Key, 'audio/webm', 3600);

    await createAuditLog({
      clinicId: req.user.clinicId, userId: req.user.userId,
      action: 'START_CONSULTATION', resource: 'consultations', resourceId: consultation.id
    });

    res.status(201).json({ consultation, uploadUrl, audioS3Key });
  } catch (err) { next(err); }
});

// Encerrar consulta e disparar pipeline de IA
router.post('/:id/end', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { audioS3Key } = req.body;

    const result = await queryWithTenant(req.user.clinicId,
      'SELECT * FROM consultations WHERE id = $1 AND clinic_id = $2 AND status = $3',
      [id, req.user.clinicId, 'recording']
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Consulta não encontrada ou já encerrada' });

    const durationSec = Math.round((Date.now() - new Date(result.rows[0].started_at)) / 1000);

    // Marcar como transcrevendo
    await queryWithTenant(req.user.clinicId,
      `UPDATE consultations SET status='transcribing', ended_at=NOW(), duration_sec=$1 WHERE id=$2`,
      [durationSec, id]
    );

    // Pipeline assíncrona: Whisper → LLM → notificar médico via WS
    // Pipeline assíncrona: usar transcript já coletado pelo WS
    const consultationId = id // ← adicionar esta linha ANTES do setImmediate
setImmediate(async () => {
  try {
    const consultResult = await queryWithTenant(req.user.clinicId,
      'SELECT * FROM consultations WHERE id = $1', [consultationId]
    )
    const consult = consultResult.rows[0]

    if (consult.transcript_raw && consult.transcript_raw.trim().length > 10) {
      await queryWithTenant(req.user.clinicId,
        `UPDATE consultations SET status='generating' WHERE id=$1`, [consultationId]
      )
      const { emitToConsultation } = require('../consultations/consulta.ws')
      emitToConsultation(consultationId, {
        type: 'transcription_ready',
        consultationId,
      })
      await processPipeline(consultationId, null, req.user)
    } else {
      await processPipeline(consultationId, audioS3Key, req.user)
    }
  } catch (err) { logger.error('Pipeline error:', err) }
})

    res.json({ message: 'Consulta encerrada. Gerando prontuário...', consultationId: id });
  } catch (err) { next(err); }
});

// Buscar consulta com prontuário
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { Prontuario } = require('../../config/database');
    const result = await queryWithTenant(req.user.clinicId,
      `SELECT c.*, p.name AS patient_name, u.name AS doctor_name
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = c.doctor_id
       WHERE c.id = $1 AND c.clinic_id = $2`,
      [req.params.id, req.user.clinicId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Consulta não encontrada' });

    const consultation = result.rows[0];
    const prontuario = await Prontuario.findOne({ consultationId: req.params.id }).sort({ version: -1 });

    await createAuditLog({
      clinicId: req.user.clinicId, userId: req.user.userId,
      action: 'READ_CONSULTATION', resource: 'consultations', resourceId: req.params.id
    });

    res.json({ consultation, prontuario });
  } catch (err) { next(err); }
});

// ── PIPELINE ASSÍNCRONA ───────────────────────────────────────
async function processPipeline(consultationId, audioS3Key, user) {
  try {
    logger.info(`Pipeline iniciada para consulta ${consultationId}`)

    // Buscar transcrição já salva pelo WebSocket
    const consultResult = await queryWithTenant(user.clinicId,
      'SELECT * FROM consultations WHERE id = $1', [consultationId]
    )
    const consult = consultResult.rows[0]

    let transcript = consult.transcript_raw || ''
    let diarized   = consult.transcript_diarized || []

    // Se não tem transcrição do WS, tenta pelo S3
    if (!transcript || transcript.trim().length < 10) {
      logger.info(`Sem transcrição do WS — tentando S3`)
      const result = await transcriptionService.transcribe(audioS3Key)
      transcript = result.transcript
      diarized   = result.diarized

      if (transcript) {
        await queryWithTenant(user.clinicId,
          `UPDATE consultations SET transcript_raw=$1, transcript_diarized=$2 WHERE id=$3`,
          [transcript, JSON.stringify(diarized), consultationId]
        )
      }
    }

    // Se ainda não tem transcrição, avisar e criar prontuário em branco
    if (!transcript || transcript.trim().length < 5) {
      logger.warn(`Consulta ${consultationId} sem transcrição — gerando prontuário vazio`)
      transcript = 'Transcrição não disponível para esta consulta.'
    }

    await queryWithTenant(user.clinicId,
      `UPDATE consultations SET status='generating' WHERE id=$1`, [consultationId]
    )

    emitToClinic(user.clinicId, `consulta:${consultationId}`, {
      event: 'transcription_ready', consultationId
    })

    // Buscar template
    const template = consult.template_id
      ? (await query('SELECT * FROM prontuario_templates WHERE id=$1', [consult.template_id])).rows[0]
      : null

    const prontuario = await prontuarioService.generate({
      consultationId,
      clinicId:  user.clinicId,
      patientId: consult.patient_id,
      doctorId:  user.userId,
      template,
      transcript,
      diarized
    })

    await queryWithTenant(user.clinicId,
      `UPDATE consultations SET status='review' WHERE id=$1`, [consultationId]
    )

    // Emitir via WebSocket direto para a sessão ativa
    const { emitToConsultation } = require('../consultations/consulta.ws')
      emitToConsultation(consultationId, {
        type: 'prontuario_ready',
        consultationId,
        prontuarioId: prontuario._id
      })

      // Também emitir via realtime para outras abas
      emitToClinic(user.clinicId, `consulta:${consultationId}`, {
        event: 'prontuario_ready',
        consultationId,
        prontuarioId: prontuario._id
    })

    logger.info(`Pipeline concluída para consulta ${consultationId}`)
  } catch (err) {
    logger.error(`Pipeline falhou para ${consultationId}:`, err)
    await query(
      `UPDATE consultations SET status='review' WHERE id=$1`, [consultationId]
    )
  }
}

module.exports = router;
