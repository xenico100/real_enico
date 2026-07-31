import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';
import {
  authenticateOrderRequest,
  getOrderErrorStatus,
  normalizeTransactionId,
  OrderValidationError,
} from '@/lib/orders/serverOrderValidation';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

type DetectedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heif-family';

function startsWithBytes(buffer: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function asciiAt(buffer: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...buffer.slice(start, start + length));
}

function detectImageType(buffer: Uint8Array): DetectedImageType | null {
  if (buffer.length >= 3 && startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'image/png';
  }
  if (buffer.length >= 12 && asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 12 && asciiAt(buffer, 4, 4) === 'ftyp') {
    const brand = asciiAt(buffer, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heif-family';
    }
  }
  return null;
}

function declaredTypeMatchesSignature(declaredType: string, detectedType: DetectedImageType) {
  if (detectedType === 'image/heif-family') {
    return declaredType === 'image/heic' || declaredType === 'image/heif';
  }
  return declaredType === detectedType;
}

function getFileExtension(type: string) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic') return 'heic';
  return 'heif';
}

export async function POST(request: Request) {
  try {
    if (process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED !== 'true') {
      return NextResponse.json({ message: '이체확인 이미지 업로드가 비활성화되어 있습니다.' }, { status: 404 });
    }

    const authentication = await authenticateOrderRequest(request, 'member');
    if (!authentication.user) {
      throw new OrderValidationError('로그인한 회원만 이체확인 이미지를 업로드할 수 있습니다.', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const transactionId = normalizeTransactionId(formData.get('transactionId'));

    if (!(file instanceof File)) {
      throw new OrderValidationError('업로드할 이미지 파일이 없습니다.');
    }

    const declaredType = file.type.toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(declaredType)) {
      throw new OrderValidationError('JPG, PNG, WEBP, HEIC 이미지 파일만 업로드할 수 있습니다.');
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      throw new OrderValidationError('이체확인 이미지는 8MB 이하로 업로드해 주세요.');
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detectedType = detectImageType(buffer);
    if (!detectedType || !declaredTypeMatchesSignature(declaredType, detectedType)) {
      throw new OrderValidationError('파일 내용과 이미지 형식이 일치하지 않습니다.');
    }

    const objectKey = [
      'payment-receipts',
      authentication.user.id,
      transactionId,
      `${Date.now()}-${crypto.randomUUID()}.${getFileExtension(declaredType)}`,
    ].join('/');
    const receiptUrl = await uploadToR2({
      objectKey,
      body: buffer,
      contentType: declaredType,
      cacheControl: 'private, no-store',
    });

    return NextResponse.json({
      ok: true,
      receiptUrl,
      objectKey,
    });
  } catch (error) {
    if (!(error instanceof OrderValidationError)) {
      console.error('Receipt upload failed', error);
    }
    return NextResponse.json(
      {
        message:
          error instanceof OrderValidationError
            ? error.message
            : '이체확인 이미지 업로드 중 오류가 발생했습니다.',
      },
      { status: getOrderErrorStatus(error) },
    );
  }
}
