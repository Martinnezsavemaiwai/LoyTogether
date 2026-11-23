/**
 * Thai QR (PromptPay) payload, EMVCo merchant-presented format. The QR goes straight
 * to the owner's PromptPay: no gateway, no fee, and no way for the site to confirm
 * that a payment happened. The payer's banking app shows the account name before
 * they confirm.
 */

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE, as required by EMVCo tag 63. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Phone (10 digits, 0x...), national or tax ID (13 digits) or e-wallet ID (15 digits). */
export function promptPayTarget(id: string): { tag: '01' | '02' | '03'; value: string } | null {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return { tag: '01', value: `0066${digits.slice(1)}` };
  if (digits.length === 13) return { tag: '02', value: digits };
  if (digits.length === 15) return { tag: '03', value: digits };
  return null;
}

export function promptPayPayload(id: string, amount?: number): string | null {
  const target = promptPayTarget(id);
  if (!target) return null;
  const hasAmount = typeof amount === 'number' && amount > 0;
  const account = tlv('00', 'A000000677010111') + tlv(target.tag, target.value);
  let payload =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('29', account) +
    tlv('58', 'TH') +
    tlv('53', '764') +
    (hasAmount ? tlv('54', amount.toFixed(2)) : '');
  payload += '6304';
  return payload + crc16(payload);
}

const configuredId = (import.meta.env.VITE_PROMPTPAY_ID as string | undefined) ?? '';

/** The owner's PromptPay ID, or null when the feature is switched off. */
export const PROMPTPAY_ID: string | null = promptPayTarget(configuredId) ? configuredId : null;
export const PROMPTPAY_NAME = ((import.meta.env.VITE_PROMPTPAY_NAME as string | undefined) ?? '').trim();

export const TIP_PRESETS = [9, 19, 39, 59, 99];
export const TIP_MAX = 10000;
