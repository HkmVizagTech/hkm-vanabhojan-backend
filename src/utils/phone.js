/**
 * Indian WhatsApp numbers are stored as 91XXXXXXXXXX. Accepts 10 digits or 91 + 10 digits
 * (with any punctuation) and returns the stored form, or null when it is not a valid number.
 */
function normalizePhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  if (/^91\d{10}$/.test(digits)) return digits;
  return null;
}

module.exports = { normalizePhone };
