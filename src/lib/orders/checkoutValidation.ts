// Shared by the checkout UI and every order entry point.
export const CHECKOUT_ADDRESS_MAX_LENGTH = 500;
export const CHECKOUT_PHONE_MAX_LENGTH = 50;

export function isValidCheckoutEmail(value: string) {
  const email = value.trim();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCheckoutPhone(value: string, country: string) {
  const phone = value.trim();
  if (!phone || phone.length > CHECKOUT_PHONE_MAX_LENGTH || !/^\+?[0-9(][0-9\s().-]*$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  // International numbers may include a country calling code (E.164: at most 15 digits).
  if (phone.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits);
  if (country === '대한민국') return /^0\d{8,10}$/.test(digits);
  if (country === '미국' || country === '캐나다') return /^(?:1)?[2-9]\d{9}$/.test(digits);
  if (country === '일본') return /^0\d{9,10}$/.test(digits);
  if (country === '호주') return /^0\d{9}$/.test(digits);
  return /^\d{8,15}$/.test(digits);
}
