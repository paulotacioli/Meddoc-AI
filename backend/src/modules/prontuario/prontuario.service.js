// ── PRONTUÁRIO SERVICE ────────────────────────────────────────
// Geração de prontuário estruturado via LLM (Claude ou GPT-4o)
// Inclui: sugestão CID-10, extração de medicamentos, regeneração de seção

const Anthropic = require('@anthropic-ai/sdk');
const { Prontuario, queryWithTenant, query } = require('../../config/database');
const cid10Service = require('../../shared/cid10');
const logger = require('../../shared/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── GERAÇÃO PRINCIPAL ─────────────────────────────────────────
async function generate({ consultationId, clinicId, patientId, doctorId, template, transcript, diarized }) {
  logger.info(`Gerando prontuário para consulta ${consultationId}`);

  // Buscar histórico recente do paciente para contexto
  const history = await queryWithTenant(clinicId,
    `SELECT c.started_at, pv.mongo_doc_id
     FROM consultations c
     JOIN prontuario_versions pv ON pv.consultation_id = c.id
     WHERE c.patient_id = $1 AND c.clinic_id = $2 AND c.status = 'approved'
     ORDER BY c.started_at DESC LIMIT 3`,
    [patientId, clinicId]
  );

  const templateStructure = template?.structure || getDefaultSOAPStructure();
  const fields = {};

  // Gerar cada seção do template em paralelo
  const sectionPromises = templateStructure.map(async (section) => {
    const content = await generateSection({
      sectionKey:   section.key,
      sectionLabel: section.label,
      aiPrompt:     section.ai_prompt,
      transcript,
      diarized,
      templateType: template?.type || 'SOAP',
    });
    return { key: section.key, content };
  });

  const sections = await Promise.all(sectionPromises);
  sections.forEach(({ key, content }) => { fields[key] = content; });

  // Sugestão de CID-10
  const cid10Suggestions = await cid10Service.suggest(
    fields.avaliacao || fields.queixa_principal || transcript,
    3
  );

  // Extração de medicamentos mencionados
  const medications = await extractMedications(transcript);

  // Salvar no MongoDB
  const prontuario = await Prontuario.create({
    consultationId,
    clinicId,
    patientId,
    doctorId,
    templateType: template?.type || 'SOAP',
    version: 1,
    fields,
    cid10: cid10Suggestions,
    medications,
    status: 'review',
    aiMetadata: {
      model: 'claude-sonnet-4-20250514',
      generatedAt: new Date(),
    }
  });

  // Registrar versão no PostgreSQL
  await queryWithTenant(clinicId,
    `INSERT INTO prontuario_versions
       (consultation_id, version, mongo_doc_id, created_by, action)
     VALUES ($1, 1, $2, $3, 'generated')`,
    [consultationId, prontuario._id.toString(), doctorId]
  );

  logger.info(`Prontuário gerado: ${prontuario._id}`);
  return prontuario;
}

// ── GERAR SEÇÃO INDIVIDUAL ───────────────────────────────────
async function generateSection({ sectionKey, sectionLabel, aiPrompt, transcript, diarized, templateType }) {
  // Formatar transcrição com diarização se disponível
  const formattedTranscript = diarized?.length
    ? diarized.map(seg => `[${seg.speaker}]: ${seg.text}`).join('\n')
    : transcript;

  const systemPrompt = `Você é um assistente médico especializado em documentação clínica brasileira.
Gere conteúdo clínico preciso, objetivo e em português do Brasil.
Use terminologia médica adequada. Seja conciso mas completo.
NUNCA invente informações não presentes na transcrição.
Se uma informação não foi mencionada, indique "Não relatado".`;

  const userPrompt = `Com base na transcrição da consulta abaixo, preencha a seção: "${sectionLabel}"

Instrução específica: ${aiPrompt}

TRANSCRIÇÃO:
${formattedTranscript}

Responda APENAS com o conteúdo da seção, sem título, sem formatação extra.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });
    return message.content[0].text.trim();
  } catch (err) {
    logger.error(`Erro gerando seção ${sectionKey}:`, err);
    return `[Erro na geração automática - preencher manualmente]`;
  }
}

// ── REGENERAR SEÇÃO ESPECÍFICA ────────────────────────────────
async function regenerateSection({ prontuarioId, sectionKey, consultationId, clinicId, userId }) {
  const prontuario = await Prontuario.findById(prontuarioId);
  if (!prontuario) throw new Error('Prontuário não encontrado');

  const consultation = await queryWithTenant(clinicId,
    'SELECT transcript_raw, transcript_diarized, template_id FROM consultations WHERE id = $1',
    [consultationId]
  );
  const consult = consultation.rows[0];

  const template = consult.template_id
    ? (await query('SELECT * FROM prontuario_templates WHERE id = $1', [consult.template_id])).rows[0]
    : null;

  const section = (template?.structure || getDefaultSOAPStructure())
    .find(s => s.key === sectionKey);
  if (!section) throw new Error('Seção não encontrada');

  const newContent = await generateSection({
    sectionKey:   section.key,
    sectionLabel: section.label,
    aiPrompt:     section.ai_prompt,
    transcript:   consult.transcript_raw,
    diarized:     consult.transcript_diarized,
    templateType: template?.type || 'SOAP',
  });

  // Criar nova versão
  const newVersion = await Prontuario.create({
    ...prontuario.toObject(),
    _id: undefined,
    version: prontuario.version + 1,
    fields: { ...prontuario.fields, [sectionKey]: newContent },
    status: 'review',
    aiMetadata: { ...prontuario.aiMetadata, generatedAt: new Date(), editedSections: [sectionKey] }
  });

  await queryWithTenant(clinicId,
    `INSERT INTO prontuario_versions (consultation_id, version, mongo_doc_id, created_by, action)
     VALUES ($1, $2, $3, $4, 'regenerated')`,
    [consultationId, newVersion.version, newVersion._id.toString(), userId]
  );

  return newVersion;
}

// ── APROVAR PRONTUÁRIO ────────────────────────────────────────
async function approve({ prontuarioId, consultationId, clinicId, userId, editedFields }) {
  const updateData = { status: 'approved' };
  if (editedFields) updateData.fields = editedFields;

  const prontuario = await Prontuario.findByIdAndUpdate(prontuarioId, updateData, { new: true });

  await queryWithTenant(clinicId,
    `UPDATE consultations SET status = 'approved' WHERE id = $1`,
    [consultationId]
  );
  await queryWithTenant(clinicId,
    `INSERT INTO prontuario_versions (consultation_id, version, mongo_doc_id, created_by, action)
     VALUES ($1, $2, $3, $4, 'approved')`,
    [consultationId, prontuario.version, prontuario._id.toString(), userId]
  );

  // Disparar integração HIS
  const { syncToHIS } = require('../integrations/integrations.service');
  syncToHIS({ consultationId, clinicId, prontuario }).catch(logger.error);

  // Disparar webhooks
  const { triggerWebhook } = require('../integrations/webhook.service');
  triggerWebhook({ clinicId, event: 'prontuario.approved', payload: { consultationId, prontuarioId } }).catch(logger.error);

  return prontuario;
}

// ── EXTRAÇÃO DE MEDICAMENTOS ──────────────────────────────────
async function extractMedications(transcript) {
  if (!transcript || transcript.length < 50) return [];
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Extraia medicamentos mencionados nesta transcrição médica. Responda APENAS com JSON válido no formato:
[{"name":"nome","dose":"dose","frequency":"frequencia","duration":"duracao"}]
Se não houver medicamentos, responda: []

TRANSCRIÇÃO: ${transcript.substring(0, 2000)}`
      }]
    });
    const text = msg.content[0].text.trim();
    return JSON.parse(text);
  } catch {
    return [];
  }
}

function getDefaultSOAPStructure() {
  return [
    { key: 'subjetivo',  label: 'Subjetivo (S)',  ai_prompt: 'Resuma as queixas e relato do paciente em linguagem clínica' },
    { key: 'objetivo',   label: 'Objetivo (O)',   ai_prompt: 'Dados objetivos do exame físico e sinais vitais mencionados' },
    { key: 'avaliacao',  label: 'Avaliação (A)',  ai_prompt: 'Hipótese diagnóstica com raciocínio clínico' },
    { key: 'plano',      label: 'Plano (P)',      ai_prompt: 'Condutas, prescrições e encaminhamentos definidos' },
    { key: 'cid10',      label: 'CID-10',         ai_prompt: 'Código CID-10 mais adequado ao diagnóstico' },
  ];
}

module.exports = { generate, generateSection, regenerateSection, approve };
