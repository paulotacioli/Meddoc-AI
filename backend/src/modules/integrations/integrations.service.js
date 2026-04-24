// ── INTEGRATIONS SERVICE ──────────────────────────────────────
// HL7 FHIR R4, Tasy (Philips), MV (Soul MV), webhooks genéricos

const axios = require('axios');
const { query, queryWithTenant } = require('../../config/database');
const { decrypt } = require('../../shared/crypto');
const logger = require('../../shared/logger');

// ── HL7 FHIR R4 BUILDER ───────────────────────────────────────
function buildFHIREncounter({ consultation, patient, doctor, clinic }) {
  return {
    resourceType: 'Encounter',
    id: consultation.id,
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory'
    },
    type: [{
      coding: [{
        system: 'http://snomed.info/sct',
        code: '11429006',
        display: 'Consultation'
      }]
    }],
    subject: {
      reference: `Patient/${patient.fhir_patient_id || patient.id}`,
      display: patient.name
    },
    participant: [{
      individual: {
        reference: `Practitioner/${doctor.id}`,
        display: doctor.name
      }
    }],
    period: {
      start: consultation.started_at,
      end:   consultation.ended_at
    },
    serviceProvider: {
      reference: `Organization/${clinic.id}`,
      display: clinic.name
    }
  };
}

function buildFHIRDocumentReference({ prontuario, consultation, patient }) {
  const content = Object.entries(prontuario.fields)
    .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
    .join('\n\n');

  return {
    resourceType: 'DocumentReference',
    id: prontuario._id.toString(),
    status: 'current',
    type: {
      coding: [{
        system: 'http://loinc.org',
        code: '11488-4',
        display: 'Consult note'
      }]
    },
    subject: { reference: `Patient/${patient.fhir_patient_id || patient.id}` },
    date: new Date().toISOString(),
    content: [{
      attachment: {
        contentType: 'text/plain',
        language: 'pt-BR',
        data: Buffer.from(content).toString('base64'),
        title: `Prontuário - ${new Date(consultation.started_at).toLocaleDateString('pt-BR')}`
      }
    }],
    context: {
      encounter: [{ reference: `Encounter/${consultation.id}` }]
    }
  };
}

// ── SYNC AO HIS DA CLÍNICA ────────────────────────────────────
async function syncToHIS({ consultationId, clinicId, prontuario }) {
  const integConfig = await queryWithTenant(clinicId,
    'SELECT * FROM integration_configs WHERE clinic_id = $1 AND is_active = true',
    [clinicId]
  );
  if (!integConfig.rows.length) return; // Sem integração configurada

  const config = integConfig.rows[0];

  // Validate required URL before attempting sync
  const effectiveUrl = config.fhir_server || config.base_url;
  if (!effectiveUrl) {
    logger.warn(`HIS sync ignorado: clínica ${clinicId} sem URL configurada`);
    return;
  }

  const apiKey = config.api_key_enc ? decrypt(config.api_key_enc) : '';

  const consultation = (await queryWithTenant(clinicId,
    `SELECT c.*, p.name AS patient_name, p.fhir_patient_id,
            u.name AS doctor_name, cl.name AS clinic_name
     FROM consultations c
     JOIN patients p ON p.id = c.patient_id
     JOIN users u ON u.id = c.doctor_id
     JOIN clinics cl ON cl.id = c.clinic_id
     WHERE c.id = $1`, [consultationId]
  )).rows[0];

  try {
    switch (config.his_type) {
      case 'generic_fhir':
        await syncFHIR({ config, consultation, prontuario, apiKey });
        break;
      case 'tasy':
        await syncTasy({ config, consultation, prontuario, apiKey });
        break;
      case 'mv':
        await syncMV({ config, consultation, prontuario, apiKey });
        break;
      case 'generic_rest':
        await syncGenericREST({ config, consultation, prontuario, apiKey });
        break;
    }

    await query(
      `UPDATE integration_configs SET last_sync_at = NOW() WHERE clinic_id = $1`,
      [clinicId]
    );
    logger.info(`HIS sync OK: clínica ${clinicId}, consulta ${consultationId}`);
  } catch (err) {
    logger.error(`HIS sync FALHOU: clínica ${clinicId}:`, err.message);
    // Salvar erro para retentativa
    await query(
      `UPDATE integration_configs SET config = jsonb_set(config, '{last_error}', $1) WHERE clinic_id = $2`,
      [JSON.stringify(err.message), clinicId]
    );
  }
}

async function syncFHIR({ config, consultation, prontuario, apiKey }) {
  const headers = {
    'Content-Type': 'application/fhir+json',
    'Authorization': `Bearer ${apiKey}`,
  };
  const baseUrl = config.fhir_server || config.base_url;

  const encounter = buildFHIREncounter({
    consultation,
    patient: { id: consultation.patient_id, fhir_patient_id: consultation.fhir_patient_id, name: consultation.patient_name },
    doctor:  { id: consultation.doctor_id, name: consultation.doctor_name },
    clinic:  { id: consultation.clinic_id, name: consultation.clinic_name }
  });

  // Upsert Encounter
  await axios.put(`${baseUrl}/Encounter/${encounter.id}`, encounter, { headers });

  // Criar DocumentReference com o prontuário
  const docRef = buildFHIRDocumentReference({ prontuario, consultation, patient: { fhir_patient_id: consultation.fhir_patient_id } });
  await axios.post(`${baseUrl}/DocumentReference`, docRef, { headers });
}

async function syncTasy({ config, consultation, prontuario, apiKey }) {
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // Fall back to local IDs when HIS-specific IDs haven't been mapped yet
  const encounterId = consultation.his_encounter_id || consultation.id;
  const patientId   = consultation.his_patient_id   || consultation.patient_id;
  if (!consultation.his_encounter_id) {
    logger.warn(`Tasy sync: his_encounter_id ausente para consulta ${consultation.id}, usando ID local`);
  }

  const payload = {
    codigoAtendimento: encounterId,
    codigoPaciente:    patientId,
    dataAtendimento:   consultation.started_at,
    tipoProntuario:    prontuario.templateType,
    conteudo:          prontuario.fields,
    diagnostico:       prontuario.cid10?.[0]?.code,
  };

  const response = await axios.post(`${config.base_url}/api/prontuario`, payload, { headers });

  // Persist the HIS encounter ID returned by Tasy for future syncs
  const returnedId = response.data?.codigoAtendimento || response.data?.id;
  if (returnedId && !consultation.his_encounter_id) {
    await query(
      'UPDATE consultations SET his_encounter_id=$1 WHERE id=$2',
      [String(returnedId), consultation.id]
    );
  }
}

async function syncMV({ config, consultation, prontuario, apiKey }) {
  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  const encounterId = consultation.his_encounter_id || consultation.id;
  const patientId   = consultation.his_patient_id   || consultation.patient_id;
  if (!consultation.his_encounter_id) {
    logger.warn(`MV sync: his_encounter_id ausente para consulta ${consultation.id}, usando ID local`);
  }

  const payload = {
    idConsulta:  encounterId,
    idPaciente:  patientId,
    dataHora:    consultation.started_at,
    texto:       Object.entries(prontuario.fields).map(([k,v]) => `${k}: ${v}`).join('\n'),
    cid:         prontuario.cid10?.[0]?.code,
  };

  const response = await axios.post(`${config.base_url}/mv/prontuario/inserir`, payload, { headers });

  const returnedId = response.data?.idConsulta || response.data?.id;
  if (returnedId && !consultation.his_encounter_id) {
    await query(
      'UPDATE consultations SET his_encounter_id=$1 WHERE id=$2',
      [String(returnedId), consultation.id]
    );
  }
}

async function syncGenericREST({ config, consultation, prontuario, apiKey }) {
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  await axios.post(`${config.base_url}/prontuario`, {
    consultationId: consultation.id,
    patientId:      consultation.patient_id,
    date:           consultation.started_at,
    fields:         prontuario.fields,
    cid10:          prontuario.cid10,
    medications:    prontuario.medications,
  }, { headers });
}

module.exports = { syncToHIS, buildFHIREncounter, buildFHIRDocumentReference };
