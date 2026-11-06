import type { AdminService } from './module.service.js';

export class AdminController {
  constructor(private readonly service: AdminService) {}
}
