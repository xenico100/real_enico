import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function normalizeTransactionId(value: unknown) {
  if (typeof value !== 'string') return 'manual';
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-');
  return normalized || 'manual';
}

function getFileExtension(type: string, fileName: string) {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'image/jpeg') return 'jpg';
  if (normalizedType === 'image/png') return 'png';
  if (normalizedType === 'image/webp') return 'webp';
  if (normalizedType === 'image/heic') return 'heic';
  if (normalizedType === 'image/heif') return 'heif';

  const fallback = fileName.split('.').pop()?.trim().toLowerCase();
  return fallback || 'bin';
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const transactionId = normalizeTransactionId(formData.get('transactionId'));

    if (!(file instanceof File)) {
      return NextResponse.json({ message: '업로드할 이미지 파일이 없습니다.' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: 'JPG, PNG, WEBP, HEIC 이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { message: '이체확인 이미지는 8MB 이하로 업로드해 주세요.' },
        { status: 400 },
      );
    }

    const objectKey = [
      'payment-receipts',
      transactionId,
      `${Date.now()}-${crypto.randomUUID()}.${getFileExtension(file.type, file.name)}`,
    ].join('/');

    const buffer = new Uint8Array(await file.arrayBuffer());
    const receiptUrl = await uploadToR2({
      objectKey,
      body: buffer,
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    return NextResponse.json({
      ok: true,
      receiptUrl,
      objectKey,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : '이체확인 이미지 업로드 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
