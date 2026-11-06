import type { MatchingService } from './module.service.js';

export class MatchingController {
  constructor(private readonly service: MatchingService) {}
}
