// Object storage — replaces Base44 UploadFile / UploadPrivateFile /
// CreateFileSignedUrl. Two drivers:
//   local → files under ./_storage, served by this API (dev only)
//   s3    → any S3-compatible store (AWS S3, Cloudflare R2, MinIO, Supabase)
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { config } from '../config.js';

const ROOT = join(process.cwd(), '_storage');

function safeName(name: string) {
  const base = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${randomUUID()}_${base}`;
}

// ── S3 (lazy) ────────────────────────────────────────────────────────────────
let _s3: any = null;
async function s3() {
  if (_s3) return _s3;
  let mod: any;
  try {
    mod = await import('@aws-sdk/client-s3');
  } catch {
    throw new Error('STORAGE_DRIVER=s3 requires @aws-sdk/client-s3 (npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner)');
  }
  const client = new mod.S3Client({
    region: config.storage.s3.region,
    endpoint: config.storage.s3.endpoint || undefined,
    forcePathStyle: config.storage.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.storage.s3.accessKeyId,
      secretAccessKey: config.storage.s3.secretAccessKey,
    },
  });
  _s3 = { client, mod };
  return _s3;
}

export interface UploadResult {
  file_url?: string; // public
  file_uri?: string; // private opaque reference
}

export async function uploadPublic(buffer: Buffer, filename: string, mime: string): Promise<{ file_url: string }> {
  const key = safeName(filename);
  if (config.storage.driver === 's3') {
    const { client, mod } = await s3();
    await client.send(new mod.PutObjectCommand({ Bucket: config.storage.s3.bucketPublic, Key: key, Body: buffer, ContentType: mime, ACL: 'public-read' }));
    return { file_url: `${config.storage.publicBaseUrl.replace(/\/$/, '')}/${key}` };
  }
  const dir = join(ROOT, 'public');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), buffer);
  return { file_url: `${config.storage.publicBaseUrl.replace(/\/$/, '')}/public/${key}` };
}

/**
 * Build a foldered object key, e.g. payments/<contest>/funding/<funding>/proof.
 *
 * The prefix must be assembled from ids the SERVER owns — never from a filename
 * or any other client string. It is sanitised again here so a stray value can
 * still not escape the bucket, and the local driver flattens it (its file route
 * serves a single directory) while S3/R2 keeps the real folder structure.
 */
export function storagePrefix(...segments: string[]): string {
  return segments
    .map((s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64))
    .filter(Boolean)
    .join('/');
}

export async function uploadPrivate(
  buffer: Buffer,
  filename: string,
  mime: string,
  prefix?: string
): Promise<{ file_uri: string; storage_path: string }> {
  const name = safeName(filename);
  const clean = prefix ? storagePrefix(...prefix.split('/')) : '';
  // S3/R2 gets real folders; the local dev driver flattens them so the existing
  // single-directory file route keeps working unchanged.
  const key = clean
    ? (config.storage.driver === 's3' ? `${clean}/${name}` : `${clean.replace(/\//g, '__')}__${name}`)
    : name;
  const storage_path = clean ? `${clean}/${name}` : name;
  if (config.storage.driver === 's3') {
    const { client, mod } = await s3();
    await client.send(new mod.PutObjectCommand({ Bucket: config.storage.s3.bucketPrivate, Key: key, Body: buffer, ContentType: mime }));
    return { file_uri: `s3:${key}`, storage_path };
  }
  const dir = join(ROOT, 'private');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), buffer);
  return { file_uri: `local:${key}`, storage_path };
}

export async function createSignedUrl(fileUri: string, expiresInSec = 3600): Promise<{ signed_url: string }> {
  if (!fileUri) throw new Error('file_uri is required');
  if (fileUri.startsWith('s3:')) {
    const key = fileUri.slice(3);
    const { client, mod } = await s3();
    const presign = await import('@aws-sdk/s3-request-presigner');
    const url = await presign.getSignedUrl(client, new mod.GetObjectCommand({ Bucket: config.storage.s3.bucketPrivate, Key: key }), { expiresIn: expiresInSec });
    return { signed_url: url };
  }
  // local: signed token validated by the /files/private route
  const key = fileUri.replace(/^local:/, '');
  const exp = Date.now() + expiresInSec * 1000;
  const sig = signLocal(key, exp);
  return { signed_url: `${config.storage.publicBaseUrl.replace(/\/$/, '')}/private/${key}?exp=${exp}&sig=${sig}` };
}

export function signLocal(key: string, exp: number): string {
  return createHmac('sha256', config.jwtSecret).update(`${key}.${exp}`).digest('hex');
}

export async function readLocal(kind: 'public' | 'private', key: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const path = join(ROOT, kind, key);
  if (!existsSync(path)) return null;
  await stat(path);
  const buffer = await readFile(path);
  return { buffer, mime: mimeFromExt(extname(key)) };
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.pdf': 'application/pdf',
    '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain',
  };
  return map[e] || 'application/octet-stream';
}
