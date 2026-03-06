export function parseOrderRawPayload(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function extractPaymentReceiptUrl(value: unknown) {
  const rawPayload = parseOrderRawPayload(value);
  if (!rawPayload) return '';

  const candidates = [
    rawPayload.paymentReceiptUrl,
    rawPayload.transferReceiptUrl,
    rawPayload.receiptImageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}
