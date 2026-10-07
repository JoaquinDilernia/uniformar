import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Interfaz común: { driver, put(key, buffer, mime), read(key) → Buffer, remove(key), urlFor(fileRow) → Promise<string> }

export function createLocalStorage({ dir }) {
  const root = path.resolve(dir);
  const full = (key) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('clave inválida');
    return p;
  };
  return {
    driver: 'local',
    async put(key, buffer) {
      const p = full(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, buffer);
    },
    read: (key) => fs.readFile(full(key)),
    remove: (key) => fs.rm(full(key), { force: true }),
    urlFor: async (file) => `/api/files/${file.id}/raw`,
  };
}

export function createS3Storage({ endpoint, region = 'auto', bucket, accessKeyId, secretAccessKey, urlTtlSeconds = 3600 }) {
  const client = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
  return {
    driver: 's3',
    put: (key, buffer, mime) => client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: buffer, ContentType: mime, CacheControl: 'private, max-age=31536000, immutable',
    })),
    async read(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    remove: (key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    // URL firmada: el bucket es privado; dura 1 h para que la galería no se rompa mientras se navega
    urlFor: (file) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: file.storage_key }), { expiresIn: urlTtlSeconds }),
  };
}
