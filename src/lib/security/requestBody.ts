export class RequestBodyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function readBoundedBody(request: Request, maxBytes: number) {
  if (!request.body) throw new RequestBodyError('잘못된 요청 본문입니다.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError('요청 본문이 너무 큽니다.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJsonObject(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, maxBytes);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestBodyError('잘못된 요청 본문입니다.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('잘못된 요청 본문입니다.');
  return body as Record<string, unknown>;
}

export async function readFormData(request: Request, maxBytes: number) {
  const bytes = await readBoundedBody(request, maxBytes);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  try {
    return await new Request(request.url, { method: 'POST', headers, body: bytes as BodyInit }).formData();
  } catch {
    throw new RequestBodyError('업로드 요청 형식이 올바르지 않습니다.');
  }
}
