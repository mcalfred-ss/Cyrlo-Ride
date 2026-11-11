import { AppError } from '../../common/errors/app-error.js';
import type { SmsProvider } from '../sms/sms.provider.js';
import { VynfyOtpProvider } from './vynfy-otp.provider.js';

/** Marker hashed into otp_challenges when a remote provider owns the code. */
export const REMOTE_OTP_PLACEHOLDER = '__REMOTE_OTP_PROVIDER__';

export interface PhoneOtpRequestInput {
  phoneNumber: string;
  /** Required for local SMS-backed delivery; ignored by remote providers. */
  localCode?: string;
  expiryMinutes: number;
  length: number;
}

export type PhoneOtpRequestResult =
  | { mode: 'local'; code: string }
  | { mode: 'remote'; providerOtpId: string };

export interface PhoneOtpProvider {
  request(input: PhoneOtpRequestInput): Promise<PhoneOtpRequestResult>;
  /**
   * Present when codes are generated/verified by the vendor (Vynfy OTP API).
   * Absent for local SMS-backed OTPs where we hash and check the code ourselves.
   */
  verifyRemote?(input: { phoneNumber: string; code: string }): Promise<void>;
  describe?(): { configured: boolean; adapter: string; ready: boolean; mode: 'local' | 'remote' };
}

/**
 * Local OTP: we generate the code, deliver via SMS, verify by hash.
 * Used in development and whenever SMS_PROVIDER is not vynfy.
 */
export class SmsBackedPhoneOtpProvider implements PhoneOtpProvider {
  constructor(private readonly sms: SmsProvider) {}

  describe() {
    const sms = this.sms.describe?.() ?? { configured: true, adapter: 'sms', ready: true };
    return { ...sms, mode: 'local' as const };
  }

  async request(input: PhoneOtpRequestInput): Promise<PhoneOtpRequestResult> {
    const code = input.localCode?.trim();
    if (!code) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Local OTP delivery requires a generated code',
      });
    }
    await this.sms.send({
      to: input.phoneNumber,
      body: `Your Cyrlo Ride code is ${code}. It expires in ${input.expiryMinutes} minutes.`,
    });
    return { mode: 'local', code };
  }
}

export interface CreatePhoneOtpProviderOptions {
  /** When `vynfy`, use Vynfy OTP generate/verify APIs instead of SMS-with-our-code. */
  smsProvider: string;
  vynfyApiKey: string;
  vynfySenderId: string;
  sms: SmsProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Prefer Vynfy's dedicated OTP product when SMS_PROVIDER=vynfy.
 * Otherwise fall back to generating codes locally and sending via SMS.
 */
export function createPhoneOtpProvider(options: CreatePhoneOtpProviderOptions): PhoneOtpProvider {
  const provider = options.smsProvider.trim().toLowerCase();
  if (provider === 'vynfy') {
    const apiKey = options.vynfyApiKey.trim();
    const senderId = options.vynfySenderId.trim();
    if (apiKey && senderId) {
      return new VynfyOtpProvider({
        apiKey,
        senderId,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
    }
  }
  return new SmsBackedPhoneOtpProvider(options.sms);
}
