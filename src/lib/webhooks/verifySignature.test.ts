/**
 * verifySignature.test.ts
 * Covers the WhatsApp HMAC path — pure crypto, no network or DB.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { verifyWhatsAppSignature } from './verifySignature';

const SECRET = 'test-app-secret';
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyWhatsAppSignature', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a correctly signed body', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    expect(verifyWhatsAppSignature(BODY, sign(BODY))).toEqual({ valid: true });
  });

  it('rejects a body that was altered after signing', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    const tampered = JSON.stringify({ object: 'whatsapp_business_account', entry: ['injected'] });
    expect(verifyWhatsAppSignature(tampered, sign(BODY)).valid).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    expect(verifyWhatsAppSignature(BODY, sign(BODY, 'attacker-secret')).valid).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    expect(verifyWhatsAppSignature(BODY, null).valid).toBe(false);
    expect(verifyWhatsAppSignature(BODY, 'deadbeef').valid).toBe(false);
  });

  it('rejects a truncated signature rather than throwing', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    const short = sign(BODY).slice(0, 20);
    expect(verifyWhatsAppSignature(BODY, short).valid).toBe(false);
  });

  it('refuses unsigned deliveries in production when no secret is configured', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(verifyWhatsAppSignature(BODY, null).valid).toBe(false);
  });

  it('allows unsigned deliveries in development when no secret is configured', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(verifyWhatsAppSignature(BODY, null)).toEqual({ valid: true });
  });
});
