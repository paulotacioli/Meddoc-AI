// ── REPORTS MODULE ────────────────────────────────────────────
// KPIs: produção por médico, tempo de documentação, uso de IA, churn

const router = require('express').Router();
const { queryWithTenant } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');

// Dashboard principal (médico ou gestor)
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const { clinicId, userId, role } = req.user;
    const today = new Date().toISOString().split('T')[0];

    // Consultas de hoje
    const todayFilter = role === 'medico'
      ? 'AND c.doctor_id = $2'
      : '';
    const params = role === 'medico' ? [clinicId, userId] : [clinicId];

    const todayConsults = await queryWithTenant(clinicId,
      `SELECT COUNT(*) FILTER (WHERE status = 'approved') AS approved,
              COUNT(*) FILTER (WHERE status = 'review')   AS pending_review,
              COUNT(*) FILTER (WHERE status = 'recording' OR status = 'transcribing' OR status = 'generating') AS in_progress,
              COUNT(*) AS total
       FROM consultations c
       WHERE clinic_id = $1 AND DATE(started_at) = '${today}' ${todayFilter}`,
      params
    );

    // Tempo médio de documentação (últimos 30 dias)
    const avgTime = await queryWithTenant(clinicId,
      `SELECT
         AVG(duration_sec)::INTEGER AS avg_duration_sec,
         AVG(EXTRACT(EPOCH FROM (pv.created_at - c.ended_at)))::INTEGER AS avg_approval_delay_sec
       FROM consultations c
       LEFT JOIN prontuario_versions pv ON pv.consultation_id = c.id AND pv.action = 'approved'
       WHERE c.clinic_id = $1 AND c.started_at > NOW() - INTERVAL '30 days'
         AND c.status = 'approved' ${todayFilter.replace('$2','$2')}`,
      params
    );

    // Prontuários pendentes de assinatura
    const pending = await queryWithTenant(clinicId,
      `SELECT c.id, p.name AS patient_name, c.started_at, c.doctor_id, u.name AS doctor_name
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = c.doctor_id
       WHERE c.clinic_id = $1 AND c.status = 'review' ${todayFilter}
       ORDER BY c.started_at ASC LIMIT 10`,
      params
    );

    res.json({
      today:   todayConsults.rows[0],
      avgTime: avgTime.rows[0],
      pendingReview: pending.rows,
    });
  } catch (err) { next(err); }
});

// Produção por médico (para gestores)
router.get('/production', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { startDate, endDate, doctorId } = req.query;

    const start = startDate || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const end   = endDate   || new Date().toISOString().split('T')[0];

    let whereExtra = '';
    const params = [clinicId, start, end];
    if (doctorId) { whereExtra = ' AND c.doctor_id = $4'; params.push(doctorId); }

    const result = await queryWithTenant(clinicId,
      `SELECT
         u.id AS doctor_id,
         u.name AS doctor_name,
         u.specialty,
         COUNT(c.id) AS total_consultations,
         COUNT(c.id) FILTER (WHERE c.status = 'approved') AS approved,
         AVG(c.duration_sec)::INTEGER AS avg_duration_sec,
         AVG(EXTRACT(EPOCH FROM (pv.created_at - c.ended_at)))::INTEGER AS avg_approval_delay_sec,
         COUNT(pv.id) FILTER (WHERE pv.action = 'edited') AS times_edited
       FROM users u
       LEFT JOIN consultations c ON c.doctor_id = u.id
         AND c.clinic_id = $1
         AND DATE(c.started_at) BETWEEN $2 AND $3
       LEFT JOIN prontuario_versions pv ON pv.consultation_id = c.id AND pv.action IN ('approved','edited')
       WHERE u.clinic_id = $1 AND u.role = 'medico' ${whereExtra}
       GROUP BY u.id, u.name, u.specialty
       ORDER BY total_consultations DESC`,
      params
    );

    res.json({ data: result.rows, period: { start, end } });
  } catch (err) { next(err); }
});

// Uso de IA (aprovação sem edição, regenerações)
router.get('/ai-usage', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const { clinicId } = req.user;

    const result = await queryWithTenant(clinicId,
      `SELECT
         COUNT(*) AS total_generated,
         COUNT(*) FILTER (WHERE pv.action = 'approved' AND edit_count.cnt = 0) AS approved_without_edit,
         COUNT(*) FILTER (WHERE pv.action = 'regenerated') AS regenerations,
         ROUND(100.0 * COUNT(*) FILTER (WHERE pv.action = 'approved' AND edit_count.cnt = 0)
               / NULLIF(COUNT(*) FILTER (WHERE pv.action = 'approved'),0), 1) AS approval_no_edit_pct
       FROM prontuario_versions pv
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cnt FROM prontuario_versions pv2
         WHERE pv2.consultation_id = pv.consultation_id AND pv2.action = 'edited'
       ) edit_count ON true
       WHERE pv.consultation_id IN (
         SELECT id FROM consultations WHERE clinic_id = $1
       ) AND pv.action = 'generated'`,
      [clinicId]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// Série temporal de consultas (gráfico)
router.get('/timeseries', authenticate, async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { days = 30 } = req.query;

    const result = await queryWithTenant(clinicId,
      `SELECT
         DATE(started_at) AS date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved
       FROM consultations
       WHERE clinic_id = $1 AND started_at > NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [clinicId]
    );

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

// Exportar relatório (CSV ou PDF)
router.get('/export', authenticate, requireRole(['admin','gestor']), async (req, res, next) => {
  try {
    const { clinicId } = req.user;
    const { format = 'csv', startDate, endDate } = req.query;

    const start = startDate || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const end   = endDate   || new Date().toISOString().split('T')[0];

    const result = await queryWithTenant(clinicId,
      `SELECT
         c.id, DATE(c.started_at) AS data, c.duration_sec,
         p.name AS paciente, u.name AS medico,
         u.specialty AS especialidade, c.status
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = c.doctor_id
       WHERE c.clinic_id = $1 AND DATE(c.started_at) BETWEEN $2 AND $3
       ORDER BY c.started_at DESC`,
      [clinicId, start, end]
    );

    if (format === 'csv') {
      const header = 'ID,Data,Duração(s),Paciente,Médico,Especialidade,Status\n';
      const rows = result.rows.map(r =>
        `${r.id},${r.data},${r.duration_sec},${r.paciente},${r.medico},${r.especialidade || ''},${r.status}`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio_${start}_${end}.csv"`);
      return res.send(header + rows);
    }

    res.json({ data: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
