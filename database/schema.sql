-- ============================================================
-- MedDoc AI — Schema PostgreSQL Completo
-- LGPD: Row-Level Security por tenant (clinica)
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── CLÍNICAS (Tenants) ───────────────────────────────────────
CREATE TABLE clinics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  cnpj          TEXT UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  logo_url      TEXT,
  address       JSONB,             -- { rua, numero, cidade, estado, cep }
  plan          TEXT NOT NULL DEFAULT 'starter'
                  CHECK (plan IN ('starter','pro','enterprise')),
  plan_status   TEXT NOT NULL DEFAULT 'trial'
                  CHECK (plan_status IN ('trial','active','past_due','canceled')),
  trial_ends_at TIMESTAMPTZ,
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  his_integration        JSONB DEFAULT '{}', -- {type, base_url, api_key_enc}
  settings               JSONB DEFAULT '{}', -- {audio_retention_hours, default_template}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ── USUÁRIOS ─────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'medico'
                    CHECK (role IN ('admin','medico','recepcionista','gestor')),
  crm             TEXT,            -- Número CRM (médicos)
  specialty       TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  two_fa_enabled  BOOLEAN DEFAULT false,
  two_fa_secret   TEXT,            -- criptografado
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  invited_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_users_email  ON users(email);

-- ── CONVITES ─────────────────────────────────────────────────
CREATE TABLE invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  invited_by  UUID NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PACIENTES ────────────────────────────────────────────────
CREATE TABLE patients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  cpf_enc         TEXT,            -- CPF criptografado AES-256
  cpf_hash        TEXT,            -- SHA-256 do CPF para busca
  birth_date      DATE,
  gender          TEXT CHECK (gender IN ('M','F','O','N')),
  email           TEXT,
  phone           TEXT,
  health_plan     TEXT,
  health_plan_id  TEXT,
  his_patient_id  TEXT,            -- ID no HIS externo
  fhir_patient_id TEXT,            -- ID no servidor FHIR
  consent_given   BOOLEAN DEFAULT false,
  consent_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ      -- soft delete LGPD
);

CREATE INDEX idx_patients_clinic   ON patients(clinic_id);
CREATE INDEX idx_patients_cpf_hash ON patients(cpf_hash);

-- ── TEMPLATES DE PRONTUÁRIO ───────────────────────────────────
CREATE TABLE prontuario_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE, -- NULL = global
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('SOAP','anamnese','retorno','urgencia','livre')),
  specialty   TEXT,
  structure   JSONB NOT NULL,  -- [ { key, label, required, ai_prompt } ]
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Templates globais (seed)
INSERT INTO prontuario_templates (name, type, is_default, structure) VALUES
('SOAP Padrão', 'SOAP', true, '[
  {"key":"subjetivo","label":"Subjetivo (S)","required":true,"ai_prompt":"Resuma o que o paciente relatou em linguagem clínica formal"},
  {"key":"objetivo","label":"Objetivo (O)","required":true,"ai_prompt":"Dados objetivos coletados pelo médico"},
  {"key":"avaliacao","label":"Avaliação (A)","required":true,"ai_prompt":"Hipótese diagnóstica e raciocínio clínico"},
  {"key":"plano","label":"Plano (P)","required":true,"ai_prompt":"Conduta, prescrição e encaminhamentos"},
  {"key":"cid10","label":"CID-10","required":false,"ai_prompt":"Sugira o código CID-10 mais adequado"}
]'),
('Anamnese Completa', 'anamnese', false, '[
  {"key":"queixa_principal","label":"Queixa Principal","required":true,"ai_prompt":"Queixa principal em linguagem clínica"},
  {"key":"hda","label":"História da Doença Atual","required":true,"ai_prompt":"HDA detalhada com início, duração, características"},
  {"key":"antecedentes","label":"Antecedentes Pessoais","required":false,"ai_prompt":"Doenças prévias, cirurgias, medicamentos em uso"},
  {"key":"historia_familiar","label":"História Familiar","required":false,"ai_prompt":"Doenças relevantes na família"},
  {"key":"revisao_sistemas","label":"Revisão de Sistemas","required":false,"ai_prompt":"Revisão por sistemas relevantes mencionados"}
]');

-- ── CONSULTAS ────────────────────────────────────────────────
CREATE TABLE consultations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  doctor_id       UUID NOT NULL REFERENCES users(id),
  template_id     UUID REFERENCES prontuario_templates(id),
  status          TEXT NOT NULL DEFAULT 'recording'
                    CHECK (status IN ('recording','transcribing','generating','review','approved','signed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_sec    INTEGER,
  audio_s3_key    TEXT,            -- removido após transcrição (LGPD)
  audio_expires_at TIMESTAMPTZ,
  transcript_raw  TEXT,            -- transcrição bruta Whisper
  transcript_diarized JSONB,       -- [ {speaker, text, start_ms, end_ms} ]
  his_encounter_id TEXT,           -- ID no HIS externo
  fhir_encounter_id TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consultations_clinic  ON consultations(clinic_id);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_doctor  ON consultations(doctor_id);
CREATE INDEX idx_consultations_status  ON consultations(status);
CREATE INDEX idx_consultations_date    ON consultations(started_at DESC);

-- ── PRONTUÁRIOS (versão aprovada + histórico de edições) ──────
-- Documento principal em MongoDB (ver prontuarios collection)
-- Aqui: metadados e controle de versão

CREATE TABLE prontuario_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  mongo_doc_id    TEXT NOT NULL,    -- _id do documento no MongoDB
  created_by      UUID NOT NULL REFERENCES users(id),
  action          TEXT NOT NULL CHECK (action IN ('generated','edited','regenerated','approved','signed')),
  signed_at       TIMESTAMPTZ,
  signature_data  TEXT,             -- hash ICP-Brasil
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pv_consultation ON prontuario_versions(consultation_id);

-- ── LOGS DE AUDITORIA (LGPD) ─────────────────────────────────
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  clinic_id   UUID REFERENCES clinics(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_clinic   ON audit_logs(clinic_id, created_at DESC);
CREATE INDEX idx_audit_user     ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource, resource_id);

-- ── INTEGRAÇÕES / WEBHOOKS ───────────────────────────────────
CREATE TABLE integration_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE UNIQUE,
  his_type    TEXT CHECK (his_type IN ('tasy','mv','generic_fhir','generic_rest')),
  base_url    TEXT,
  api_key_enc TEXT,         -- criptografado
  fhir_server TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  is_active   BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  config      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id),
  event_type      TEXT NOT NULL,   -- prontuario.approved, consultation.ended
  payload         JSONB NOT NULL,
  target_url      TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts        INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_code   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ASSINATURAS / BILLING ────────────────────────────────────
CREATE TABLE billing_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id           UUID NOT NULL REFERENCES clinics(id),
  stripe_event_id     TEXT UNIQUE,
  event_type          TEXT NOT NULL,
  amount_cents        INTEGER,
  currency            TEXT DEFAULT 'brl',
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- Garante isolamento total por clínica a nível de banco

ALTER TABLE patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prontuario_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

-- Política: aplicação se autentica com SET app.current_clinic_id = '...'
CREATE POLICY clinic_isolation_patients ON patients
  USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY clinic_isolation_consultations ON consultations
  USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY clinic_isolation_versions ON prontuario_versions
  USING (consultation_id IN (
    SELECT id FROM consultations
    WHERE clinic_id = current_setting('app.current_clinic_id', true)::UUID
  ));

-- ── FUNÇÃO: updated_at automático ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_consultations_updated_at
  BEFORE UPDATE ON consultations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
