export function validatedImageExtension(bytes: Uint8Array, declaredType: string): string | null {
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.slice(offset, offset + count));
  const matches = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (declaredType === 'image/jpeg' && matches([255, 216, 255])) return 'jpg';
  if (declaredType === 'image/png' && matches([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
  if (declaredType === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (declaredType === 'image/gif' && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'gif';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (declaredType === 'image/avif' && ['avif', 'avis'].includes(brand)) return 'avif';
    if (['image/heic', 'image/heif'].includes(declaredType) && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return declaredType === 'image/heic' ? 'heic' : 'heif';
  }
  return null;
}
