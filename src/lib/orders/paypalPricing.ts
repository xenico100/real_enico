export type SupportedPayPalCurrency = 'KRW' | 'USD';

export const DEFAULT_PAYPAL_KRW_PER_USD = 1350;

export function normalizePayPalCurrency(value: string | undefined): SupportedPayPalCurrency {
  return value?.trim().toUpperCase() === 'KRW' ? 'KRW' : 'USD';
}

export function normalizeKrwPerUsd(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 10_000
    ? parsed
    : DEFAULT_PAYPAL_KRW_PER_USD;
}

export function getPayPalOrderAmount(
  totalKrw: number,
  currency: SupportedPayPalCurrency,
  krwPerUsd = DEFAULT_PAYPAL_KRW_PER_USD,
) {
  const safeTotal = Math.max(1, Math.round(totalKrw));
  if (currency === 'KRW') return safeTotal.toString();

  const rate = normalizeKrwPerUsd(krwPerUsd);
  return Math.max(0.01, Math.round((safeTotal / rate) * 100) / 100).toFixed(2);
}
