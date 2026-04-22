const logger = require('../shared/logger')

// S3 só inicializa se as credenciais estiverem configuradas
let s3 = null
let S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, getSignedUrl

if (process.env.AWS_ACCESS_KEY_ID) {
  try {
    const s3sdk = require('@aws-sdk/client-s3')
    const presigner = require('@aws-sdk/s3-request-presigner')
    S3Client = s3sdk.S3Client
    DeleteObjectCommand = s3sdk.DeleteObjectCommand
    PutObjectCommand = s3sdk.PutObjectCommand
    GetObjectCommand = s3sdk.GetObjectCommand
    getSignedUrl = presigner.getSignedUrl

    s3 = new S3Client({
      region: process.env.AWS_REGION || 'sa-east-1',
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  } catch (err) {
    logger.warn('AWS S3 não inicializado:', err.message)
  }
}

async function getS3UploadUrl(key, contentType, expiresIn = 3600) {
  // Sem S3, retorna URL vazia — áudio vai pelo WebSocket
  if (!s3) return null

  const cmd = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  })
  return getSignedUrl(s3, cmd, { expiresIn })
}

async function deleteS3Object(key) {
  if (!s3 || !key) return
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }))
  } catch (err) {
    logger.warn('S3 delete falhou:', err.message)
  }
}

module.exports = { getS3UploadUrl, deleteS3Object, s3 }