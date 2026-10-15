import { RequestBodyError } from '@/lib/security/requestBody';

export function validateAdminText(value: unknown, label: string, maxLength: number, required = false) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new RequestBodyError(`${label} 형식이 올바르지 않습니다.`);
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > maxLength) {
    throw new RequestBodyError(`${label}${required ? '은(는) 필수이며' : '은(는)'} ${maxLength}자 이하여야 합니다.`);
  }
  return text;
}

export function validateAdminId(value: unknown) {
  const id = validateAdminText(value, '대상 ID', 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new RequestBodyError('대상 ID 형식이 올바르지 않습니다.');
  }
  return id;
}

export function validateAdminInteger(value: unknown, label: string, min: number, max = 2147483647) {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !/^\d+$/.test(value.trim()))) {
    throw new RequestBodyError(`${label}은(는) ${min} 이상의 정수로 입력해 주세요.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RequestBodyError(`${label}은(는) ${min}~${max} 범위의 정수로 입력해 주세요.`);
  }
  return number;
}

export function validateAdminImages(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) throw new RequestBodyError('이미지는 최대 100개까지 등록할 수 있습니다.');
  return value.map((entry) => {
    const url = validateAdminText(entry, '이미지 주소', 2048, true);
    if (/[\\\u0000-\u001f\u007f]/.test(url)) throw new RequestBodyError('이미지 주소 형식이 올바르지 않습니다.');
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.toString();
    } catch { /* Reject malformed and active URL schemes. */ }
    throw new RequestBodyError('이미지에는 HTTPS 주소 또는 사이트 내부 경로만 사용할 수 있습니다.');
  });
}

export function validateAdminPublished(value: unknown) {
  if (typeof value !== 'boolean') throw new RequestBodyError('공개 여부를 선택해 주세요.');
  return value;
}

export function validateAdminDate(value: unknown) {
  const raw = validateAdminText(value, '출시일', 10);
  if (!raw) return null;
  const normalized = raw.replace(/[./]/g, '-');
  const date = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new RequestBodyError('출시일은 실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
  }
  return normalized;
}
