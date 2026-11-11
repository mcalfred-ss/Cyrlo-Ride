import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { env } from '../../config/env.js';
import {
  createPhoneOtpProvider,
  type PhoneOtpProvider,
} from '../../infrastructure/otp/phone-otp.provider.js';
import {
  createSmsProvider,
  smsOptionsFromEnv,
  type SmsProvider,
} from '../../infrastructure/sms/sms.provider.js';
import { AuthController } from './module.controller.js';
import { AuthRepository } from './module.repository.js';
import { createAuthRouter } from './module.routes.js';
import { AuthServiceImpl, type AuthService, type AuthServiceDeps } from './module.service.js';

export interface AuthModule {
  service: AuthService;
  router: Router;
}

export function createAuthModule(
  deps: ModuleDeps,
  options?: {
    sms?: SmsProvider;
    phoneOtp?: PhoneOtpProvider;
    serviceDeps?: Partial<AuthServiceDeps>;
  },
): AuthModule {
  const repository = new AuthRepository(deps.prisma);
  const sms = options?.sms ?? createSmsProvider(smsOptionsFromEnv(env));
  const phoneOtp =
    options?.phoneOtp ??
    createPhoneOtpProvider({
      smsProvider: env.SMS_PROVIDER,
      vynfyApiKey: env.VYNFY_API_KEY,
      vynfySenderId: env.VYNFY_SENDER_ID,
      sms,
    });
  const service = new AuthServiceImpl(repository, {
    phoneOtp,
    sms,
    ...options?.serviceDeps,
  });
  const controller = new AuthController(service);
  return { service, router: createAuthRouter(controller) };
}

export type { AuthService };
