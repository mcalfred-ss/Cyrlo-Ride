import { AppError } from '../../common/errors/app-error.js';

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  send(message: PushMessage): Promise<void>;
}

export class UnconfiguredPushProvider implements PushProvider {
  async send(): Promise<void> {
    throw new AppError({
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Push provider is not configured',
    });
  }
}
