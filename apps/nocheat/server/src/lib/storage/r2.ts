import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
    },
  })
}

export async function uploadToR2(
  client: S3Client,
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = process.env['R2_BUCKET_NAME'] ?? ''
  const publicUrl = process.env['R2_PUBLIC_URL'] ?? ''

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }),
  )

  return `${publicUrl}/${key}`
}
