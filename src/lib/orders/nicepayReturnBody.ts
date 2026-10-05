export const NICEPAY_RETURN_BODY_MAX_BYTES = 16 * 1024;

export class NicepayReturnBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NicepayReturnBodyError';
  }
}

export async function readNicepayReturnBody(
  request: Request,
  maxBytes = NICEPAY_RETURN_BODY_MAX_BYTES,
) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
      throw new NicepayReturnBodyError('NICE 인증 응답 본문 크기가 올바르지 않습니다.');
    }
  }

  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new NicepayReturnBodyError('NICE 인증 응답 본문 형식이 올바르지 않습니다.');
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new NicepayReturnBodyError('NICE 인증 응답 본문이 너무 큽니다.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
