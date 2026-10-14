import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Interfaz común: { driver, put(key, buffer, mime), read(key) → Buffer, remove(key), urlFor(fileRow) → Promise<string>,
//   head(key) → { bytes } | null, readHead(key, n) → Buffer } + s3: presignPut(key, mime, bytes) · local: putStream(key, stream, maxBytes)

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
    // Subida de videos sin cargarlos en memoria; corta si llegan más bytes de los declarados
    async putStream(key, stream, maxBytes) {
      const p = full(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      let n = 0;
      const limit = new Transform({
        transform(chunk, _enc, cb) {
          n += chunk.length;
          if (n > maxBytes) {
            const err = new Error('El archivo es más grande de lo declarado.');
            err.code = 'TOO_LARGE';
            return cb(err);
          }
          cb(null, chunk);
        },
      });
      try {
        await pipeline(stream, limit, createWriteStream(p));
      } catch (err) {
        await fs.rm(p, { force: true });
        throw err;
      }
    },
    async head(key) {
      try {
        return { bytes: (await fs.stat(full(key))).size };
      } catch {
        return null;
      }
    },
    async readHead(key, n) {
      const fh = await fs.open(full(key));
      try {
        const buf = Buffer.alloc(n);
        const { bytesRead } = await fh.read(buf, 0, n, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },
  };
}

export function createS3Storage({ endpoint, region = 'auto', bucket, accessKeyId, secretAccessKey, urlTtlSeconds = 3600 }) {
  // Sin checksums automáticos (SDK ≥3.729): en una URL firmada irían calculados sobre un cuerpo vacío y R2 rechazaría la subida
  const client = new S3Client({
    endpoint, region, credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
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
    // El navegador sube directo a R2 (el bucket necesita CORS para PUT desde el front)
    // Tamaño y tipo van firmados: R2 rechaza un PUT con otro tamaño o tipo que el declarado
    presignPut: (key, mime, bytes) => getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, ContentLength: bytes }),
      { expiresIn: 900, signableHeaders: new Set(['content-type', 'content-length']) },
    ),
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { bytes: out.ContentLength };
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async readHead(key, n) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${n - 1}` }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
  };
}
