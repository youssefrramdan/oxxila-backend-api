// src/utils/phoneNumber.js

export function parsePhoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Build WhatsApp international digits (no +) from a national/local number and dial code.
 * Supports full international input (+… / 00…) without relying on a fixed country.
 */
export function normalizeWhatsAppPhoneDigits(phone, dialCode = '20') {
  const raw = String(phone ?? '').trim();
  let digits = parsePhoneDigits(phone);
  const dial = parsePhoneDigits(dialCode);

  if (!digits) return '';

  if (raw.startsWith('+') || raw.startsWith('00')) {
    if (raw.startsWith('00')) digits = digits.slice(2);
    if (digits.length >= 8 && digits.length <= 15) return digits;
  }

  if (dial && digits.startsWith(dial) && digits.length > dial.length + 5) {
    return digits;
  }

  if (digits.startsWith('0')) digits = digits.slice(1);

  if (!dial) return digits;
  return `${dial}${digits}`;
}

export function validateWhatsAppPhone(phone, dialCode = '20') {
  const trimmed = String(phone ?? '').trim();
  if (!trimmed) return { ok: true, normalized: '' };

  const dial = parsePhoneDigits(dialCode);
  if (dial && (dial.length < 1 || dial.length > 4)) {
    return { ok: false, message: 'WhatsApp country code must be 1–4 digits' };
  }

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    return { ok: false, message: 'WhatsApp must be a valid phone number' };
  }

  const normalized = normalizeWhatsAppPhoneDigits(trimmed, dial);
  if (!normalized || normalized.length < 8 || normalized.length > 15) {
    return {
      ok: false,
      message: 'WhatsApp number must be 8–15 digits in international format',
    };
  }

  return { ok: true, normalized };
}
