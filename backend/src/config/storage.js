// ── config/storage.js ─────────────────────────────────────────
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { PutObjectCommand } = require('@aws-sdk/client-s3')

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function getS3UploadUrl(key, contentType, expiresIn = 3600) {
  const cmd = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  })
  return getSignedUrl(s3, cmd, { expiresIn })
}

async function deleteS3Object(key) {
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  }))
}

module.exports = { getS3UploadUrl, deleteS3Object, s3 }
