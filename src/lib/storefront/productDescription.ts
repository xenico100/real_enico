function normalizeTextBlock(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : '';
}

function getTextComparisonKey(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isPlaceholderDescription(value: string, title?: string | null) {
  const normalizedValue = getTextComparisonKey(value);
  if (!normalizedValue) {
    return true;
  }

  const normalizedTitle = getTextComparisonKey(title || '');
  if (!normalizedTitle) {
    return false;
  }

  return (
    normalizedValue === normalizedTitle ||
    normalizedValue === `${normalizedTitle} 상세 페이지`
  );
}

export function buildUnifiedProductDescription(
  values: Array<string | null | undefined>,
  options?: { title?: string | null },
) {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const rawValue of values) {
    const value = normalizeTextBlock(rawValue);
    if (isPlaceholderDescription(value, options?.title)) {
      continue;
    }

    const comparisonKey = getTextComparisonKey(value);
    if (seen.has(comparisonKey)) {
      continue;
    }

    seen.add(comparisonKey);
    blocks.push(value);
  }

  return blocks.join('\n\n');
}
