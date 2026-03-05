import crypto from 'crypto';

const R2_BUCKET = 'product-images';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim() || '';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() || '';
  const publicBaseUrl = trimTrailingSlash(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim() || '');

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

export function buildR2PublicUrl(config: R2Config, objectKey: string) {
  return `${config.publicBaseUrl}/${objectKey}`;
}

function sha256Hex(input: string | Uint8Array) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export async function uploadToR2(params: {
  objectKey: string;
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
}) {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      'R2 config is missing. CLOUDFLARE_R2_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_SECRET_ACCESS_KEY / CLOUDFLARE_R2_PUBLIC_BASE_URL 확인 필요',
    );
  }

  const region = 'auto';
  const service = 's3';
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const method = 'PUT';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = params.objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const canonicalUri = `/${R2_BUCKET}/${encodedKey}`;
  const payloadHash = sha256Hex(params.body);

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
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
    '\n',
  );

  const signingKey = getSigningKey(config.secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const uploadUrl = `https://${host}${canonicalUri}`;
  const response = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'content-type': params.contentType || 'application/octet-stream',
      'cache-control': params.cacheControl || 'public, max-age=31536000, immutable',
    },
    body: params.body as unknown as BodyInit,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`R2 업로드 실패(${response.status}): ${errorText.slice(0, 200)}`);
  }

  return buildR2PublicUrl(config, params.objectKey);
}
