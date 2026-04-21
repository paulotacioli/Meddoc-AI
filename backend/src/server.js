require('dotenv').config()
const express    = require('express')
const expressWs  = require('express-ws')
const cors       = require('cors')
const helmet     = require('helmet')
const compression = require('compression')
const { connectPostgres, connectMongo } = require('./config/database')
const { connectRedis } = require('./config/redis')
const logger     = require('./shared/logger')
const { errorHandler } = require('./middleware/errorHandler')
const { auditMiddleware } = require('./middleware/audit')

const authRouter          = require('./modules/auth/auth.routes')
const clinicsRouter       = require('./modules/clinics/clinics.routes')
const patientsRouter      = require('./modules/patients/patients.routes')
const consultationsRouter = require('./modules/consultations/consultations.routes')
const prontuarioRouter    = require('./modules/prontuario/prontuario.routes')
const integrationsRouter  = require('./modules/integrations/integrations.routes')
const billingRouter       = require('./modules/billing/billing.routes')
const reportsRouter       = require('./modules/reports/reports.routes')

const app = express()
expressWs(app)

app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}))
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(auditMiddleware)

app.get('/health', (req, res) =>
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() })
)

app.use('/api/auth',          authRouter)
app.use('/api/clinics',       clinicsRouter)
app.use('/api/patients',      patientsRouter)
app.use('/api/consultations', consultationsRouter)
app.use('/api/prontuario',    prontuarioRouter)
app.use('/api/integrations',  integrationsRouter)
app.use('/api/billing',       billingRouter)
app.use('/api/reports',       reportsRouter)

const wsHandler = require('./modules/consultations/consulta.ws')
app.ws('/ws/consulta/:consultationId', wsHandler)

app.use(errorHandler)

async function bootstrap() {
  try {
    await connectPostgres()
    logger.info('PostgreSQL conectado')
    await connectMongo()
    logger.info('MongoDB conectado')
    await connectRedis()
    logger.info('Redis conectado')
    const PORT = process.env.PORT || 3001
    app.listen(PORT, () => logger.info(`MedDoc AI Backend na porta ${PORT}`))
    require('./jobs/audioCleanup')
  } catch (err) {
    logger.error('Falha ao inicializar:', err)
    process.exit(1)
  }
}

bootstrap()
module.exports = app
