import { AppError } from '../../common/errors/app-error.js';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

export class UnconfiguredSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    throw new AppError({
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'SMS provider is not configured',
    });
  }
}
