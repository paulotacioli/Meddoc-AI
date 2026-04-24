const { Pool } = require('pg');
const mongoose = require('mongoose');
const logger = require('../shared/logger');

process.env.PGPASSWORD = 'pronova123';

process.env.PGPASSWORD    = 'pronova123';
process.env.PGUSER        = 'pronova';
process.env.PGDATABASE    = 'pronova';
process.env.PGHOST        = 'localhost';
process.env.PGPORT        = '5432';
// ── POSTGRESQL ───────────────────────────────────────────────
const pool = new Pool({
  host:     '127.0.0.1',
  port:     5432,
  database: 'pronova',
  user:     'pronova',
  password: 'pronova123',
  max:      20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
  ssl:      false,
});

pool.on('error', (err) => logger.error('PostgreSQL pool error:', err));

async function connectPostgres() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('PostgreSQL conectado');
}

/**
 * Executa query com Row-Level Security ativado para o tenant
 * Toda query que acessa dados de pacientes/consultas DEVE usar esta função
 */
async function queryWithTenant(clinicId, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_clinic_id = '${clinicId}'`);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function query(text, params) {
  return pool.query(text, params);
}

// ── MONGODB ──────────────────────────────────────────────────
async function connectMongo() {
  await mongoose.connect(process.env.MONGO_URL, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  logger.info('MongoDB conectado');
}

// Schema do prontuário no MongoDB (documento livre)
const prontuarioSchema = new mongoose.Schema({
  consultationId: { type: String, required: true, index: true },
  clinicId:       { type: String, required: true, index: true },
  patientId:      { type: String, required: true },
  doctorId:       { type: String, required: true },
  templateType:   { type: String, required: true },
  version:        { type: Number, default: 1 },
  fields:         { type: mongoose.Schema.Types.Mixed }, // Conteúdo dinâmico por template
  cid10:          [{ code: String, description: String, confidence: Number }],
  medications:    [{ name: String, dose: String, frequency: String, duration: String }],
  status:         { type: String, default: 'draft', enum: ['draft','review','approved','signed'] },
  aiMetadata: {
    model:          String,
    promptTokens:   Number,
    completionTokens: Number,
    generatedAt:    Date,
    editedSections: [String],
  },
  signedAt:       Date,
  signatureHash:  String,
}, { timestamps: true });

prontuarioSchema.index({ consultationId: 1, version: -1 });

const Prontuario = mongoose.model('Prontuario', prontuarioSchema);

module.exports = { connectPostgres, connectMongo, query, queryWithTenant, pool, Prontuario };
