#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);
const DEFAULT_THUMBNAIL_DIR = '썸네일용';
const DEFAULT_DETAIL_DIR = '상세보기용';
const DEFAULT_CURRENCY = 'KRW';
const DEFAULT_R2_BUCKET = 'product-images';

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return args;
}

function stripMatchingQuotes(value) {
  if (!value) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvFile(envFilePath) {
  if (!envFilePath) return;

  const raw = await fs.readFile(envFilePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripMatchingQuotes(trimmed.slice(separatorIndex + 1).trim());
    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
}

function requireArg(args, key) {
  const value = args.get(key)?.trim();
  if (!value) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function toSlug(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'"`“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function sanitizeFileStem(filePath) {
  const stem = path.basename(filePath, path.extname(filePath));
  const slug = toSlug(stem);
  return slug || 'image';
}

function getImageIdentity(filePath) {
  return sanitizeFileStem(filePath).replace(/^\d+-/, '');
}

function mimeTypeFromExt(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.avif') return 'image/avif';
  if (extension === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

async function listImageFiles(targetDirectory) {
  const entries = await fs.readdir(targetDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(targetDirectory, entry.name))
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((left, right) =>
      left.localeCompare(right, 'ko', { numeric: true, sensitivity: 'base' }),
    );
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function uploadToR2({ objectKey, body, contentType }) {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = trimTrailingSlash(
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim() || '',
  );

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error('Missing Cloudflare R2 env vars for upload');
  }

  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const method = 'PUT';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const canonicalUri = `/${DEFAULT_R2_BUCKET}/${encodedKey}`;
  const payloadHash = sha256Hex(body);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'content-type': contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }

  return `${publicBaseUrl}/${objectKey}`;
}

async function readDescriptionFile(descriptionFilePath) {
  if (!descriptionFilePath) return '';

  if (path.extname(descriptionFilePath).toLowerCase() === '.rtf') {
    const result = spawnSync('textutil', ['-convert', 'txt', '-stdout', descriptionFilePath], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || 'Failed to convert RTF description');
    }
    return result.stdout.trim();
  }

  return (await fs.readFile(descriptionFilePath, 'utf8')).trim();
}

async function getSupportedColumns(supabase) {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    throw new Error(`Failed to inspect products table: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    return new Set([
      'title',
      'description',
      'price',
      'currency',
      'images',
      'is_published',
      'created_at',
      'updated_at',
      'specs',
      'thumbnail_url',
      'category',
      'raw',
      'source',
    ]);
  }

  return new Set(Object.keys(row));
}

function buildPayload({
  columns,
  title,
  description,
  price,
  category,
  images,
  published,
}) {
  const now = new Date().toISOString();
  const payload = {};

  if (columns.has('title')) payload.title = title;
  if (columns.has('description')) payload.description = description || null;
  if (columns.has('specs')) payload.specs = null;
  if (columns.has('price')) payload.price = price;
  if (columns.has('currency')) payload.currency = DEFAULT_CURRENCY;
  if (columns.has('images')) payload.images = images;
  if (columns.has('thumbnail_url')) payload.thumbnail_url = images[0] || null;
  if (columns.has('category') && category) payload.category = category;
  if (columns.has('is_published')) payload.is_published = published;
  if (columns.has('updated_at')) payload.updated_at = now;
  if (columns.has('created_at')) payload.created_at = now;
  if (columns.has('source')) payload.source = 'manual';
  if (columns.has('raw')) {
    payload.raw = {
      source: 'manual-folder-publish',
      orderedImages: images,
    };
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile(args.get('env-file'));

  const title = requireArg(args, 'title');
  const price = Number.parseInt(requireArg(args, 'price'), 10);
  if (!Number.isFinite(price)) {
    throw new Error('Price must be an integer');
  }

  const productDir = path.resolve(requireArg(args, 'product-dir'));
  const thumbnailDir = path.join(productDir, args.get('thumbnail-dir') || DEFAULT_THUMBNAIL_DIR);
  const detailDir = path.join(productDir, args.get('detail-dir') || DEFAULT_DETAIL_DIR);
  const category = args.get('category')?.trim() || '';
  const storagePrefix = requireArg(args, 'storage-prefix');
  const published = (args.get('published') || 'true').trim().toLowerCase() !== 'false';

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase env vars for publish');
  }

  const thumbnailFiles = await listImageFiles(thumbnailDir);
  if (thumbnailFiles.length === 0) {
    throw new Error(`No thumbnail image found in ${thumbnailDir}`);
  }

  const detailFiles = await listImageFiles(detailDir);
  if (detailFiles.length === 0) {
    throw new Error(`No detail images found in ${detailDir}`);
  }

  const description =
    args.get('description')?.trim() ||
    (await readDescriptionFile(args.get('description-file')?.trim()));

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const productSlug = toSlug(title) || crypto.randomUUID();
  const thumbnailIdentity = getImageIdentity(thumbnailFiles[0]);
  const orderedLocalFiles = [
    thumbnailFiles[0],
    ...detailFiles.filter((filePath, index) => {
      if (index !== 0) return true;
      return getImageIdentity(filePath) !== thumbnailIdentity;
    }),
  ];
  const uploadedUrls = [];

  for (let index = 0; index < orderedLocalFiles.length; index += 1) {
    const filePath = orderedLocalFiles[index];
    const extension = path.extname(filePath).toLowerCase() || '.png';
    const fileName = `${String(index + 1).padStart(2, '0')}-${sanitizeFileStem(filePath)}${extension}`;
    const objectKey = `manual-upload/${storagePrefix}/${productSlug}/${fileName}`;
    const body = await fs.readFile(filePath);
    console.log(`[upload ${index + 1}/${orderedLocalFiles.length}] ${path.basename(filePath)}`);
    const uploadedUrl = await uploadToR2({
      objectKey,
      body,
      contentType: mimeTypeFromExt(filePath),
    });
    uploadedUrls.push(uploadedUrl);
  }

  const columns = await getSupportedColumns(supabase);
  const basePayload = buildPayload({
    columns,
    title,
    description,
    price,
    category,
    images: uploadedUrls,
    published,
  });

  const { data: existingRows, error: existingError } = await supabase
    .from('products')
    .select('id,title,updated_at')
    .eq('title', title)
    .order('updated_at', { ascending: false });

  if (existingError) {
    throw new Error(`Failed to check existing product: ${existingError.message}`);
  }

  const existing = existingRows?.[0];
  const duplicates = existingRows?.slice(1) ?? [];
  if (existing) {
    const updatePayload = { ...basePayload };
    delete updatePayload.created_at;

    const { data, error } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('id,title,updated_at')
      .single();

    if (error) {
      throw new Error(`Failed to update product: ${error.message}`);
    }

    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map((item) => item.id);
      const { error: deleteError } = await supabase.from('products').delete().in('id', duplicateIds);
      if (deleteError) {
        throw new Error(`Failed to remove duplicate products: ${deleteError.message}`);
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: 'updated',
          product: data,
          imageCount: uploadedUrls.length,
          removedDuplicateIds: duplicates.map((item) => item.id),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .insert(basePayload)
    .select('id,title,updated_at')
    .single();

  if (error) {
    throw new Error(`Failed to insert product: ${error.message}`);
  }

  console.log(JSON.stringify({ mode: 'inserted', product: data, imageCount: uploadedUrls.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
