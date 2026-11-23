import { describe, expect, it } from 'vitest';
import { crc16, promptPayPayload, promptPayTarget } from '@/lib/promptpay';

describe('PromptPay QR payload', () => {
  it('computes CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('turns a phone number into the 0066 form', () => {
    expect(promptPayTarget('081-234-5678')).toEqual({ tag: '01', value: '0066812345678' });
    expect(promptPayTarget('1234567890123')).toEqual({ tag: '02', value: '1234567890123' });
    expect(promptPayTarget('12345')).toBeNull();
  });

  it('builds a dynamic payload with the amount and a valid checksum', () => {
    const payload = promptPayPayload('0812345678', 59)!;
    expect(payload.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('29370016A000000677010111011300668123456785802TH5303764540559.00');
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16(body));
  });

  it('builds a static payload when no amount is given', () => {
    expect(promptPayPayload('0812345678')!.slice(0, 12)).toBe('000201010211');
  });
});
