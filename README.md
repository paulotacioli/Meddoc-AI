# MedDoc AI — Full-Stack SaaS

## Estrutura do Projeto

```
meddoc/
├── README.md
├── docker-compose.yml
├── .env.example
│
├── backend/                    # Node.js + Express API
│   ├── package.json
│   ├── src/
│   │   ├── server.js           # Entry point
│   │   ├── config/
│   │   │   ├── database.js     # PostgreSQL + MongoDB connections
│   │   │   ├── redis.js        # Cache / sessions
│   │   │   └── storage.js      # AWS S3 config
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT + 2FA
│   │   │   ├── tenant.js       # Multitenancy (row-level security)
│   │   │   ├── audit.js        # LGPD audit logging
│   │   │   └── rateLimit.js
│   │   ├── modules/
│   │   │   ├── auth/           # Autenticacao, 2FA, convites
│   │   │   ├── clinics/        # Multitenancy, planos, onboarding
│   │   │   ├── patients/       # CRUD pacientes
│   │   │   ├── consultations/  # Sessoes de consulta, audio
│   │   │   ├── transcription/  # Whisper API integration
│   │   │   ├── prontuario/     # LLM generation (Claude/GPT)
│   │   │   ├── integrations/   # HL7 FHIR, webhooks, HIS
│   │   │   ├── billing/        # Stripe planos/assinaturas
│   │   │   └── reports/        # Dashboard, KPIs
│   │   └── shared/
│   │       ├── fhir.js         # HL7 FHIR R4 builder
│   │       ├── cid10.js        # CID-10 suggestion engine
│   │       └── crypto.js       # AES-256 encrypt/decrypt
│
├── frontend/                   # React + Vite
│   ├── package.json
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Onboarding.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ConsultaAtiva.jsx
│   │   │   ├── Prontuario.jsx
│   │   │   ├── Pacientes.jsx
│   │   │   ├── Relatorios.jsx
│   │   │   └── Configuracoes.jsx
│   │   ├── components/
│   │   │   ├── AudioRecorder.jsx
│   │   │   ├── TranscricaoLive.jsx
│   │   │   ├── ProntuarioEditor.jsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   ├── useAudio.js
│   │   │   └── useConsulta.js
│   │   └── services/
│   │       ├── api.js
│   │       └── websocket.js
│
├── database/
│   ├── migrations/             # PostgreSQL migrations
│   ├── seeds/                  # Dados iniciais (templates, CID-10)
│   └── schema.sql              # Schema completo documentado
│
└── infra/
    ├── nginx.conf
    └── Dockerfile.backend / Dockerfile.frontend
```
