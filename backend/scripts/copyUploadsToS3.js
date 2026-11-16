// Copia los archivos del disco (UPLOADS_DIR) al bucket S3, con la misma clave.
// Se puede correr varias veces: saltea lo que ya está en el bucket con el mismo tamaño.
// Uso (en el servidor): node scripts/copyUploadsToS3.js
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const need = (k) => process.env[k] || (() => { throw new Error(`Falta ${k}`); })();
const dir = path.resolve(need('UPLOADS_DIR'));
const bucket = need('S3_BUCKET');
const client = new S3Client({
  endpoint: need('S3_ENDPOINT'), region: process.env.S3_REGION || 'auto',
  credentials: { accessKeyId: need('S3_ACCESS_KEY_ID'), secretAccessKey: need('S3_SECRET_ACCESS_KEY') },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
});

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf' };

async function* walk(d) {
  for (const e of await fs.readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

async function remoteSize(key) {
  try {
    return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

let copied = 0; let skipped = 0; let bytes = 0;
for await (const file of walk(dir)) {
  const key = path.relative(dir, file).split(path.sep).join('/');
  const { size } = await fs.stat(file);
  if ((await remoteSize(key)) === size) { skipped++; continue; }
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: size,
    ContentType: MIME[path.extname(key).slice(1).toLowerCase()] ?? 'application/octet-stream',
    CacheControl: 'private, max-age=31536000, immutable',
  }));
  copied++; bytes += size;
  console.log(`ok ${key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log(`Listo: ${copied} copiados (${(bytes / 1024 / 1024).toFixed(0)} MB), ${skipped} ya estaban.`);
