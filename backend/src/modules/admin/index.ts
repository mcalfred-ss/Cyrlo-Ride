import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { env } from '../../config/env.js';
import {
  createSmsProvider,
  type SmsProvider,
} from '../../infrastructure/sms/sms.provider.js';
import type { AuditService } from '../audit/module.service.js';
import { AdminController } from './module.controller.js';
import { AdminRepository } from './module.repository.js';
import { createAdminRouter } from './module.routes.js';
import { AdminServiceImpl, type AdminService, type AdminServiceDeps } from './module.service.js';

export interface AdminModule {
  service: AdminService;
  router: Router;
}

export function createAdminModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { sms?: SmsProvider; serviceDeps?: Partial<AdminServiceDeps> },
): AdminModule {
  const repository = new AdminRepository(deps.prisma);
  const sms =
    options?.sms ??
    createSmsProvider({
      provider: env.SMS_PROVIDER,
      apiKey: env.SMS_API_KEY,
      nodeEnv: env.NODE_ENV,
    });
  const service = new AdminServiceImpl(repository, {
    sms,
    audit: deps.audit,
    prisma: deps.prisma,
    ...options?.serviceDeps,
  });
  const controller = new AdminController(service);
  return { service, router: createAdminRouter(controller) };
}

export type { AdminService };
