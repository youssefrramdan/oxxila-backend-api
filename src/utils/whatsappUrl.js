// src/utils/whatsappUrl.js
import { normalizeWhatsAppPhoneDigits } from './phoneNumber.js';

/** Deep link that opens a chat with `phone` (international digits, no +). */
export function buildWhatsAppUrl(phone, dialCode = '20') {
  const digits = normalizeWhatsAppPhoneDigits(phone, dialCode);
  if (!digits) return '';
  return `https://api.whatsapp.com/send?phone=${digits}`;
}
